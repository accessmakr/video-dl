/**
 * Audio Converter + Watermark Remover Service
 * Express + FFmpeg on Render free tier.
 */

const express    = require('express');
const cors       = require('cors');
const multer     = require('multer');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const fs         = require('fs');
const { v4: uuid } = require('uuid');

const { createJob, getJob }    = require('./utils/jobs');
const { processJob }            = require('./utils/queue');
const { scheduleCleanup }       = require('./utils/cleanup');
const { spawn }                 = require('child_process');

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
  windowMs: 15 * 60 * 1000, max: 10,
  message: { error: 'Too many requests. Please wait and try again.' },
});

// ── Multer ────────────────────────────────────────────────────────────────────
const ALLOWED_MIME = new Set([
  'video/mp4','video/quicktime','video/x-msvideo','video/webm','video/x-matroska',
  'video/3gpp','video/x-flv','video/x-ms-wmv',
  'audio/mpeg','audio/mp4','audio/wav','audio/ogg','audio/flac',
]);

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

const VALID_FORMATS   = new Set(['mp3','m4a','aac','wav','flac','ogg']);
const VALID_QUALITIES = new Set(['64','128','192','256','320']);

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, service: 'audio-converter' }));

// ── POST /jobs — Audio conversion ────────────────────────────────────────────
app.post('/jobs', limiter, upload.single('file'), (req, res) => {
  try {
    const format  = (req.body.format  || 'mp3').toLowerCase();
    const quality = String(req.body.quality || '128');
    if (!VALID_FORMATS.has(format))    return res.status(400).json({ error: `Invalid format.`  });
    if (!VALID_QUALITIES.has(quality)) return res.status(400).json({ error: `Invalid quality.` });

    const file = req.file;
    const url  = req.body.url?.trim();
    if (!file && !url) return res.status(400).json({ error: 'Provide file or url.' });

    const jobId     = uuid();
    const outFile   = `${jobId}.${format}`;
    const outputPath = path.join(OUTPUT_DIR, outFile);
    const baseName  = req.body.filename || (file ? path.basename(file.originalname, path.extname(file.originalname)) : 'audio');

    createJob(jobId, {
      status: 'queued', statusText: 'Queued…', progress: 0, eta: null,
      format, quality,
      inputPath: file?.path || null,
      inputUrl:  url || null,
      outputPath,
      filename:  `${baseName}.${format}`,
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
  if (!fs.existsSync(job.outputPath)) return res.status(404).json({ error: 'Output missing.' });

  res.download(job.outputPath, job.filename, () => {
    scheduleCleanup(req.params.id, 10 * 60 * 1000);
  });
});

// ── POST /watermark — Watermark removal ──────────────────────────────────────
// Body (multipart): file, x, y, w, h (pixels or %), mode=pixels|percent, filename
app.post('/watermark', limiter, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Video file required.' });

    const mode     = req.body.mode || 'percent';
    const filename = req.body.filename || path.basename(file.originalname, path.extname(file.originalname));
    const jobId    = uuid();
    const outputPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);

    // Parse region
    let x = parseFloat(req.body.x || 0);
    let y = parseFloat(req.body.y || 0);
    let w = parseFloat(req.body.w || 25);
    let h = parseFloat(req.body.h || 15);

    createJob(jobId, {
      status: 'converting', statusText: 'Removing watermark…', progress: 0, eta: null,
      inputPath: file.path, outputPath,
      filename: `${filename}_clean.mp4`,
      fileSizeBytes: null, error: null, createdAt: Date.now(),
    });

    // Build FFmpeg delogo filter
    // If mode=percent, values are 0-100 relative to video dimensions
    const filterStr = mode === 'percent'
      ? `delogo=x=iw*${x/100}:y=ih*${y/100}:w=iw*${w/100}:h=ih*${h/100}:show=0`
      : `delogo=x=${x}:y=${y}:w=${w}:h=${h}:show=0`;

    const ff = spawn('ffmpeg', [
      '-i', file.path,
      '-vf', filterStr,
      '-c:a', 'copy',   // keep original audio untouched
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-y', outputPath,
    ]);

    let duration = null;
    ff.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      if (!duration) {
        const m = text.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
        if (m) duration = +m[1]*3600 + +m[2]*60 + parseFloat(m[3]);
      }
      if (duration) {
        const t = text.match(/time=\s*(\d+):(\d+):(\d+\.?\d*)/);
        if (t) {
          const cur = +t[1]*3600 + +t[2]*60 + parseFloat(t[3]);
          const { updateJob } = require('./utils/jobs');
          updateJob(jobId, { progress: Math.min(99, Math.round((cur/duration)*100)) });
        }
      }
    });

    ff.on('close', (code) => {
      const { updateJob } = require('./utils/jobs');
      if (code === 0) {
        const { size } = fs.statSync(outputPath);
        updateJob(jobId, { status: 'done', progress: 100, statusText: 'Complete', fileSizeBytes: size });
        if (file.path && fs.existsSync(file.path)) try { fs.unlinkSync(file.path); } catch {}
      } else {
        updateJob(jobId, { status: 'error', error: `FFmpeg exited ${code}` });
      }
    });

    res.json({ jobId, status: 'processing' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch {}
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

app.listen(PORT, () => console.log(`Converter running on :${PORT}`));
