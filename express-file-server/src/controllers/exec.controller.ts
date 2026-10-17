import type { NextFunction, Request, Response } from 'express';
import { runCommand } from '../service/exec.service.js';

export async function execCommand(req: Request, res: Response, next: NextFunction) {
  try {
    const { command, cwd, timeoutMs } = (req.body ?? {}) as {
      command?: unknown;
      cwd?: unknown;
      timeoutMs?: unknown;
    };
    const result = await runCommand(
      String(command ?? ''),
      typeof cwd === 'string' ? cwd : '',
      Number(timeoutMs) || undefined
    );
    res.json({ success: true, message: 'Command finished', ...result });
  } catch (error) {
    next(error);
  }
}
