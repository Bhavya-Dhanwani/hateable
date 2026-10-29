// The LLM provider catalog. Most providers speak the OpenAI wire format, so one ChatOpenAI builder
// with a per-provider baseURL covers them; Claude and Mistral use their own SDK adapters.
// Add a provider = one line here. Base URL and default model are overridable per env:
//   <PROVIDER>_BASE_URL and <PROVIDER>_MODEL (e.g. KIMI_MODEL=moonshot-v1-128k), so a wrong
//   default here is a one-env-var fix, never a code change.
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatMistralAI } from '@langchain/mistralai';

type Kind = 'openai' | 'anthropic' | 'mistral';
type Spec = { label: string; defaultModel: string; base?: string; kind: Kind };

// base undefined => the provider's own default host (OpenAI, native Claude/Mistral SDKs).
export const PROVIDERS = {
  openai: { label: 'OpenAI', defaultModel: 'gpt-4o-mini', kind: 'openai' },
  anthropic: { label: 'Claude', defaultModel: 'claude-3-5-sonnet-latest', kind: 'anthropic' },
  grok: {
    label: 'Grok (xAI)',
    defaultModel: 'grok-2-latest',
    base: 'https://api.x.ai/v1',
    kind: 'openai'
  },
  deepseek: {
    label: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    base: 'https://api.deepseek.com/v1',
    kind: 'openai'
  },
  openrouter: {
    label: 'OpenRouter',
    defaultModel: 'openai/gpt-4o-mini',
    base: 'https://openrouter.ai/api/v1',
    kind: 'openai'
  },
  omniroute: {
    label: 'OmniRoute',
    defaultModel: 'openai/gpt-4o-mini',
    base: 'https://api.omniroute.ai/v1',
    kind: 'openai'
  },
  kimi: {
    label: 'Kimi (Moonshot)',
    defaultModel: 'moonshot-v1-32k',
    base: 'https://api.moonshot.ai/v1',
    kind: 'openai'
  },
  mistral: { label: 'Mistral', defaultModel: 'codestral-latest', kind: 'mistral' }
} as const satisfies Record<string, Spec>;

export type ProviderId = keyof typeof PROVIDERS;

export const isProvider = (x: unknown): x is ProviderId => typeof x === 'string' && x in PROVIDERS;

const envVal = (id: ProviderId, suffix: string) => process.env[`${id.toUpperCase()}_${suffix}`];

// the model a provider uses when a stored key didn't pin one: env override, else catalog default
export const defaultModelFor = (id: ProviderId) =>
  envVal(id, 'MODEL') || PROVIDERS[id].defaultModel;

const baseFor = (id: ProviderId) => envVal(id, 'BASE_URL') || (PROVIDERS[id] as Spec).base;

// one chat model instance for a (provider, key, model). maxRetries 0: the router retries on another key.
export function buildModel(
  id: ProviderId,
  apiKey: string,
  model: string,
  streaming: boolean
): BaseChatModel {
  const common = { apiKey, model, maxRetries: 0, streaming, temperature: streaming ? 0 : 0.2 };
  const { kind } = PROVIDERS[id];
  if (kind === 'anthropic') return new ChatAnthropic(common);
  if (kind === 'mistral') return new ChatMistralAI(common);
  const baseURL = baseFor(id);
  return new ChatOpenAI({ ...common, configuration: baseURL ? { baseURL } : undefined });
}
