// ============================================================
// SHARED: Supabase client + helper functions
// ============================================================
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Check if student is active AND within their time slot
// 24-hour mode for testing — always allowed
async function canAccessTutor(telegramId) {
  const { data: student, error } = await supabase
    .from('students')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (error || !student) return { allowed: false, reason: 'not_registered' };
  if (student.status !== 'active') return { allowed: false, reason: 'not_active' };

  // 24-hour mode: allow access anytime
  // To enable time-limit, uncomment the block below
  /*
  const now = new Date();
  const hour = now.getUTCHours() + 6.5; // Myanmar UTC+6:30

  if (student.time_slot === '11:00-12:00' && (hour < 11 || hour >= 12))
    return { allowed: false, reason: 'wrong_time_slot' };
  if (student.time_slot === '19:00-20:00' && (hour < 19 || hour >= 20))
    return { allowed: false, reason: 'wrong_time_slot' };
  */

  return { allowed: true, student };
}

// Get or create progress record
async function getProgress(studentId) {
  const { data, error } = await supabase
    .from('progress')
    .select('*')
    .eq('student_id', studentId)
    .single();

  if (error) {
    const { data: newProgress } = await supabase
      .from('progress')
      .insert({ student_id: studentId })
      .select()
      .single();
    return newProgress;
  }
  return data;
}

module.exports = { supabase, canAccessTutor, getProgress };