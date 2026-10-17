import { apiRequest, getAccessToken, refreshAccessToken } from './client.js';

/**
 * Reads a server-sent event stream from our API (with the access token and one refresh on 401),
 * calling onEvent(type, payload) for every event until the stream ends or `signal` aborts.
 */
export async function streamEvents(path, { method = 'GET', body, signal, onEvent }) {
  const send = () =>
    fetch(path, {
      method,
      credentials: 'include',
      signal,
      headers: {
        Accept: 'text/event-stream',
        ...(body && { 'Content-Type': 'application/json' }),
        ...(getAccessToken() && { Authorization: `Bearer ${getAccessToken()}` })
      },
      body: body && JSON.stringify(body)
    });

  let response = await send();
  if (response.status === 401) {
    await refreshAccessToken();
    response = await send();
  }
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || `Request failed (${response.status})`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    let cut;
    while ((cut = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const type = raw.match(/^event: (.+)$/m)?.[1] || 'message';
      const data = raw
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('\n');
      if (!data) continue;
      let payload;
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }
      if (type === 'error') throw new Error(payload?.message ?? payload);
      onEvent(type, payload);
    }
  }
}

/**
 * Streams one agent turn from aiService (POST /api/ai/chat, SSE).
 * Events: title {conversationId,title} · token {text} · tool_call {toolCalls}
 *         tool_response {toolCallId,name,content} · agent {path,depth,message} · complete · error {message}
 */
export const streamChat = ({ projectId, conversationId, message, signal, onEvent }) =>
  streamEvents('/api/ai/chat', {
    method: 'POST',
    body: { projectId, conversationId, message },
    signal,
    onEvent
  });

// the site AI: answers questions about a deployed site from its logs and analytics
export const askSiteAi = (projectId, question, history = []) =>
  apiRequest('/api/ai/insights', {
    method: 'POST',
    body: JSON.stringify({ projectId, question, history })
  });
