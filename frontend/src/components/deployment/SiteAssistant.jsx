import { ArrowUp, LoaderCircle, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { askSiteAi } from '../../api/ai.js';
import { MarkdownMessage } from '../workspace/MarkdownMessage.jsx';

const SUGGESTIONS = ['Is my site healthy?', 'Why are there errors?', 'What happened today?'];
const HEALTH = {
  healthy: 'text-emerald-300',
  degraded: 'text-amber-300',
  down: 'text-red-300'
};

// An assistant that answers from this site's own logs, activity and analytics.
export function SiteAssistant({ projectId }) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]); // { role, content, health?, fixTask? }
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);

  async function ask(text) {
    const q = text.trim();
    if (!q || busy) return;
    setQuestion('');
    setBusy(true);
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: 'user', content: q }]);
    try {
      const r = await askSiteAi(projectId, q, history);
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: r.answer, health: r.health, fixTask: r.fixTask }
      ]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: `Could not answer: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="border-b border-line pb-2 text-xs text-white/40">Ask about your site</h2>

      <div className="mt-3 space-y-4">
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <p
              key={i}
              className="ml-auto w-fit max-w-[85%] rounded-xl bg-white/[0.06] px-3 py-2 text-[13px] text-white"
            >
              {m.content}
            </p>
          ) : (
            <div key={i} className="text-[13px] text-white/80">
              {m.health && (
                <p className={`mb-1 text-[11px] uppercase tracking-wide ${HEALTH[m.health]}`}>
                  {m.health}
                </p>
              )}
              <MarkdownMessage content={m.content} />
              {m.fixTask && (
                <button
                  type="button"
                  // the workspace sends `initialPrompt` to the coding agent once it opens
                  onClick={() =>
                    navigate(`/projects/${projectId}`, { state: { initialPrompt: m.fixTask } })
                  }
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/15"
                >
                  <Wrench className="size-3" /> Fix it with the agent
                </button>
              )}
            </div>
          )
        )}
        {busy && (
          <p className="flex items-center gap-2 text-xs text-white/40">
            <LoaderCircle className="size-3.5 animate-spin" /> Reading the logs...
          </p>
        )}
      </div>

      {messages.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="rounded-full border border-line px-3 py-1 text-xs text-white/55 hover:bg-white/5 hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="mt-3 flex items-center rounded-xl border border-line bg-panel pl-3 focus-within:border-white/20"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Why did my site go down last night?"
          aria-label="Ask about your site"
          className="h-10 min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/25"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          aria-label="Ask"
          className="m-1 grid size-8 place-items-center rounded-lg bg-white text-black disabled:opacity-30"
        >
          <ArrowUp className="size-4" />
        </button>
      </form>
    </section>
  );
}
