/**
 * converter/server.js — v3
 *
 * Fixes in this version:
 *   1. Audio: explicit -map 0:a:0 and -b:a flag (via updated ffmpeg.js)
 *   2. Watermark: replaced delogo (not in Alpine ffmpeg) with
 *      crop+boxblur+overlay approach — works on ALL ffmpeg builds
 *      and gives a better visual result (smooth blur vs hard edge)
 */

const express      = require('express');
const cors         = require('cors');
const multer       = require('multer');
const rateLimit    = require('express-rate-limit');
const path         = require('path');
const fs           = require('fs');
const { spawn }    = require('child_process');
const { v4: uuid } = require('uuid');

const { createJob, getJob, updateJob } = require('./utils/jobs');
const { processJob }                    = require('./utils/queue');
const { scheduleCleanup }               = require('./utils/cleanup');

const app        = express();
const PORT       = process.env.PORT || 3001;
const UPLOAD_DIR = '/tmp/uploads';
const OUTPUT_DIR = '/tmp/outputs';

[UPLOAD_DIR, OUTPUT_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    const allowed = [process.env.FRONTEND_URL, 'http://localhost:5173'].filter(Boolean);
    if (!origin || allowed.some(o => origin.startsWith(o))) return cb(null, true);
    cb(new Error('CORS: origin not allowed'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
}));

app.use(express.json({ limit: '1mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { error: 'Too many requests. Please try again later.' },
});

// ── Multer ────────────────────────────────────────────────────────────────────
const ALLOWED_MIME = new Set([
  'video/mp4','video/quicktime','video/x-msvideo','video/webm','video/x-matroska',
  'video/3gpp','video/x-flv','video/x-ms-wmv',
  'audio/mpeg','audio/mp4','audio/wav','audio/ogg','audio/flac',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    ALLOWED_MIME.has(file.mimetype) ? cb(null, true) : cb(new Error(`Unsupported: ${file.mimetype}`));
  },
});

const VALID_FORMATS   = new Set(['mp3','m4a','aac','wav','flac','ogg']);
const VALID_QUALITIES = new Set(['64','128','192','256','320']);

// ── ffprobe: get video dimensions ─────────────────────────────────────────────
function getVideoDimensions(filePath) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe', [
      '-v','quiet','-print_format','json',
      '-show_streams','-select_streams','v:0', filePath,
    ]);
    let out = '';
    p.stdout.on('data', d => out += d.toString());
    p.on('close', code => {
      if (code !== 0) return reject(new Error('ffprobe failed'));
      try {
        const s = JSON.parse(out).streams[0];
        resolve({ width: s.width, height: s.height });
      } catch (e) { reject(e); }
    });
    p.on('error', reject);
  });
}

// ── FFmpeg progress parser ────────────────────────────────────────────────────
function parseProgress(text, duration) {
  if (!duration) return null;
  const t = text.match(/time=\s*(\d+):(\d+):(\d+\.?\d*)/);
  if (!t) return null;
  const cur = +t[1]*3600 + +t[2]*60 + parseFloat(t[3]);
  return Math.min(99, Math.round((cur / duration) * 100));
}

function parseDuration(text) {
  const m = text.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
  if (!m) return null;
  return +m[1]*3600 + +m[2]*60 + parseFloat(m[3]);
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, service: 'audio-converter' }));

// ── POST /jobs — Audio conversion ─────────────────────────────────────────────
app.post('/jobs', limiter, upload.single('file'), (req, res) => {
  try {
    const format  = (req.body.format  || 'mp3').toLowerCase();
    const quality = String(req.body.quality || '128');
    if (!VALID_FORMATS.has(format))    return res.status(400).json({ error: 'Invalid format.'  });
    if (!VALID_QUALITIES.has(quality)) return res.status(400).json({ error: 'Invalid quality.' });

    const file = req.file;
    const url  = req.body.url?.trim();
    if (!file && !url) return res.status(400).json({ error: 'Provide a file or url.' });

    const jobId      = uuid();
    const outputPath = path.join(OUTPUT_DIR, `${jobId}.${format}`);
    const baseName   = req.body.filename
      || (file ? path.basename(file.originalname, path.extname(file.originalname)) : 'audio');

    createJob(jobId, {
      status: 'queued', statusText: 'Queued…', progress: 0, eta: null,
      format, quality,
      inputPath: file?.path || null,
      inputUrl:  url  || null,
      outputPath,
      filename: `${baseName}.${format}`,
      fileSizeBytes: null, error: null, createdAt: Date.now(),
    });

    processJob(jobId);
    res.json({ jobId, status: 'queued' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /jobs/:id ─────────────────────────────────────────────────────────────
app.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found or expired.' });
  const { inputPath, outputPath, inputUrl, ...safe } = job;
  res.json({ ...safe, jobId: req.params.id });
});

// ── GET /jobs/:id/download ────────────────────────────────────────────────────
app.get('/jobs/:id/download', (req, res) => {
  const job = getJob(req.params.id);
  if (!job)                           return res.status(404).json({ error: 'Job not found.' });
  if (job.status !== 'done')          return res.status(400).json({ error: `Not ready (${job.status}).` });
  if (!fs.existsSync(job.outputPath)) return res.status(404).json({ error: 'Output file missing.' });
  res.download(job.outputPath, job.filename, () => scheduleCleanup(req.params.id, 10 * 60 * 1000));
});

// ── POST /watermark ───────────────────────────────────────────────────────────
// Uses crop+boxblur+overlay instead of delogo.
// delogo is not available in Alpine Linux's ffmpeg package.
// The blur approach works universally and gives a smoother result.
app.post('/watermark', limiter, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Video file required.' });

  const mode     = req.body.mode || 'percent';
  const filename = req.body.filename
    || path.basename(file.originalname, path.extname(file.originalname));
  const jobId      = uuid();
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);

  const xRaw = parseFloat(req.body.x || 0);
  const yRaw = parseFloat(req.body.y || 0);
  const wRaw = parseFloat(req.body.w || 25);
  const hRaw = parseFloat(req.body.h || 15);

  createJob(jobId, {
    status: 'converting', statusText: 'Removing watermark…', progress: 0, eta: null,
    inputPath: file.path, outputPath,
    filename: `${filename}_clean.mp4`,
    fileSizeBytes: null, error: null, createdAt: Date.now(),
  });

  res.json({ jobId, status: 'processing' });

  // Run async after responding
  ;(async () => {
    try {
      // Get exact pixel dimensions via ffprobe
      const { width, height } = await getVideoDimensions(file.path);

      // Convert percent → pixels and clamp to video bounds
      let xPx, yPx, wPx, hPx;
      if (mode === 'percent') {
        xPx = Math.round(width  * (xRaw / 100));
        yPx = Math.round(height * (yRaw / 100));
        wPx = Math.round(width  * (wRaw / 100));
        hPx = Math.round(height * (hRaw / 100));
      } else {
        xPx = Math.round(xRaw);
        yPx = Math.round(yRaw);
        wPx = Math.round(wRaw);
        hPx = Math.round(hRaw);
      }
      xPx = Math.max(0, Math.min(xPx, width  - 2));
      yPx = Math.max(0, Math.min(yPx, height - 2));
      wPx = Math.max(2, Math.min(wPx, width  - xPx));
      hPx = Math.max(2, Math.min(hPx, height - yPx));

      // Build blur-overlay filter (no delogo dependency)
      // 1. Crop the watermark region
      // 2. Apply heavy box blur to it
      // 3. Overlay the blurred patch back at the same position
      const filterStr = [
        `[0:v]crop=${wPx}:${hPx}:${xPx}:${yPx},boxblur=20:20[wm]`,
        `[0:v][wm]overlay=${xPx}:${yPx}[out]`,
      ].join(';');

      await new Promise((resolve, reject) => {
        const ff = spawn('ffmpeg', [
          '-i',               file.path,
          '-filter_complex',  filterStr,
          '-map',             '[out]',
          '-map',             '0:a?',     // copy audio if present, skip if not
          '-c:a',             'copy',
          '-c:v',             'libx264',
          '-preset',          'fast',
          '-crf',             '23',
          '-y',               outputPath,
        ]);

        let duration = null;
        let errBuf   = '';

        ff.stderr.on('data', chunk => {
          const text = chunk.toString();
          errBuf     = (errBuf + text).slice(-2000);
          if (!duration) {
            const d = parseDuration(text);
            if (d) duration = d;
          }
          const p = parseProgress(text, duration);
          if (p !== null) updateJob(jobId, { progress: p });
        });

        ff.on('close', code =>
          code === 0 ? resolve() : reject(new Error(`FFmpeg exited ${code}: ${errBuf.slice(-300)}`))
        );
        ff.on('error', reject);
      });

      const { size } = fs.statSync(outputPath);
      updateJob(jobId, {
        status: 'done', progress: 100,
        statusText: 'Complete', fileSizeBytes: size,
      });

    } catch (err) {
      updateJob(jobId, { status: 'error', statusText: 'Removal failed', error: err.message });
    } finally {
      if (file?.path && fs.existsSync(file.path)) try { fs.unlinkSync(file.path); } catch {}
    }
  })();
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch {}
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

app.listen(PORT, () => console.log(`Converter running on :${PORT}`));
