// End-to-end check of phone verification (Telegram bot + Truecaller) against a real Mongo
// (MONGO_URI), with Telegram's and Truecaller's APIs stubbed. Creates throwaway users, deletes them after.
// run: npx tsx scripts/phone.check.ts   (locally with MONGO_URI pointing at a port-forwarded mongo)
process.env.TRUECALLER_APP_KEY ||= 'test-key';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_BOT_USERNAME = 'hateable_test_bot';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
const { default: mongoose } = await import('mongoose');
const { default: createApp } = await import('../src/app.js');
const { default: env } = await import('../src/shared/config/env.config.js');
const { default: User } = await import('../src/shared/models/user.model.js');
await mongoose.connect(env.MONGO_URI);
await User.syncIndexes();

const realFetch = globalThis.fetch;
const stamp = String(Date.now()).slice(-9);
const telegramUser = Number(stamp); // unique per run so earlier runs don't collide
const truecallerPhone = '91' + '8' + stamp;
const botReplies: string[] = [];
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const href = String(url);
  if (href.startsWith('https://api.telegram.org/')) {
    botReplies.push(JSON.parse(String(init?.body)).text);
    return Response.json({ ok: true });
  }
  if (href.startsWith('https://profile4-noneu.truecaller.com/')) {
    return Response.json({ phoneNumbers: [truecallerPhone] });
  }
  return realFetch(url, init);
}) as typeof fetch;

const server = createApp().listen(4099);
const base = 'http://localhost:4099/api/auth';
const call = async (path: string, init: RequestInit = {}, headers: Record<string, string> = {}) => {
  const r = await realFetch(base + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...headers }
  });
  return { status: r.status, body: await r.json() };
};
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const assert = (ok: unknown, msg: string) => {
  if (!ok) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('ok', msg);
};
const post = (path: string, body: object, headers: Record<string, string> = {}) =>
  call(path, { method: 'POST', body: JSON.stringify(body) }, headers);

// what Telegram posts to the webhook for a private chat message
let updateId = 1;
const telegram = (fromId: number, message: object, secret = 'test-secret') =>
  post(
    '/phone/telegram/webhook',
    {
      update_id: updateId++,
      message: { chat: { id: fromId, type: 'private' }, from: { id: fromId }, ...message }
    },
    { 'x-telegram-bot-api-secret-token': secret }
  );

async function signup(label: string) {
  const res = await post('/signup', {
    name: 'Phone Tester',
    email: `phone-check-${label}-${Date.now()}@test.dev`,
    password: 'secret123'
  });
  return res.body.data.accessToken as string;
}

// the webhook acknowledges first and finishes in the background, so poll like the frontend does
async function settled(nonce: string, token: string) {
  for (let i = 0; i < 30; i++) {
    const res = await call(`/phone/${nonce}`, {}, bearer(token));
    if (res.body.data?.status !== 'pending') return res;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('verification never settled');
}

async function telegramVerify(label: string, fromId: number) {
  const token = await signup(label);
  const start = await post('/phone/telegram', {}, bearer(token));
  const { requestNonce, link } = start.body.data;
  assert(
    start.status === 201 && link === `https://t.me/hateable_test_bot?start=${requestNonce}`,
    `${label}: start returns the bot link`
  );
  await telegram(fromId, { text: `/start ${requestNonce}` });
  return { token, requestNonce };
}

try {
  assert(
    (await telegram(1, { text: 'hi' }, 'wrong-secret')).status === 401,
    'webhook rejects a bad secret'
  );

  const first = await telegramVerify('tg-first', telegramUser);
  const firstRes = await settled(first.requestNonce, first.token);
  assert(
    firstRes.status === 200 && firstRes.body.data.user.phoneVerified,
    'telegram: first account is verified'
  );

  const second = await telegramVerify('tg-second', telegramUser);
  assert(
    (await settled(second.requestNonce, second.token)).status === 409,
    'telegram: same Telegram account on a second account gets 409'
  );

  const other = await telegramVerify('tg-other', telegramUser + 1);
  assert(
    (await settled(other.requestNonce, other.token)).status === 200,
    'telegram: a different Telegram account verifies'
  );

  const before = botReplies.length;
  await telegram(telegramUser, { text: `/start ${first.requestNonce}` });
  for (let i = 0; i < 30 && botReplies.length === before; i++)
    await new Promise((r) => setTimeout(r, 100));
  assert(botReplies.at(-1)?.includes('expired'), 'telegram: a used link is refused');

  const tc = await signup('truecaller');
  const tcStart = await post('/phone/truecaller', {}, bearer(tc));
  await post('/phone/truecaller/callback', {
    requestId: tcStart.body.data.requestNonce,
    accessToken: 'tok',
    endpoint: 'https://profile4-noneu.truecaller.com/v1/default'
  });
  const tcRes = await settled(tcStart.body.data.requestNonce, tc);
  assert(
    tcRes.status === 200 && tcRes.body.data.user.phone === `+${truecallerPhone}`,
    'truecaller: still verifies'
  );

  assert(
    botReplies.some((t) => t.startsWith('Verified!')),
    'bot told the user they are verified'
  );
  console.log('ALL PASSED');
} finally {
  await User.deleteMany({ email: /^phone-check-/ });
  server.close();
  await mongoose.disconnect();
}
