/**
 * converter/server.js — v2
 * Audio conversion + Watermark removal
 * Fixed: watermark endpoint now uses ffprobe to get exact pixel dimensions
 *        before applying delogo filter (fixes FFmpeg exit 234 / EINVAL error)
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

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
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
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

const VALID_FORMATS   = new Set(['mp3','m4a','aac','wav','flac','ogg']);
const VALID_QUALITIES = new Set(['64','128','192','256','320']);

// ── ffprobe: get video width + height ─────────────────────────────────────────
function getVideoDimensions(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v',            'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-select_streams','v:0',
      filePath,
    ]);
    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.on('close', code => {
      if (code !== 0) return reject(new Error('ffprobe failed'));
      try {
        const data = JSON.parse(out);
        const s    = data.streams[0];
        resolve({ width: s.width, height: s.height });
      } catch (e) { reject(e); }
    });
    proc.on('error', reject);
  });
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
      inputPath:     file?.path || null,
      inputUrl:      url  || null,
      outputPath,
      filename:      `${baseName}.${format}`,
      fileSizeBytes: null,
      error:         null,
      createdAt:     Date.now(),
    });

    processJob(jobId);
    res.json({ jobId, status: 'queued' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /jobs/:id — Poll status ───────────────────────────────────────────────
app.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found or expired.' });
  const { inputPath, outputPath, inputUrl, ...safe } = job;
  res.json({ ...safe, jobId: req.params.id });
});

// ── GET /jobs/:id/download — Download result ──────────────────────────────────
app.get('/jobs/:id/download', (req, res) => {
  const job = getJob(req.params.id);
  if (!job)                           return res.status(404).json({ error: 'Job not found.' });
  if (job.status !== 'done')          return res.status(400).json({ error: `Not ready (${job.status}).` });
  if (!fs.existsSync(job.outputPath)) return res.status(404).json({ error: 'Output file missing.' });
  res.download(job.outputPath, job.filename, () => scheduleCleanup(req.params.id, 10 * 60 * 1000));
});

// ── POST /watermark — Watermark removal ───────────────────────────────────────
// Fixed: uses ffprobe to resolve percent coords into pixels before calling delogo
app.post('/watermark', limiter, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Video file required.' });

  const mode     = req.body.mode || 'percent';
  const filename = req.body.filename
    || path.basename(file.originalname, path.extname(file.originalname));
  const jobId      = uuid();
  const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);

  let xRaw = parseFloat(req.body.x || 0);
  let yRaw = parseFloat(req.body.y || 0);
  let wRaw = parseFloat(req.body.w || 25);
  let hRaw = parseFloat(req.body.h || 15);

  createJob(jobId, {
    status: 'converting', statusText: 'Removing watermark…', progress: 0, eta: null,
    inputPath: file.path, outputPath,
    filename: `${filename}_clean.mp4`,
    fileSizeBytes: null, error: null, createdAt: Date.now(),
  });

  // Respond immediately — client polls status
  res.json({ jobId, status: 'processing' });

  // Run async
  (async () => {
    try {
      // ── Step 1: Get exact video dimensions via ffprobe ──────────────────
      const { width, height } = await getVideoDimensions(file.path);

      // ── Step 2: Convert percent → integer pixels ────────────────────────
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

      // Clamp so region doesn't exceed video bounds
      xPx = Math.max(0, Math.min(xPx, width  - 1));
      yPx = Math.max(0, Math.min(yPx, height - 1));
      wPx = Math.max(1, Math.min(wPx, width  - xPx));
      hPx = Math.max(1, Math.min(hPx, height - yPx));

      const filterStr = `delogo=x=${xPx}:y=${yPx}:w=${wPx}:h=${hPx}:show=0`;

      // ── Step 3: Run FFmpeg ───────────────────────────────────────────────
      await new Promise((resolve, reject) => {
        const ff = spawn('ffmpeg', [
          '-i',       file.path,
          '-vf',      filterStr,
          '-c:a',     'copy',
          '-c:v',     'libx264',
          '-preset',  'fast',
          '-crf',     '23',
          '-y',       outputPath,
        ]);

        let duration = null;
        ff.stderr.on('data', chunk => {
          const text = chunk.toString();
          if (!duration) {
            const m = text.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
            if (m) duration = +m[1]*3600 + +m[2]*60 + parseFloat(m[3]);
          }
          if (duration) {
            const t = text.match(/time=\s*(\d+):(\d+):(\d+\.?\d*)/);
            if (t) {
              const cur = +t[1]*3600 + +t[2]*60 + parseFloat(t[3]);
              updateJob(jobId, { progress: Math.min(99, Math.round((cur/duration)*100)) });
            }
          }
        });

        ff.on('close',  code => code === 0 ? resolve() : reject(new Error(`FFmpeg exited ${code}`)));
        ff.on('error',  reject);
      });

      const { size } = fs.statSync(outputPath);
      updateJob(jobId, { status: 'done', progress: 100, statusText: 'Complete', fileSizeBytes: size });

    } catch (err) {
      updateJob(jobId, { status: 'error', statusText: 'Watermark removal failed', error: err.message });
    } finally {
      if (file.path && fs.existsSync(file.path)) try { fs.unlinkSync(file.path); } catch {}
    }
  })();
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch {}
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

app.listen(PORT, () => console.log(`Converter running on :${PORT}`));
