import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowUp,
  Check,
  FilePen,
  FolderSearch,
  LoaderCircle,
  MessageSquarePlus,
  Square,
  Wrench
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { streamChat } from '../../api/ai.js';
import HeroGlow from '../bits/HeroGlow.jsx';
import { LogoMark } from '../Logo.jsx';
import { MarkdownMessage } from './MarkdownMessage.jsx';

const conversationKey = (projectId) => `hateable:conversation:${projectId}`;
const readConversation = (projectId) => {
  try {
    return JSON.parse(localStorage.getItem(conversationKey(projectId)));
  } catch {
    return null;
  }
};

const toolIcon = (name = '') =>
  /write|create|update|patch|edit|delete|remove/i.test(name)
    ? FilePen
    : /read|list|tree|get|search/i.test(name)
      ? FolderSearch
      : Wrench;

const SUGGESTIONS = [
  'Add a dark mode toggle',
  'Make the hero section pop',
  'Add a contact form',
  'Explain this project'
];

// Chat with the aiService agent. History only lives for this session (no list-messages endpoint yet);
// the conversationId is remembered per project so the agent keeps its context across reloads.
export function ChatPanel({ projectId, initialPrompt, onFilesChanged }) {
  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  const sentInitial = useRef(false);
  const [conversation, setConversation] = useState(() => readConversation(projectId));
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const patchLast = (fn) => setMessages((list) => [...list.slice(0, -1), fn(list.at(-1))]);

  async function send(content) {
    if (!content || busy) return;
    setError('');
    setDraft('');
    setBusy(true);
    setMessages((list) => [
      ...list,
      { id: crypto.randomUUID(), role: 'user', content },
      { id: crypto.randomUUID(), role: 'ai', content: '', tools: [], agents: [], streaming: true }
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    let wroteFiles = false;

    try {
      await streamChat({
        projectId,
        conversationId: conversation?.conversationId,
        message: content,
        signal: controller.signal,
        onEvent(type, data) {
          if (type === 'title') {
            setConversation(data);
            try {
              localStorage.setItem(conversationKey(projectId), JSON.stringify(data));
            } catch {
              /* storage blocked */
            }
          } else if (type === 'token') {
            patchLast((m) => ({ ...m, content: m.content + data.text }));
          } else if (type === 'agent') {
            // multi-agent system (AGENT_SYSTEM_V2): progress lines instead of tokens
            patchLast((m) => ({ ...m, agents: [...m.agents, data].slice(-8) }));
          } else if (type === 'complete') {
            if (data.files?.length) wroteFiles = true;
            if (data.message) patchLast((m) => (m.content ? m : { ...m, content: data.message }));
          } else if (type === 'tool_call') {
            patchLast((m) => ({
              ...m,
              tools: [
                ...m.tools,
                ...data.toolCalls.map((c) => ({
                  id: c.id,
                  name: c.name,
                  args: c.args,
                  done: false
                }))
              ]
            }));
          } else if (type === 'tool_response') {
            if (toolIcon(data.name) === FilePen) wroteFiles = true;
            patchLast((m) => ({
              ...m,
              tools: m.tools.map((t) => (t.id === data.toolCallId ? { ...t, done: true } : t))
            }));
          }
        }
      });
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError(e.message);
        patchLast((m) => ({ ...m, failed: true }));
      }
    } finally {
      patchLast((m) => ({ ...m, streaming: false }));
      abortRef.current = null;
      setBusy(false);
      if (wroteFiles) onFilesChanged?.();
    }
  }

  useEffect(() => {
    if (initialPrompt && !sentInitial.current) {
      sentInitial.current = true;
      send(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  function newConversation() {
    if (busy) return;
    try {
      localStorage.removeItem(conversationKey(projectId));
    } catch {
      /* storage blocked */
    }
    setConversation(null);
    setMessages([]);
    setError('');
  }

  return (
    <aside className="relative isolate flex min-h-0 flex-col overflow-hidden border-l border-line bg-panel">
      <HeroGlow className="absolute -bottom-40 left-1/2 -z-10 h-80 w-[130%] -translate-x-1/2 opacity-25" />
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <LogoMark size={18} beat={busy} />
        <p className="min-w-0 flex-1 truncate text-sm text-white/80">
          {conversation?.title || 'New conversation'}
        </p>
        <button
          type="button"
          onClick={newConversation}
          disabled={busy}
          className="grid size-8 place-items-center rounded-lg text-white/45 transition hover:bg-white/5 hover:text-white disabled:opacity-30"
          aria-label="New conversation"
          title="New conversation"
        >
          <MessageSquarePlus className="size-4" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="ide-scroll min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="relative mb-5">
              <LogoMark size={44} />
            </div>
            <p className="font-medium text-white">What should we change?</p>
            <p className="mt-1 text-xs text-white/40">
              The agent can read and edit every file in this project.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-line px-3 py-1.5 text-xs text-white/60 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.article
              key={m.id}
              initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.3 }}
            >
              {m.role === 'user' ? (
                <p className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-white/[0.07] px-3.5 py-2.5 text-[13px] leading-5 break-words whitespace-pre-wrap text-white">
                  {m.content}
                </p>
              ) : (
                <div
                  className={m.failed ? 'rounded-xl border border-red-500/30 bg-red-500/5 p-3' : ''}
                >
                  {m.streaming && m.agents.length > 0 && (
                    <ul className="mb-3 space-y-1 border-l border-white/10 pl-3 font-mono text-[11px]">
                      {m.agents.map((a, i) => (
                        <motion.li
                          key={`${i}-${a.path}`}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: i === m.agents.length - 1 ? 1 : 0.45, x: 0 }}
                          className="truncate text-white/70"
                          style={{ paddingLeft: `${Math.min(a.depth, 4) * 10}px` }}
                        >
                          <span className="text-white/40">{a.path}</span> {a.message}
                        </motion.li>
                      ))}
                    </ul>
                  )}
                  {m.tools.length > 0 && (
                    <div className="mb-3 space-y-1.5">
                      {m.tools.map((t) => {
                        const Icon = toolIcon(t.name);
                        const target = (t.args?.filenames || Object.keys(t.args?.files || {})).join(
                          ', '
                        );
                        return (
                          <motion.div
                            key={t.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-2 rounded-lg border border-line bg-ink/60 px-2.5 py-1.5 text-[11px]"
                          >
                            <Icon className="size-3.5 shrink-0 text-white/50" />
                            <span className="font-mono text-white/70">{t.name}</span>
                            {target && (
                              <span className="min-w-0 truncate font-mono text-white/35">
                                {target}
                              </span>
                            )}
                            <span className="ml-auto">
                              {t.done ? (
                                <Check className="size-3.5 text-emerald-400" />
                              ) : (
                                <LoaderCircle className="size-3.5 animate-spin text-white/40" />
                              )}
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                  {m.content ? (
                    <MarkdownMessage content={m.content} />
                  ) : m.streaming ? (
                    <span className="shiny-text text-xs">
                      {m.tools.length || m.agents.length ? 'Working on it…' : 'Thinking…'}
                    </span>
                  ) : null}
                  {m.failed && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-red-300">
                      <AlertTriangle className="size-3" /> This response didn't finish.
                    </p>
                  )}
                </div>
              )}
            </motion.article>
          ))}
        </AnimatePresence>
      </div>

      <form
        className="shrink-0 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft.trim());
        }}
      >
        {error && (
          <p
            role="alert"
            className="mb-2 flex items-start gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-200"
          >
            <AlertTriangle className="mt-px size-3 shrink-0" /> {error}
          </p>
        )}
        <div className="rounded-2xl border border-white/10 bg-ink p-2 transition focus-within:border-white/20">
          <textarea
            className="ide-scroll max-h-40 min-h-16 w-full resize-none bg-transparent px-2 pt-1 text-[13px] leading-5 text-white outline-none placeholder:text-white/30"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form.requestSubmit();
              }
            }}
            placeholder="Ask Hateable to change something…"
            aria-label="Message"
          />
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-white/30">
              Enter to send · Shift+Enter for newline
            </span>
            {busy ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="grid size-8 place-items-center rounded-full border border-line text-white/60 hover:bg-white/5 hover:text-white"
                aria-label="Stop generating"
              >
                <Square className="size-3 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                className="grid size-8 place-items-center rounded-full bg-white text-black hover:bg-white/90 transition hover:scale-105 disabled:opacity-25 disabled:hover:scale-100"
                aria-label="Send message"
              >
                <ArrowUp className="size-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </form>
    </aside>
  );
}
