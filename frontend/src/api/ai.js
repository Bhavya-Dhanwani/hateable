import { getAccessToken, refreshAccessToken } from './client.js';

/**
 * Streams one agent turn from aiService (POST /api/ai/chat, SSE).
 * Events: title {conversationId,title} · token {text} · tool_call {toolCalls}
 *         tool_response {toolCallId,name,content} · complete · error {message}
 */
export async function streamChat({ projectId, conversationId, message, signal, onEvent }) {
  const post = () =>
    fetch('/api/ai/chat', {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(getAccessToken() && { Authorization: `Bearer ${getAccessToken()}` })
      },
      body: JSON.stringify({ projectId, conversationId, message })
    });

  let response = await post();
  if (response.status === 401) {
    await refreshAccessToken();
    response = await post();
  }
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || `AI service error (${response.status})`);
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
      if (type === 'error') throw new Error(payload.message);
      onEvent(type, payload);
    }
  }
}
