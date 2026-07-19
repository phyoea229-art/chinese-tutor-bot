// ============================================================
// Vercel Serverless Entry — Registration Bot (Webhook Mode)
// ============================================================
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { supabase } = require('../shared/supabase');
require('dotenv').config();

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT1_REGISTER_TOKEN;
const TUTOR_BOT_LINK = process.env.TUTOR_BOT_LINK || 'https://t.me/YourTutorBot';
const OWNER_ID = process.env.OWNER_TELEGRAM_ID;
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;

// Webhook handler — no polling
const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${process.env.VERCEL_URL}/api/register-bot`);

// Store pending registrations (in-memory; use Redis for production)
const pendingRegistrations = new Map();

app.post('/api/register-bot', async (req, res) => {
  const msg = req.body.message || req.body.callback_query?.message;
  const query = req.body.callback_query;

  if (query) {
    // Handle callback queries (approve/reject)
    const chatId = query.message.chat.id;
    const data = query.data;

    if (chatId != OWNER_ID) {
      return res.sendStatus(200);
    }

    const [action, telegramId] = data.split('_');
    const newStatus = action === 'approve' ? 'active' : 'rejected';

    await supabase
      .from('students')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('telegram_id', telegramId);

    await bot.editMessageText(
      `✅ ${action === 'approve' ? 'အတည်ပြုပြီး' : 'ငြင်းပယ်လိုက်ပြီ'} — ${telegramId}`,
      { chat_id: chatId, message_id: query.message.message_id }
    );

    if (action === 'approve') {
      await bot.sendMessage(parseInt(telegramId),
        '✅ အတည်ပြုခြင်းအောင်မြင်ပါသည်! 🎉\n\n' +
        'သင်၏ စာရင်းကို အက်မင်မှ အတည်ပြုလိုက်ပါပြီ။\n' +
        `🤖 Tutor Bot: ${TUTOR_BOT_LINK}\n\n` +
        '🎁 အခမဲ့ ၃၀ ရက်ကြာ သင်ယူခွင့် — ပျော်ရွှင်စွာသင်ယူပါ။'
      );
    } else {
      await bot.sendMessage(parseInt(telegramId), '❌ စာရင်းသွင်းခြင်းငြင်းပယ်ခံရပါသည်။');
    }

    return res.sendStatus(200);
  }

  if (!msg) return res.sendStatus(200);

  const chatId = msg.chat.id;
  const telegramId = msg.from.id;
  const text = msg.text || '';

  // /start command
  if (text === '/start') {
    await bot.sendMessage(chatId,
      '🎯 မင်္ဂလာပါရှင်! တရုတ်စာ AI Tutor စနစ်မှ ကြိုဆိုပါတယ်။\n\n' +
      '🎁 အခမဲ့ ၃၀ ရက် (Free 30-Day Trial)\n\n' +
      'ဆက်လုပ်ရန် /register ကိုနှိပ်ပါ။'
    );
    return res.sendStatus(200);
  }

  // /register command
  if (text === '/register') {
    const { data: existing } = await supabase
      .from('students')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (existing) {
      await bot.sendMessage(chatId, `✅ သင်သည် စာရင်းသွင်းပြီးသားဖြစ်ပါတယ်။ Status: ${existing.status}`);
      return res.sendStatus(200);
    }

    pendingRegistrations.set(chatId, { step: 'awaiting_name', telegramId });
    await bot.sendMessage(chatId, 'ကျေးဇူးပြု၍ သင့်နာမည်အပြည့်အစုံကို ရိုက်ထည့်ပါ။');
    return res.sendStatus(200);
  }

  // Handle registration steps
  const reg = pendingRegistrations.get(chatId);
  if (!reg) return res.sendStatus(200);

  if (reg.step === 'awaiting_name') {
    reg.fullName = text;
    reg.step = 'awaiting_slot';
    pendingRegistrations.set(chatId, reg);
    await bot.sendMessage(chatId,
      'ကျေးဇူးပါ။ သင်တန်းချိန်ရွေးပါ။\n\n' +
      '(1) 11:00 AM - 12:00 PM\n(2) 7:00 PM - 8:00 PM\n\n' +
      '"1" သို့မဟုတ် "2" ရိုက်ထည့်ပါ။'
    );
    return res.sendStatus(200);
  }

  if (reg.step === 'awaiting_slot') {
    let timeSlot;
    if (text === '1') timeSlot = '11:00-12:00';
    else if (text === '2') timeSlot = '19:00-20:00';
    else {
      await bot.sendMessage(chatId, '"1" သို့မဟုတ် "2" ကိုသာရွေးပါ။');
      return res.sendStatus(200);
    }

    await supabase.from('students').insert({
      telegram_id: reg.telegramId,
      full_name: reg.fullName,
      time_slot: timeSlot,
      status: 'pending'
    });

    pendingRegistrations.delete(chatId);

    await bot.sendMessage(chatId,
      '📝 စာရင်းသွင်းပြီးပါပြီ!\n\n⏳ အက်မင်အတည်ပြုဖို့စောင့်ပါ။'
    );

    // Notify owner
    if (OWNER_ID) {
      await bot.sendMessage(OWNER_ID,
        `🆕 ${reg.fullName} (${reg.telegramId}) — ${timeSlot}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Approve', callback_data: `approve_${reg.telegramId}` },
              { text: '❌ Reject', callback_data: `reject_${reg.telegramId}` }
            ]]
          }
        }
      );
    }
  }

  res.sendStatus(200);
});

module.exports = app;