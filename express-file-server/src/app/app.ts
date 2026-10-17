import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import morgan from 'morgan';
import fs from 'node:fs';
import path from 'node:path';
import fileRoutes from '../routes/file.routes.js';
import { SYNCED_MARKER, WORK_FOLDER } from '../config/env.js';
import { HttpError } from '../utils/path.util.js';

const app: Application = express();

app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// until the sync container has restored the workspace from S3 and is watching it, a write could be
// overwritten by the restore or never reach S3, so refuse file access with a retryable 503
let synced = false;
app.use((_req, res, next) => {
  synced ||= fs.existsSync(path.join(WORK_FOLDER, SYNCED_MARKER));
  if (synced) return next();
  res
    .set('Retry-After', '2')
    .status(503)
    .json({ success: false, message: 'Workspace is still syncing' });
});

app.use(fileRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : 'Internal server error';
  res.status(statusCode).json({ success: false, message });
});

export default app;
