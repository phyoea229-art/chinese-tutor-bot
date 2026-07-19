-- ============================================================
-- Telegram Chinese Tutor System - Supabase Database Schema
-- ============================================================

-- 1. STUDENTS TABLE
-- Stores all registered student info
CREATE TABLE students (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  language TEXT DEFAULT 'my',  -- 'my' = Myanmar, 'en' = English
  status TEXT DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'suspended')),
  time_slot TEXT CHECK (time_slot IN ('11:00-12:00', '19:00-20:00')),
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PROGRESS TABLE
-- Tracks daily lesson progress for each student
CREATE TABLE progress (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  current_day INT DEFAULT 1 CHECK (current_day BETWEEN 1 AND 30),
  current_lesson_index INT DEFAULT 0,
  session_started_at TIMESTAMPTZ,
  session_ends_at TIMESTAMPTZ,
  completed BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. DAILY SESSIONS LOG
-- Records history of every tutoring session
CREATE TABLE sessions (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  day_number INT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  lessons_covered INT DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired'))
);

-- 4. PAYMENTS TABLE
-- Tracks payment verification
CREATE TABLE payments (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  screenshot_file_id TEXT,
  amount DECIMAL(10,2),
  verified BOOLEAN DEFAULT FALSE,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX idx_students_status ON students(status);
CREATE INDEX idx_students_time_slot ON students(time_slot);
CREATE INDEX idx_progress_student ON progress(student_id);
CREATE INDEX idx_sessions_student ON sessions(student_id);
CREATE INDEX idx_payments_student ON payments(student_id);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_progress_updated_at
  BEFORE UPDATE ON progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();