const db  = require('../config/database');
let bot = null;
try {
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'your_telegram_bot_token_here') {
    const TelegramBot = require('node-telegram-bot-api');
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
    console.log('✅ Telegram bot initialized');
  }
} catch (e) {
  console.warn('⚠️  Telegram bot not available:', e.message);
}

async function sendNotification(userId, type, { title, message, telegram_id, metadata = {} }) {
  try {
    // Сохранить в БД
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, metadata)
       VALUES ($1,$2,$3,$4,$5)`,
      [userId, type, title, message, JSON.stringify(metadata)]
    );
    // Telegram
    if (bot && telegram_id) {
      const text = `🔔 *${title}*\n\n${message}`;
      await bot.sendMessage(telegram_id, text, { parse_mode: 'Markdown' }).catch(e => {
        console.warn('Telegram send error:', e.message);
      });
    }
  } catch (e) {
    console.error('Notification error:', e);
  }
}

module.exports = { sendNotification, bot };
