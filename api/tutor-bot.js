// ============================================================
// Vercel Serverless Entry — Tutor Bot (Webhook Mode)
// ============================================================
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { supabase, canAccessTutor, getProgress } = require('../shared/supabase');
require('dotenv').config();

const app = express();
app.use(express.json());

const TOKEN = process.env.BOT2_TUTOR_TOKEN;
const OR_KEY = process.env.OPENROUTER_API_KEY;
const AI_MODEL = process.env.AI_MODEL || 'google/gemini-2.5-flash';
const SESSION_MINUTES = parseInt(process.env.SESSION_DURATION_MINUTES) || 60;

const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${process.env.VERCEL_URL}/api/tutor-bot`);

// In-memory sessions (use Redis for production)
const sessions = new Map();

// Load curriculum
const curriculum = {};
for (let day = 1; day <= 30; day++) {
  try {
    const dayData = require(`../curriculum/day${day}.json`);
    Object.assign(curriculum, dayData);
  } catch (e) { /* skip */ }
}

const SYSTEM_PROMPT = `You are a fun, friendly Chinese tutor for Myanmar youth. Speak ONLY Myanmar language. Keep sentences short. Teach ONE word at a time. Wait for student response. Always include Chinese + Pinyin. Reply JSON: {"correct": true/false, "feedback": "Myanmar feedback"}`;

// Handle webhook updates
app.post('/api/tutor-bot', async (req, res) => {
  const msg = req.body.message;
  const query = req.body.callback_query;

  if (query) {
    // Handle button clicks (understand/reexplain)
    const chatId = query.message.chat.id;
    const session = sessions.get(chatId);
    if (session) {
      const data = query.data;
      if (data.startsWith('understand_')) {
        await bot.sendMessage(chatId, '👍 ကောင်းတယ်! ပြန်ဖတ်ပြပါ။');
      } else if (data.startsWith('reexplain_')) {
        const dayData = curriculum[session.day];
        const lesson = dayData?.lessons[session.lessonIndex];
        if (lesson) {
          await bot.sendMessage(chatId,
            `🔄 ${lesson.chinese} (${lesson.pinyin}) — ${lesson.meaning_my}\n\n` +
            `ဥပမာ: ${lesson.example_sentence || ''}\n\nပြန်ဖတ်ကြည့်ပါ။`
          );
        }
      }
    }
    return res.sendStatus(200);
  }

  if (!msg) return res.sendStatus(200);

  const chatId = msg.chat.id;
  const telegramId = msg.from.id;

  // /start command
  if (msg.text === '/start') {
    const { allowed, student } = await canAccessTutor(telegramId);
    if (!allowed) {
      const msg = '❌ ဝင်ရောက်ခွင့်မရှိပါ။ စာရင်းသွင်းရန် Registration Bot ကိုဆက်သွယ်ပါ။';
      return bot.sendMessage(chatId, msg).then(() => res.sendStatus(200));
    }

    const progress = await getProgress(student.id);
    const session = {
      studentId: student.id,
      day: progress.current_day || 1,
      lessonIndex: progress.current_lesson_index || 0,
      startedAt: new Date(),
      endsAt: new Date(Date.now() + SESSION_MINUTES * 60 * 1000),
      step: 'intro'
    };
    sessions.set(chatId, session);

    const dayData = curriculum[session.day];
    await bot.sendMessage(chatId,
      `🎯 ဟေး ${student.full_name}! ဒီနေ့ ${dayData?.title || `နေ့ ${session.day}`} သင်ရမယ်။\n\n` +
      `⏱ ${SESSION_MINUTES} မိနစ်\n\nစလိုက်ကြရအောင်။`
    );

    await sendLessonIntro(chatId, session);
    return res.sendStatus(200);
  }

  // Handle student responses
  const session = sessions.get(chatId);
  if (!session) return res.sendStatus(200);

  const dayData = curriculum[session.day];
  const lesson = dayData?.lessons[session.lessonIndex];
  if (!lesson) return res.sendStatus(200);

  const studentResponse = msg.text || '[voice]';

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
            `Word: "${lesson.chinese}" (${lesson.pinyin}) — ${lesson.meaning_my}\nStudent: "${studentResponse}"\n\nEvaluate. Reply JSON only.`
          }
        ],
        temperature: 0.4,
        max_tokens: 300
      })
    });

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '';
    let evaluation = { correct: false, feedback: 'ထပ်ကြိုးစားပါ။' };
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) evaluation = JSON.parse(jsonMatch[0]);
    } catch (e) {}

    await bot.sendMessage(chatId, evaluation.feedback);

    if (evaluation.correct) {
      await bot.sendMessage(chatId,
        `✅ အောင်မြင်ပြီ! "${lesson.chinese}" (${lesson.pinyin})\n\n` +
        `📝 ${lesson.example_sentence || ''}\n\nဆက်လေ့လာကြရအောင် 👇`
      );

      session.lessonIndex++;
      await supabase.from('progress')
        .update({ current_lesson_index: session.lessonIndex, updated_at: new Date().toISOString() })
        .eq('student_id', session.studentId);

      await sendLessonIntro(chatId, session);
    } else {
      await bot.sendMessage(chatId, `ထပ်ကြိုးစားပါ။ "${lesson.chinese}" (${lesson.pinyin})`);
    }
  } catch (err) {
    console.error('AI error:', err.message);
    await bot.sendMessage(chatId, '⚠️ နည်းပညာအမှား။ နောက်သင်ခန်းစာကိုဆက်ပါမယ်။');
    session.lessonIndex++;
    await sendLessonIntro(chatId, session);
  }

  res.sendStatus(200);
});

async function sendLessonIntro(chatId, session) {
  const dayData = curriculum[session.day];
  if (!dayData || session.lessonIndex >= dayData.lessons.length) {
    await bot.sendMessage(chatId, `🎉 နေ့ ${session.day} ပြီးပါပြီ။ နောက်နေ့ကျမှပြန်လေ့လာပါ။`);
    sessions.delete(chatId);
    return;
  }

  const lesson = dayData.lessons[session.lessonIndex];
  await bot.sendMessage(chatId,
    `📖 ${lesson.chinese} (${lesson.pinyin})\n${lesson.meaning_my}\n\n` +
    `ပြန်ဖတ်ကြည့်ပါ။`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ နားလည်ပြီ', callback_data: `understand_${session.lessonIndex}` },
          { text: '🔄 ထပ်ရှင်းပြပါ', callback_data: `reexplain_${session.lessonIndex}` }
        ]]
      }
    }
  );
  session.step = 'practice';
}

module.exports = app;