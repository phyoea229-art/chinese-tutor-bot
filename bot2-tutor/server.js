// ============================================================
// BOT 2: AI Chinese Tutor — Anti-Spam + Button Response System
// Students reply with buttons. Spam/troll = auto ban.
// ============================================================
const TelegramBot = require('node-telegram-bot-api');
const { supabase, canAccessTutor, getProgress } = require('../shared/supabase');

require('dotenv').config();

const TOKEN = process.env.BOT2_TUTOR_TOKEN;
const OR_KEY = process.env.OPENROUTER_API_KEY;
const AI_MODEL = process.env.AI_MODEL || 'deepseek/deepseek-v4-flash';
const SESSION_MINUTES = parseInt(process.env.SESSION_DURATION_MINUTES) || 60;

const bot = new TelegramBot(TOKEN, { polling: true });
const sessions = new Map();

// Anti-spam tracking
const spamTracker = new Map(); // telegramId -> { msgCount, lastReset, warnings }

const SPAM_LIMIT = 5;         // Max messages before warning
const SPAM_WINDOW_MS = 30000; // 30 second window
const MAX_WARNINGS = 2;       // 2 warnings = ban

// Load all 30 days of curriculum dynamically
const curriculum = {};
for (let day = 1; day <= 30; day++) {
  try {
    const dayData = require(`../curriculum/day${day}.json`);
    Object.assign(curriculum, dayData);
  } catch (e) { /* skip */ }
}
console.log(`📚 Loaded ${Object.keys(curriculum).length} days of curriculum`);

// Professional system prompt
const SYSTEM_PROMPT = `You are a fun, friendly, and professional Chinese language teacher for Myanmar youth. You talk like a cool older friend who really knows Chinese.

YOUR TEACHING STYLE:
- Speak like a Myanmar friend: warm, funny, and casual but still professional.
- Give LOTS of examples. For each word, give 2-3 example sentences in Chinese + Myanmar translation.
- Share fun facts: compare Chinese with Myanmar culture, explain why the word is used that way.
- Use emojis and Myanmar slang to connect with youth.

TEACHING METHOD (follow this order strictly per lesson):
1. INTRODUCTION: Present the word with Chinese character, pinyin, tone number. Explain meaning in Myanmar.
2. PRONUNCIATION TIP: Compare with similar Myanmar sounds. Give a funny or memorable tip.
3. CULTURE/SOCIAL TIP: Share a fun fact about how this word is used in real Chinese life.
4. EXAMPLES: Give 2-3 example sentences. First one simple, second one more natural.
5. STUDENT PRACTICE: Ask them to say the word. Be encouraging and casual.
6. EVALUATION: Check their answer. If correct → praise them like a proud friend. If wrong → explain WHY in a nice way, then let them try again.

RULES:
- Speak in MYANMAR language 95% of the time. Use English only for Chinese terms.
- Each feedback should be 3-5 sentences — detailed but not overwhelming.
- Always be encouraging. Never make them feel bad for mistakes.
- For voice messages, accept any reasonable attempt and praise the effort.
- Make learning feel like hanging out with a friend who teaches Chinese.

OUTPUT FORMAT — always reply as JSON ONLY:
{"correct": true/false, "feedback": "detailed Myanmar teaching feedback here (2-4 sentences, friendly tone, with examples if they got it right)", "next_step": "explain_or_practice"}`;

// ===================== ANTI-SPAM CHECK =====================
async function checkSpam(telegramId, chatId, fullName) {
  if (!spamTracker.has(telegramId)) {
    spamTracker.set(telegramId, { msgCount: 0, lastReset: Date.now(), warnings: 0 });
  }

  const track = spamTracker.get(telegramId);

  // Reset counter if window expired
  if (Date.now() - track.lastReset > SPAM_WINDOW_MS) {
    track.msgCount = 0;
    track.lastReset = Date.now();
  }

  track.msgCount++;

  // Check if spam limit hit
  if (track.msgCount > SPAM_LIMIT) {
    track.warnings++;
    track.msgCount = 0;
    track.lastReset = Date.now();

    if (track.warnings > MAX_WARNINGS) {
      // BAN the student
      await supabase.from('students')
        .update({ status: 'suspended', updated_at: new Date().toISOString() })
        .eq('telegram_id', telegramId);

      await bot.sendMessage(chatId,
        `🚫 သင့်အကောင့်ကို ပိတ်ပင်လိုက်ပါပြီ။\n\n` +
        `အကြောင်းရင်း: သင်ခန်းစာနဲ့မဆိုင်တဲ့ message များလွန်းခြင်း။\n` +
        `အက်မင်ကို ဆက်သွယ်ပါ။`
      );

      // Notify admin
      if (process.env.OWNER_TELEGRAM_ID) {
        await bot.sendMessage(process.env.OWNER_TELEGRAM_ID,
          `🚫 ${fullName} (ID: ${telegramId}) ကို spam ကြောင့် ban လိုက်ပါပြီ။`
        );
      }

      if (sessions.has(chatId)) {
        const session = sessions.get(chatId);
        session.timeouts.forEach(t => clearTimeout(t));
        sessions.delete(chatId);
      }
      return true; // banned
    } else {
      // Warning
      await bot.sendMessage(chatId,
        `⚠️ သတိပေးချက်! တစ်မိနစ်အတွင်း message များလွန်းနေပါတယ်။\n\n` +
        `သင်ခန်းစာနဲ့ဆိုင်တဲ့အဖြေကိုပဲ ပို့ပေးပါ။\n` +
        `နောက်တစ်ကြိမ်ထပ်ရင် အကောင့်ပိတ်ခံရမှာပါ။`
      );
    }
  }
  return false; // not banned
}

// ===================== START COMMAND =====================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  const { allowed, reason, student } = await canAccessTutor(telegramId);
  if (!allowed) {
    const messages = {
      not_registered: '❌ သင်သည် စာရင်းမသွင်းရသေးပါ။ Registration Bot မှ စာရင်းသွင်းပါ။',
      not_active: '❌ သင့်အကောင့်ကို အတည်မပြုရသေးပါ။ အက်မင်ကို ဆက်သွယ်ပါ။',
      wrong_time_slot: '⏰ သင်၏သင်တန်းချိန်မဟုတ်သေးပါ။ သင့်ချိန်ရောက်မှ ပြန်လာပါ။'
    };
    return bot.sendMessage(chatId, messages[reason] || 'ဝင်ရောက်ခွင့်မရှိပါ။');
  }

  // Check if student is banned
  if (student.status === 'suspended') {
    return bot.sendMessage(chatId, '🚫 သင့်အကောင့်ပိတ်ထားပါတယ်။ အက်မင်ကိုဆက်သွယ်ပါ။');
  }

  const progress = await getProgress(student.id);

  if (sessions.has(chatId)) {
    return bot.sendMessage(chatId, 'သင်ခန်းစာကို ဆက်လက်သင်ယူနေပါတယ်။ ကျေးဇူးပြု၍ စာပြန်ပို့ပါ။');
  }

  const session = {
    studentId: student.id,
    telegramId: telegramId,
    day: progress.current_day || 1,
    lessonIndex: progress.current_lesson_index || 0,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + SESSION_MINUTES * 60 * 1000),
    timeouts: [],
    step: 'intro'
  };
  sessions.set(chatId, session);

  await supabase.from('sessions').insert({
    student_id: student.id,
    day_number: session.day,
    started_at: session.startedAt.toISOString(),
    status: 'active'
  });

  const timeout = setTimeout(() => endSession(chatId), SESSION_MINUTES * 60 * 1000);
  session.timeouts.push(timeout);

  const dayData = curriculum[session.day];
  await bot.sendMessage(chatId,
    `🎯 ဟေး ${student.full_name} ! မင်္ဂလာပါရှင်။\n\n` +
    `ဒီနေ့တော့ တရုတ်စာကို အတူတူ သင်ကြရအောင်။\n` +
    `ငါက မင်းရဲ့ တရုတ်စာသူငယ်ချင်းပါ။\n\n` +
    `📚 ယနေ့သင်ခန်းစာ — ${dayData?.title || `နေ့ ${session.day}`}\n` +
    `⏱ သင်တန်းချိန်: ${SESSION_MINUTES} မိနစ်\n\n` +
    `👇 စလိုက်ကြရအောင်။`
  );

  sendLessonIntro(chatId);
});

// ===================== SEND LESSON WITH BUTTONS =====================
async function sendLessonIntro(chatId) {
  const session = sessions.get(chatId);
  if (!session) return;

  const dayData = curriculum[session.day];
  if (!dayData || session.lessonIndex >= dayData.lessons.length) {
    return endSession(chatId, true);
  }

  const lesson = dayData.lessons[session.lessonIndex];

  // Send word introduction
  await bot.sendMessage(chatId,
    `📖 သင်ခန်းစာ ${session.lessonIndex + 1}\n\n` +
    `တရုတ်လို: ${lesson.chinese}\n` +
    `Pinyin: ${lesson.pinyin}\n` +
    `အဓိပ္ပာယ်: ${lesson.meaning_my}`
  );

  if (lesson.video_file_id) {
    await bot.sendVideoNote(chatId, lesson.video_file_id);
  }

  // Send practice prompt with buttons
  await bot.sendMessage(chatId,
    `🎤 ဒီစာလုံးကို ပြန်ဖတ်ကြည့်ပါ။\n\n` +
    `"${lesson.chinese}" (${lesson.pinyin})\n\n` +
    `အသံဖိုင်ပို့ပါ (၃-၅ စက္ကန့်လောက်ပဲ) သို့မဟုတ် စာရိုက်ပြီးဖြေပါ။`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ နားလည်ပြီ (Understand)', callback_data: `understand_${session.lessonIndex}` },
            { text: '🔄 ထပ်ရှင်းပြပါ (Explain again)', callback_data: `reexplain_${session.lessonIndex}` }
          ]
        ]
      }
    }
  );

  session.step = 'practice';
  // No auto-advance timeout — wait for student response
  // Remind student after 2 minutes
  session.remindTimeout = setTimeout(() => {
    const currentLesson = dayData?.lessons[session.lessonIndex];
    bot.sendMessage(chatId,
      `⏳ ငါဒီမှာရှိနေတယ်နော်။ "${currentLesson?.chinese || session.lessonIndex}" ကိုဖြေဖို့မမေ့နဲ့။\n` +
      `ပြန်ဖတ်ကြည့်ပါဦး။`
    );
  }, 120000);
}

// ===================== BUTTON HANDLER =====================
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const session = sessions.get(chatId);
  if (!session) return;

  const data = query.data;
  const lessonIndex = parseInt(data.split('_')[1]);

  if (data.startsWith('understand_')) {
    // Student says they understand — ask for voice/text reply
    await bot.sendMessage(chatId,
      `👍 ကောင်းတယ်! ဒါဆို မင်းပြန်ဖတ်ပြပါ။\n\n` +
      `"${session.lessonIndex}" ဆိုတဲ့ စာလုံးကို အသံဖိုင်ပို့ပါ။\n` +
      `၃-၅ စက္ကန့်လောက်ပဲ လုံလောက်ပါတယ်။`
    );
  } else if (data.startsWith('reexplain_')) {
    // Re-explain the current lesson
    const dayData = curriculum[session.day];
    const lesson = dayData?.lessons[session.lessonIndex];
    if (lesson) {
      await bot.sendMessage(chatId,
        `🔄 ထပ်ရှင်းပြပါမယ်။\n\n` +
        `တရုတ်လို: ${lesson.chinese}\n` +
        `Pinyin: ${lesson.pinyin}\n` +
        `အဓိပ္ပာယ်: ${lesson.meaning_my}\n\n` +
        `ဒီစာလုံးကို ${lesson.pinyin} အတိုင်းဖတ်ရုံပဲ။\n` +
        `ဥပမာ: ${lesson.example_sentence || `${lesson.chinese}，你好။`}\n\n` +
        `အခု မင်းပြန်ဖတ်ကြည့်ပါ။`
      );
    }
  }

  await bot.answerCallbackQuery(query.id, { text: 'Done!' });
});

// ===================== MESSAGE HANDLER WITH ANTI-SPAM =====================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const session = sessions.get(chatId);
  if (!session) return;
  if (!msg.text && !msg.voice) return;

  const telegramId = msg.from.id;
  const fullName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();

  // === ANTI-SPAM CHECK ===
  const banned = await checkSpam(telegramId, chatId, fullName);
  if (banned) return;

  // Clear timeouts
  if (session.timeouts.length > 0) {
    session.timeouts.forEach(t => clearTimeout(t));
    session.timeouts = [];
  }
  if (session.remindTimeout) {
    clearTimeout(session.remindTimeout);
    session.remindTimeout = null;
  }

  // Check voice message length (should be short)
  if (msg.voice && msg.voice.duration > 10) {
    return bot.sendMessage(chatId,
      `⏱ အသံဖိုင်က ၁၀ စက္ကန့်ထက်မကျော်စေနဲ့။\n` +
      `၃-၅ စက္ကန့်လောက်ပဲ လုံလောက်ပါတယ်။ ထပ်ကြိုးစားပါ။`
    );
  }

  const studentResponse = msg.text || '[voice message received]';
  const dayData = curriculum[session.day];
  const lesson = dayData?.lessons[session.lessonIndex];
  if (!lesson) return;

  // === AI EVALUATION ===
  await bot.sendChatAction(chatId, 'typing');

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OR_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content:
            `Current word: "${lesson.chinese}" (${lesson.pinyin}) meaning: ${lesson.meaning_my}\n` +
            `Teaching step: "${session.step}"\n` +
            `Student response: "${studentResponse}"\n\n` +
            `Evaluate the student's response. Be encouraging. Give a short teaching tip in Myanmar.`
          }
        ],
        temperature: 0.4,
        max_tokens: 300
      })
    });

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '';
    let evaluation;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      evaluation = jsonMatch ? JSON.parse(jsonMatch[0]) : { correct: false, feedback: 'ပြန်လေ့ကျင့်ကြည့်ပါဦး။' };
    } catch (e) {
      evaluation = { correct: false, feedback: 'ထပ်ကြိုးစားကြည့်ပါ။ မင်းလုပ်နိုင်တယ်။' };
    }

    await bot.sendMessage(chatId, evaluation.feedback);

    if (evaluation.correct) {
      await bot.sendMessage(chatId,
        `✅ အောင်မြင်ပြီ! "${lesson.chinese}" (${lesson.pinyin}) ကို မင်းကောင်းကောင်းပြောနိုင်ပြီ။\n\n` +
        `📝 ဥပမာ: "${lesson.example_sentence || `${lesson.chinese}，你好。`}"\n\n` +
        `ဆက်လေ့လာကြရအောင် 👇`
      );

      session.lessonIndex++;
      await supabase.from('progress')
        .update({ current_lesson_index: session.lessonIndex, updated_at: new Date().toISOString() })
        .eq('student_id', session.studentId);

      sendLessonIntro(chatId);
    } else {
      await bot.sendMessage(chatId,
        `ထပ်ကြိုးစားကြည့်ပါ။ "${lesson.chinese}" ကို Pinyin "${lesson.pinyin}" အတိုင်းဖတ်ကြည့်ပါ။`
      );

      // No auto-advance — wait for student to try again
      session.remindTimeout = setTimeout(() => {
        bot.sendMessage(chatId,
          `⏳ ငါဒီမှာရှိနေတယ်။ "${lesson.chinese}" ကိုထပ်ကြိုးစားကြည့်ပါဦး။`
        );
      }, 120000);
    }
  } catch (err) {
    console.error('OpenRouter API error:', err.message);
    await bot.sendMessage(chatId, '⚠️ နည်းပညာအမှားရှိနေပါတယ်။ နောက်သင်ခန်းစာကို ဆက်သွားပါမယ်။');
    session.lessonIndex++;
    sendLessonIntro(chatId);
  }
});

// ===================== END SESSION =====================
async function endSession(chatId, completedDay = false) {
  const session = sessions.get(chatId);
  if (!session) return;

  session.timeouts.forEach(t => clearTimeout(t));
  session.timeouts = [];

  if (completedDay) {
    await supabase.from('progress')
      .update({
        current_day: session.day + 1,
        current_lesson_index: 0,
        completed: true,
        updated_at: new Date().toISOString()
      })
      .eq('student_id', session.studentId);

    await bot.sendMessage(chatId,
      `🎉 ဂုဏ်ယူပါတယ်! နေ့ ${session.day} ပြီးဆုံးသွားပါပြီ။\n\n` +
      `မင်း သင်ယူမှုမှာ တိုးတက်မှုရှိပါတယ်။ နောက်နေ့ကျရင် ဆက်လေ့လာပါမယ်။ 💪`
    );
  } else {
    await supabase.from('sessions')
      .update({
        ended_at: new Date().toISOString(),
        lessons_covered: session.lessonIndex,
        status: 'expired'
      })
      .eq('student_id', session.studentId)
      .eq('status', 'active');

    await bot.sendMessage(chatId,
      `⏰ သင်တန်းချိန်ကုန်ဆုံးသွားပါပြီ။\n\nနောက်နေ့ကျရင် ဆက်လေ့လာနိုင်ပါတယ်။`
    );
  }

  sessions.delete(chatId);
}

console.log('🤖🎯 AI Chinese Tutor — Anti-Spam + Buttons is running...');

// Helper: file_id for admin
bot.on('video_note', async (msg) => {
  const uid = msg.from.id.toString();
  if (uid === process.env.OWNER_TELEGRAM_ID || uid === process.env.ADMIN_TELEGRAM_ID) {
    console.log('📹 Video file_id:', msg.video_note.file_id);
    await bot.sendMessage(msg.chat.id, `file_id: ${msg.video_note.file_id}`);
  }
});

module.exports = bot;