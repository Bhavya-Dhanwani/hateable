// Importing modules
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { PassThrough } from 'node:stream';
import jwt from 'jsonwebtoken';
import { WebSocketServer, type WebSocket } from 'ws';
import * as k8s from '@kubernetes/client-node';
import env from '../config/env.config.js';
import logger from '../config/logger.config.js';
import Project from '../models/project.model.js';
import { recordActivity } from './activity.service.js';
import { atLeast, projectRole, TokenUser, userIdOf } from '../utils/access.util.js';

/**
 * Workspace terminal: browser (xterm.js) <-> WebSocket <-> k8s exec TTY in the project pod.
 *
 * The shell runs in the pod's file-server container: it mounts the whole project at /app for
 * every stack (MERN included) and has node + npm. Browsers cannot set headers on a WebSocket,
 * so the first message must be `{ type: 'auth', token }`; nothing reaches the pod before that.
 *
 * Messages from the browser: { type: 'auth', token } | { type: 'input', data } |
 * { type: 'resize', cols, rows }. Messages to the browser: raw terminal output.
 */

const TERMINAL_PATH = /^\/api\/projects\/([a-f0-9]{24})\/terminal$/;
const AUTH_TIMEOUT_MS = 5000;

const kc = new k8s.KubeConfig();
kc.loadFromCluster();
const exec = new k8s.Exec(kc);

// the shape k8s.Exec looks for to forward terminal resizes (see isResizable in client-node)
type ResizableOutput = PassThrough & { rows: number; columns: number };

// function to read the user out of an access token, null when it is invalid
function userFrom(token: unknown) {
  try {
    const payload = jwt.verify(String(token), env.ACCESS_TOKEN_SECRET) as TokenUser;
    return userIdOf(payload) ? payload : null;
  } catch {
    return null;
  }
}

// function to open the shell once the socket proved who it is
async function openShell(
  ws: WebSocket,
  projectId: string,
  firstSize: { cols: number; rows: number }
) {
  const stdin = new PassThrough();
  const stdout = Object.assign(new PassThrough(), {
    columns: firstSize.cols,
    rows: firstSize.rows
  }) as ResizableOutput;

  stdout.on('data', (chunk: Buffer) => ws.readyState === ws.OPEN && ws.send(chunk.toString()));

  const k8sSocket = await exec.exec(
    'default',
    `nextjs-pod-${projectId}`,
    'express-container',
    ['sh', '-c', 'cd /app && export TERM=xterm-256color PS1="\\w \\$ " && exec sh'],
    stdout,
    stdout, // a tty merges stderr into stdout anyway
    stdin,
    true,
    () => ws.close(1000, 'Shell exited')
  );

  ws.on('message', (raw) => {
    let msg: { type?: string; data?: string; cols?: number; rows?: number };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'input' && typeof msg.data === 'string') {
      stdin.write(msg.data);
      // someone typing in the terminal is using the workspace: keep the pod alive
      void recordActivity(projectId);
    } else if (msg.type === 'resize' && msg.cols && msg.rows) {
      stdout.columns = msg.cols;
      stdout.rows = msg.rows;
      stdout.emit('resize');
    }
  });

  ws.on('close', () => {
    stdin.end();
    k8sSocket.close();
  });

  // an unhandled socket 'error' would crash projectService for everyone: end just this session
  ws.on('error', () => k8sSocket.close());
  k8sSocket.on('error', () => ws.close(1011, 'Lost the connection to the project pod'));
}

/**
 * Accepts terminal WebSocket upgrades on /api/projects/:projectId/terminal.
 * Call once with the HTTP server returned by `app.listen`.
 */
export function attachTerminalServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const match = TERMINAL_PATH.exec((req.url || '').split('?')[0]);
    if (!match) return socket.destroy();

    wss.handleUpgrade(req, socket, head, (ws) => {
      const projectId = match[1];
      const timer = setTimeout(() => ws.close(4401, 'Authenticate first'), AUTH_TIMEOUT_MS);

      ws.once('message', async (raw) => {
        clearTimeout(timer);
        try {
          const msg = JSON.parse(raw.toString()) as {
            type?: string;
            token?: string;
            cols?: number;
            rows?: number;
          };
          const user = msg.type === 'auth' ? userFrom(msg.token) : null;
          if (!user) return ws.close(4401, 'Invalid or expired access token');

          // a shell can change anything in the pod: owner and workspace editors and up only
          const project = await Project.findById(projectId);
          if (!project || !atLeast(projectRole(user, project), 'editor')) {
            return ws.close(4403, 'You need editor access to open a terminal');
          }
          if (project.status !== 'running') return ws.close(4409, 'The project is not running');

          await openShell(ws, projectId, { cols: msg.cols || 80, rows: msg.rows || 24 });
        } catch (error) {
          logger.error(error, `Terminal for ${projectId} failed`);
          ws.close(1011, 'Could not open a shell in the project');
        }
      });
    });
  });
}
