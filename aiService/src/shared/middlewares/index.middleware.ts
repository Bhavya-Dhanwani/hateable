import express, { Express } from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import env from '../config/env.config.js';

function applyMiddlewares(app: Express) {
  // never compress the chat's server-sent events: gzip holds them back until the run ends, so
  // the UI sat on "Thinking..." with no progress lines
  app.use(
    compression({
      filter: (req, res) =>
        !String(res.getHeader('Content-Type') || '').startsWith('text/event-stream') &&
        compression.filter(req, res)
    })
  );
  app.use(cors());
  app.use(helmet());
  app.use(hpp());
  app.use(cookieParser());
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
}

export default applyMiddlewares;
