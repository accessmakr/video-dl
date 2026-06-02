/**
 * Audio Converter Service
 * Express + FFmpeg on Render free tier.
 * Accepts file uploads or remote URLs, converts to MP3/M4A/AAC/WAV/FLAC/OGG.
 */

const express    = require('express');
const cors       = require('cors');
const multer     = require('multer');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const fs         = require('fs');
const { v4: uuid } = require('uuid');

const { createJob, getJob, updateJob } = require('./utils/jobs');
const { processJob }                    = require('./utils/queue');
const { scheduleCleanup }               = require('./utils/cleanup');

const app        = express();
const PORT       = process.env.PORT || 3001;
const UPLOAD_DIR = '/tmp/uploads';
const OUTPUT_DIR = '/tmp/outputs';

// ── Ensure temp dirs exist ────────────────────────────────────────────────────
[UPLOAD_DIR, OUTPUT_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    const allowed = [
      process.env.FRONTEND_URL,
      'http://localhost:5173',
    ].filter(Boolean);
    // Allow requests with no Origin header (mobile apps, curl) and listed origins
    if (!origin || allowed.some(o => origin.startsWith(o))) return cb(null, true);
    cb(new Error('CORS: origin not allowed'));
  },
  methods:      ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
}));

app.use(express.json({ limit: '1mb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const jobLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min window
  max:      10,              // 10 conversions per IP per window
  standardHeaders: true,
  message: { error: 'Too many conversion requests. Please wait and try again.' },
});

// ── File upload (multer) ──────────────────────────────────────────────────────
const ALLOWED_MIME = new Set([
  'video/mp4','video/quicktime','video/x-msvideo','video/webm',
  'video/x-matroska','video/3gpp','video/x-flv','video/x-ms-wmv',
  'audio/mpeg','audio/mp4','audio/wav','audio/ogg','audio/flac',
]);

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename:    (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

// ── Validation helpers ────────────────────────────────────────────────────────
const VALID_FORMATS   = new Set(['mp3','m4a','aac','wav','flac','ogg']);
const VALID_QUALITIES = new Set(['64','128','192','256','320']);

function validateRequest(body) {
  const format  = (body.format  || 'mp3').toLowerCase();
  const quality = String(body.quality || '128');
  if (!VALID_FORMATS.has(format))   return { error: `Invalid format. Allowed: ${[...VALID_FORMATS].join(', ')}` };
  if (!VALID_QUALITIES.has(quality)) return { error: `Invalid quality. Allowed: ${[...VALID_QUALITIES].join(', ')}k` };
  return { format, quality };
}

// ════════════════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /health
 * Liveness check used by Render and the frontend warm-up ping.
 */
app.get('/health', (req, res) => res.json({ ok: true, service: 'audio-converter' }));

// ─────────────────────────────────────────────────────────────────────────────
/**
 * POST /jobs
 * Create a new conversion job.
 *
 * Body (multipart/form-data):
 *   file     – video file (optional if url is provided)
 *   url      – remote video URL (optional if file is provided)
 *   format   – mp3 | m4a | aac | wav | flac | ogg  (default: mp3)
 *   quality  – 64 | 128 | 192 | 256 | 320 kbps     (default: 128)
 *   filename – desired output filename without extension
 *
 * Response: { jobId, status }
 */
app.post('/jobs', jobLimiter, upload.single('file'), (req, res) => {
  try {
    const validation = validateRequest(req.body);
    if (validation.error) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: validation.error });
    }
    const { format, quality } = validation;

    const file = req.file;
    const url  = req.body.url?.trim();

    if (!file && !url) {
      return res.status(400).json({ error: 'Provide either a file upload or a url.' });
    }

    const jobId     = uuid();
    const outFile   = `${jobId}.${format}`;
    const outputPath = path.join(OUTPUT_DIR, outFile);
    const baseName  = req.body.filename
      || (file ? path.basename(file.originalname, path.extname(file.originalname)) : 'audio');
    const filename  = `${baseName}.${format}`;

    createJob(jobId, {
      status:        'queued',
      statusText:    'Queued…',
      progress:      0,
      eta:           null,
      format,
      quality,
      inputPath:     file?.path || null,
      inputUrl:      url || null,
      outputPath,
      filename,
      fileSizeBytes: null,
      error:         null,
      createdAt:     Date.now(),
    });

    // Fire and forget — client polls /jobs/:id
    processJob(jobId);

    res.json({ jobId, status: 'queued' });
  } catch (err) {
    console.error('POST /jobs error:', err);
    res.status(500).json({ error: 'Server error creating job.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
/**
 * GET /jobs/:id
 * Poll conversion status.
 *
 * Response: { jobId, status, statusText, progress, eta, format, quality,
 *             fileSizeBytes, error }
 */
app.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found or expired.' });

  // Never expose file system paths to the client
  const { inputPath, outputPath, inputUrl, ...safe } = job;
  res.json({ ...safe, jobId: req.params.id });
});

// ─────────────────────────────────────────────────────────────────────────────
/**
 * GET /jobs/:id/download
 * Download the converted audio file.
 * Triggers cleanup 10 minutes after the file is served.
 */
app.get('/jobs/:id/download', (req, res) => {
  const job = getJob(req.params.id);
  if (!job)                       return res.status(404).json({ error: 'Job not found or expired.' });
  if (job.status !== 'done')      return res.status(400).json({ error: `Job not ready (status: ${job.status}).` });
  if (!fs.existsSync(job.outputPath)) return res.status(404).json({ error: 'Output file missing.' });

  res.download(job.outputPath, job.filename, (err) => {
    if (err && !res.headersSent) res.status(500).json({ error: 'Download error.' });
    scheduleCleanup(req.params.id, 10 * 60 * 1000); // clean up 10 min after first download
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Global error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch {}
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Audio Converter running on :${PORT}`);
});
