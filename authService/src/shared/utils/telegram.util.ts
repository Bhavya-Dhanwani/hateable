// Telegram bot helpers for account verification
// docs: https://core.telegram.org/bots/api (sendMessage, setWebhook)
import env from '../config/env.config.js';

// deep link that opens the bot with "/start <nonce>" (payload: up to 64 chars of A-Za-z0-9_-)
const telegramLink = (nonce: string) => `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${nonce}`;

async function sendTelegramMessage(chatId: number, text: string) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10_000)
    }
  );
  if (!response.ok) throw new Error(`Telegram sendMessage failed (${response.status})`);
}

export { telegramLink, sendTelegramMessage };
