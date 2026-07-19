// ============================================================
// BOT 1: Registration Bot
// Free 30-day trial — no payment needed. Admin approve/reject.
// ============================================================
const TelegramBot = require('node-telegram-bot-api');
const { supabase } = require('../shared/supabase');
require('dotenv').config();

const TOKEN = process.env.BOT1_REGISTER_TOKEN;
const TUTOR_BOT_LINK = process.env.TUTOR_BOT_LINK || 'https://t.me/YourTutorBot';
const OWNER_ID = process.env.OWNER_TELEGRAM_ID; // Owner — gets approve/reject buttons
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID; // Admin — gets notified only

const bot = new TelegramBot(TOKEN, { polling: true });

// ===================== /START =====================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId,
    '🎯 မင်္ဂလာပါရှင်! တရုတ်စာ AI Tutor စနစ်မှ ကြိုဆိုပါတယ်။\n\n' +
    '🎁 အခမဲ့ စမ်းသပ်သင်ယူခွင့် — ၃၀ ရက် (Free 30-Day Trial)\n\n' +
    'ဒီ Bot ကနေ စာရင်းသွင်းပြီးရင် အက်မင်က အတည်ပြုပေးပါမယ်။\n' +
    'အတည်ပြုပြီးမှ Tutor Bot ကို ဝင်ရောက်သင်ယူနိုင်ပါမယ်။\n\n' +
    'ဆက်လုပ်ရန် /register ကိုနှိပ်ပါ။');
});

// ===================== /REGISTER =====================
bot.onText(/\/register/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  // Check if already registered
  const { data: existing } = await supabase
    .from('students')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (existing) {
    if (existing.status === 'pending') {
      return bot.sendMessage(chatId, '⏳ သင့်စာရင်းကို အက်မင်က စစ်ဆေးနေပါတယ်။ ခဏစောင့်ပါ။');
    }
    return bot.sendMessage(chatId,
      '✅ သင်သည် စာရင်းသွင်းပြီးသားဖြစ်ပါတယ်။\n' +
      `Status: ${existing.status === 'active' ? '✅ အတည်ပြုပြီး' : '❌ ငြင်းပယ်ခံရ'}\n\n` +
      `Tutor Bot သို့ဝင်ရောက်ရန်: ${TUTOR_BOT_LINK}`
    );
  }

  // Step 1: Name
  await bot.sendMessage(chatId,
    'ကျေးဇူးပြု၍ သင့်နာမည်အပြည့်အစုံကို ရိုက်ထည့်ပါ။',
    { reply_markup: { force_reply: true } }
  );

  global.pendingRegistrations = global.pendingRegistrations || new Map();
  global.pendingRegistrations.set(chatId, { step: 'awaiting_name', telegramId });
});

// ===================== MESSAGE HANDLER =====================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (!global.pendingRegistrations?.has(chatId)) return;
  const reg = global.pendingRegistrations.get(chatId);

  // --- Name ---
  if (reg.step === 'awaiting_name') {
    reg.fullName = msg.text;
    reg.step = 'awaiting_slot';
    global.pendingRegistrations.set(chatId, reg);

    return bot.sendMessage(chatId,
      'ကျေးဇူးပါ။ ယခု သင့်အတွက် အဆင်ပြေမည့် သင်ကြားချိန်ကို ရွေးချယ်ပါ။\n\n' +
      'သင်တန်းချိန် (၁) - 11:00 AM မှ 12:00 PM\n' +
      'သင်တန်းချိန် (၂) - 7:00 PM မှ 8:00 PM\n\n' +
      'ကျေးဇူးပြု၍ "1" သို့မဟုတ် "2" ကိုရိုက်ထည့်ပါ။'
    );
  }

  // --- Time Slot ---
  if (reg.step === 'awaiting_slot') {
    let timeSlot;
    if (msg.text === '1') timeSlot = '11:00-12:00';
    else if (msg.text === '2') timeSlot = '19:00-20:00';
    else return bot.sendMessage(chatId, 'ကျေးဇူးပြု၍ "1" (မနက်ပိုင်း) သို့မဟုတ် "2" (ညနေပိုင်း) ကိုသာရွေးချယ်ပါ။');

    reg.timeSlot = timeSlot;

    // Save as 'pending' — no payment needed
    const { error } = await supabase.from('students').insert({
      telegram_id: reg.telegramId,
      full_name: reg.fullName,
      time_slot: timeSlot,
      status: 'pending'
    });

    if (error) {
      console.error('DB insert error:', error);
      return bot.sendMessage(chatId, 'စာရင်းသွင်းရာတွင် အမှားရှိနေပါတယ်။ နောက်မှထပ်ကြိုးစားပါ။');
    }

    global.pendingRegistrations.delete(chatId);

    // Notify student
    await bot.sendMessage(chatId,
      '📝 စာရင်းသွင်းပြီးပါပြီ!\n\n' +
      '⏳ အက်မင်က သင့်စာရင်းကို စစ်ဆေးအတည်ပြုပေးပါမယ်။\n' +
      'ခဏစောင့်ပါ — အတည်ပြုပြီးတာနဲ့ အကြောင်းကြားပါမယ်။\n\n' +
      `သင်၏သင်တန်းချိန်: ${timeSlot === '11:00-12:00' ? 'မနက် ၁၁နာရီ' : 'ညနေ ၇နာရီ'}`
    );

    // Notify owner with approve/reject buttons
    if (OWNER_ID) {
      await bot.sendMessage(OWNER_ID,
        `🆕 စာရင်းသွင်းသူအသစ် \n\n` +
        `နာမည်: ${reg.fullName}\n` +
        `Telegram ID: ${reg.telegramId}\n` +
        `သင်တန်းချိန်: ${timeSlot === '11:00-12:00' ? 'မနက် ၁၁နာရီ' : 'ညနေ ၇နာရီ'}\n` +
        `Username: @${msg.from.username || 'မရှိ'}`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Approve', callback_data: `approve_${reg.telegramId}` },
                { text: '❌ Reject', callback_data: `reject_${reg.telegramId}` }
              ]
            ]
          }
        }
      );
    }
    // Also notify admin (no buttons)
    if (ADMIN_ID && ADMIN_ID !== OWNER_ID) {
      await bot.sendMessage(ADMIN_ID,
        `🆕 စာရင်းသွင်းသူအသစ် \n\n` +
        `နာမည်: ${reg.fullName}\n` +
        `Telegram ID: ${reg.telegramId}\n` +
        `သင်တန်းချိန်: ${timeSlot === '11:00-12:00' ? 'မနက် ၁၁နာရီ' : 'ညနေ ၇နာရီ'}\n` +
        `Username: @${msg.from.username || 'မရှိ'}`
      );
    }
  }
});

// ===================== ADMIN APPROVE / REJECT =====================
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // Only owner can use these buttons
  if (chatId != OWNER_ID) {
    return bot.answerCallbackQuery(query.id, { text: 'သင်သည် owner မဟုတ်ပါ။' });
  }

  const [action, telegramId] = data.split('_');
  const newStatus = action === 'approve' ? 'active' : 'rejected';

  // Update DB
  const { error } = await supabase
    .from('students')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('telegram_id', telegramId);

  if (error) {
    await bot.sendMessage(chatId, `❌ DB error: ${error.message}`);
    return bot.answerCallbackQuery(query.id, { text: 'Error' });
  }

  // Notify admin
  await bot.editMessageText(
    `✅ ${action === 'approve' ? 'အတည်ပြုပြီး' : 'ငြင်းပယ်လိုက်ပြီ'} — ${telegramId}`,
    { chat_id: chatId, message_id: query.message.message_id }
  );

  // Notify student
  if (action === 'approve') {
    await bot.sendMessage(parseInt(telegramId),
      '✅ အတည်ပြုခြင်းအောင်မြင်ပါသည်! 🎉\n\n' +
      'သင်၏ စာရင်းကို အက်မင်မှ အတည်ပြုလိုက်ပါပြီ။\n' +
      'ယခု Tutor Bot သို့ဝင်ရောက်သင်ယူနိုင်ပါပြီ။\n\n' +
      `🤖 Tutor Bot: ${TUTOR_BOT_LINK}\n\n` +
      '🎁 အခမဲ့ ၃၀ ရက်ကြာ သင်ယူခွင့် — ပျော်ရွှင်စွာသင်ယူပါ။'
    );
  } else {
    await bot.sendMessage(parseInt(telegramId),
      '❌ စာရင်းသွင်းခြင်းငြင်းပယ်ခံရပါသည်။\n\n' +
      'ကျေးဇူးပြု၍ အက်မင်ကိုဆက်သွယ်ပါ။'
    );
  }

  await bot.answerCallbackQuery(query.id, { text: 'Done!' });
});

console.log('🤖 Registration Bot (Admin Approve/Reject) is running...');
module.exports = bot;