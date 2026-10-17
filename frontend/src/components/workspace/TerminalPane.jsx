import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getAccessToken, refreshAccessToken } from '../../api/client.js';

// A real shell in the project pod (projectService bridges this WebSocket to a k8s exec TTY).
export function TerminalPane({ projectId }) {
  const hostRef = useRef(null);
  const [state, setState] = useState('connecting'); // connecting | open | closed
  const [reason, setReason] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
      fontSize: 12,
      lineHeight: 1.25,
      theme: {
        background: '#09090b',
        foreground: '#e4e4e7',
        cursor: '#fafafa',
        selectionBackground: '#3f3f46'
      }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();

    let ws;
    let disposed = false;

    (async () => {
      // the access token is short-lived: make sure a fresh one goes in the first message
      if (!getAccessToken()) await refreshAccessToken().catch(() => {});
      if (disposed) return;

      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${scheme}://${location.host}/api/projects/${projectId}/terminal`);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'auth',
            token: getAccessToken(),
            cols: term.cols,
            rows: term.rows
          })
        );
        setState('open');
        term.focus();
      };
      ws.onmessage = (event) => term.write(event.data);
      ws.onclose = (event) => {
        if (disposed) return;
        setState('closed');
        setReason(event.reason || 'Disconnected');
      };
    })();

    const input = term.onData(
      (data) => ws?.readyState === 1 && ws.send(JSON.stringify({ type: 'input', data }))
    );
    const resize = term.onResize(
      ({ cols, rows }) =>
        ws?.readyState === 1 && ws.send(JSON.stringify({ type: 'resize', cols, rows }))
    );
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(hostRef.current);

    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      resize.dispose();
      ws?.close();
      // xterm queues a viewport refresh for the next frame; disposing first makes it throw
      requestAnimationFrame(() => term.dispose());
    };
  }, [projectId, attempt]);

  return (
    <div className="relative h-full min-h-0 bg-ink">
      <div ref={hostRef} className="h-full px-3 py-2" />
      {state === 'closed' && (
        <div className="absolute inset-0 grid place-items-center bg-ink/80 text-center text-xs">
          <div>
            <p className="text-white/60">{reason}</p>
            <button
              type="button"
              onClick={() => {
                setState('connecting');
                setAttempt((n) => n + 1);
              }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-white hover:bg-white/15"
            >
              <RotateCcw className="size-3" /> Reconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
