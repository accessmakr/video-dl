'use strict';
const { spawn } = require('child_process');
const fs        = require('fs');

const AUDIO_FORMATS = {
  mp3:  { codec: 'libmp3lame', lossless: false },
  m4a:  { codec: 'aac',        lossless: false, extra: ['-movflags','+faststart'] },
  aac:  { codec: 'aac',        lossless: false },
  wav:  { codec: 'pcm_s16le',  lossless: true  },
  flac: { codec: 'flac',       lossless: true  },
  ogg:  { codec: 'libvorbis',  lossless: false },
};

/** Check file has at least one audio stream. Returns Promise<boolean> */
function probeAudioStream(inputPath) {
  return new Promise(resolve => {
    const p = spawn('ffprobe',['-v','error','-select_streams','a','-show_entries','stream=codec_type','-of','json',inputPath]);
    let out = '';
    p.stdout.on('data', d => out += d.toString());
    p.on('close', () => { try { resolve(JSON.parse(out).streams?.length > 0); } catch { resolve(false); } });
    p.on('error', () => resolve(false));
  });
}

/** Get video width + height. Returns Promise<{width,height}> */
function probeVideoDimensions(inputPath) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe',['-v','quiet','-print_format','json','-show_streams','-select_streams','v:0',inputPath]);
    let out = '';
    p.stdout.on('data', d => out += d.toString());
    p.on('close', code => {
      if (code !== 0) return reject(new Error('ffprobe failed'));
      try { const s = JSON.parse(out).streams[0]; resolve({ width: s.width, height: s.height }); }
      catch(e) { reject(e); }
    });
    p.on('error', reject);
  });
}

/** Get duration in seconds. Returns Promise<number> */
function probeDuration(inputPath) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe',['-v','error','-show_entries','format=duration','-of','json',inputPath]);
    let out = '';
    p.stdout.on('data', d => out += d.toString());
    p.on('close', code => {
      if (code !== 0) return reject(new Error('ffprobe duration failed'));
      try { resolve(parseFloat(JSON.parse(out).format.duration)); } catch(e) { reject(e); }
    });
    p.on('error', reject);
  });
}

/** Build -af filter string from advanced params. Returns string or null. */
function buildAudioFilters({ volume=100, fadeIn=0, fadeOut=0, reverse=false, duration=null }) {
  const f = [];
  if (volume !== 100)              f.push(`volume=${(volume/100).toFixed(2)}`);
  if (fadeIn > 0)                  f.push(`afade=t=in:st=0:d=${fadeIn}`);
  if (fadeOut > 0 && duration > 0) f.push(`afade=t=out:st=${Math.max(0,duration-fadeOut).toFixed(3)}:d=${fadeOut}`);
  if (reverse)                     f.push('areverse');
  return f.length ? f.join(',') : null;
}

/** Run FFmpeg progress — shared helper */
function _run(args, onProgress) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', args);
    let dur = null, last = 0, errBuf = '';
    ff.stderr.on('data', c => {
      const t = c.toString();
      errBuf = (errBuf + t).slice(-3000);
      if (!dur) { const m = t.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/); if (m) dur = +m[1]*3600 + +m[2]*60 + parseFloat(m[3]); }
      if (dur > 0) {
        const x = t.match(/time=\s*(\d+):(\d+):(\d+\.?\d*)/);
        if (x) {
          const cur = +x[1]*3600 + +x[2]*60 + parseFloat(x[3]);
          const pct = Math.min(99, Math.round((cur/dur)*100));
          if (pct !== last) { last = pct; onProgress({ progress: pct, eta: cur>0 ? Math.round((dur-cur)/(cur/dur)) : null }); }
        }
      }
    });
    ff.on('close',  code => code === 0 ? resolve() : reject(new Error(`FFmpeg exited ${code}: ${errBuf.slice(-400)}`)));
    ff.on('error',  err  => reject(new Error(`FFmpeg spawn: ${err.message}`)));
  });
}

/**
 * Audio extraction — standard or advanced (trim/volume/fade/reverse/codec).
 * NOTE: -vn is NOT used with -map 0:a:0 (FFmpeg 8.x conflict → exit 234).
 */
async function runAudioFFmpeg(inputPath, outputPath, format, qualityKbps, advanced={}, onProgress) {
  const { codec, lossless, extra=[] } = AUDIO_FORMATS[format];
  const { trimStart, trimEnd, codecMode='auto' } = advanced;

  // Resolve fade-out duration if needed
  let duration = null;
  if (advanced.fadeOut > 0) {
    try { duration = await probeDuration(inputPath); } catch {}
  }

  const args = [];
  if (trimStart && trimStart !== '00:00:00') args.push('-ss', trimStart);
  args.push('-i', inputPath);
  if (trimEnd   && trimEnd   !== '00:00:00') args.push('-to', trimEnd);
  args.push('-map', '0:a:0');

  if (codecMode === 'copy') {
    args.push('-acodec', 'copy');
  } else {
    args.push('-acodec', codec);
    if (!lossless) args.push('-b:a', `${qualityKbps}k`);
    const af = buildAudioFilters({ ...advanced, duration });
    if (af) args.push('-af', af);
  }

  args.push(...extra, '-y', outputPath);
  return _run(args, onProgress);
}

const VIDEO_CODECS = {
  mp4: ['-c:v','libx264','-c:a','aac'],
  mkv: ['-c:v','libx264','-c:a','aac'],
  webm:['-c:v','libvpx-vp9','-c:a','libopus'],
  avi: ['-c:v','libxvid','-c:a','mp3'],
  mov: ['-c:v','libx264','-c:a','aac','-movflags','+faststart'],
  wmv: ['-c:v','wmv2','-c:a','wmav2'],
  flv: ['-c:v','libx264','-c:a','aac'],
  '3gp':['-c:v','libx264','-c:a','aac','-vf','scale=320:-2'],
};

const CRF_MAP = { high: '18', medium: '23', low: '30' };

function runVideoConvertFFmpeg(inputPath, outputPath, format, quality, onProgress) {
  const codecArgs = VIDEO_CODECS[format] || VIDEO_CODECS.mp4;
  const crf = CRF_MAP[quality] || '23';
  return _run(['-i',inputPath,...codecArgs,'-crf',crf,'-preset','fast','-y',outputPath], onProgress);
}

function runVideoCompressFFmpeg(inputPath, outputPath, quality, onProgress) {
  const crf = CRF_MAP[quality] || '28';
  return _run(['-i',inputPath,'-c:v','libx264','-crf',crf,'-preset','fast','-c:a','aac','-b:a','128k','-movflags','+faststart','-y',outputPath], onProgress);
}

function runVideoTrimFFmpeg(inputPath, outputPath, startTime, endTime, onProgress) {
  return _run(['-ss',startTime,'-i',inputPath,'-to',endTime,'-c','copy','-avoid_negative_ts','make_zero','-y',outputPath], onProgress);
}

async function runVideoToGifFFmpeg(inputPath, outputPath, { fps=10, width=480, startTime=null, duration:dur=null }, onProgress) {
  const palettePath = outputPath.replace('.gif','_pal.png');
  const scale = `fps=${fps},scale=${width}:-1:flags=lanczos`;
  const seek  = startTime ? ['-ss',startTime] : [];
  const durA  = dur       ? ['-t',String(dur)] : [];

  await new Promise((res,rej) => {
    const ff = spawn('ffmpeg',[...seek,'-i',inputPath,...durA,'-vf',`${scale},palettegen=stats_mode=diff`,'-y',palettePath]);
    ff.on('close',code => code===0?res():rej(new Error(`Palette gen failed (${code})`)));
    ff.on('error',rej);
  });
  onProgress({ progress: 50 });
  await new Promise((res,rej) => {
    const ff = spawn('ffmpeg',[...seek,'-i',inputPath,...durA,'-i',palettePath,
      '-filter_complex',`${scale}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,'-y',outputPath]);
    ff.on('close',code => code===0?res():rej(new Error(`GIF encode failed (${code})`)));
    ff.on('error',rej);
  });
  onProgress({ progress: 100 });
  if (fs.existsSync(palettePath)) try { fs.unlinkSync(palettePath); } catch {}
}

module.exports = {
  probeAudioStream, probeVideoDimensions, probeDuration,
  runAudioFFmpeg, runVideoConvertFFmpeg, runVideoCompressFFmpeg,
  runVideoTrimFFmpeg, runVideoToGifFFmpeg,
};
