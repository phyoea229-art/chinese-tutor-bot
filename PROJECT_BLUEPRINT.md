# SU Chinese Tutor — Project Blueprint & Setup Guide

---

# 📋 PROJECT OVERVIEW

| Item | Detail |
|------|--------|
| **Project Name** | SU Chinese Tutor |
| **Description** | AI-powered Telegram Chinese tutor for 10-100 students |
| **Tech Stack** | Node.js, Supabase, OpenRouter AI, Vercel |
| **Deployment** | GitHub → Vercel (auto-deploy) |
| **Live URL** | https://chinese-tutor-bot-su.vercel.app |

---

# 🤖 BOT 1 — Registration Bot (@sulearninghubcustomerservice_bot)

**Bot Token:** `(see vercel-env.txt or .env file)`

**Purpose:** Student onboarding + admin approval

**Flow:**
1. User sends `/start` → welcome message with free 30-day trial
2. User sends `/register` → enters name → selects time slot
3. Saved as `pending` in Supabase
4. Owner (ID: 5349618042) gets Approve/Reject buttons
5. Approved → student can use Tutor Bot

**Webhook URL:** `https://chinese-tutor-bot-su.vercel.app/api/register-bot`

---

# 🤖🎯 BOT 2 — Tutor Bot (@sulearninghubchinesetutor_bot)

**Bot Token:** `(see vercel-env.txt or .env file)`

**Purpose:** Interactive AI Chinese tutor with step-by-step teaching

**Flow:**
1. User sends `/start` → checks active status
2. Sends lesson (Chinese word + Pinyin + meaning)
3. Student replies with voice/text → AI evaluates
4. Correct → next lesson. Wrong → try again
5. 60 min session → auto ends

**Features:** Anti-spam, voice limit (10s), inline buttons, 30-day curriculum, Myanmar language

**Webhook URL:** `https://chinese-tutor-bot-su.vercel.app/api/tutor-bot`

---

# 🗄️ DATABASE (Supabase)

**Project URL:** `https://nxuschdtjazkppixhskn.supabase.co`
**Anon Key:** `(see vercel-env.txt)`

**Tables:** `students`, `progress`, `sessions`, `payments`

**SQL File:** `database/schema.sql`

---

# 🧠 AI

**Provider:** OpenRouter
**Model:** `google/gemini-2.5-flash`
**API Key:** `(see vercel-env.txt)`

---

# 📁 PROJECT STRUCTURE

```
chinese-tutor-bot/
├── api/
│   ├── register-bot.js      # Bot 1 webhook (Vercel)
│   └── tutor-bot.js          # Bot 2 webhook (Vercel)
├── bot1-registration/
│   └── server.js             # Local version (not deployed)
├── bot2-tutor/
│   └── server.js             # Local version (not deployed)
├── curriculum/
│   ├── day1.json             # 20 lessons: Greetings & Basics
│   ├── day2.json             # 10 lessons: Numbers 1-10
│   └── complete_30day_plan.md
├── database/
│   └── schema.sql
├── shared/
│   └── supabase.js
├── index.html                # Telegram Mini App
├── vercel.json
├── package.json
├── .gitignore
├── vercel-env.txt            # ⚠️ ALL SECRETS HERE (do not commit)
└── PROJECT_BLUEPRINT.md      # This file
```

---

# 🔧 ENVIRONMENT VARIABLES (vercel-env.txt)

Create a `vercel-env.txt` file with these values:

```env
BOT1_REGISTER_TOKEN=YOUR_BOT1_TOKEN_HERE
BOT2_TUTOR_TOKEN=YOUR_BOT2_TOKEN_HERE
SUPABASE_URL=https://nxuschdtjazkppixhskn.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY_HERE
OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY_HERE
AI_MODEL=google/gemini-2.5-flash
OWNER_TELEGRAM_ID=5349618042
ADMIN_TELEGRAM_ID=-5625864204
TUTOR_BOT_LINK=https://t.me/sulearninghubchinesetutor_bot
SESSION_DURATION_MINUTES=60
```

> **⚠️ IMPORTANT:** This file contains secrets. Do NOT commit to GitHub.
> The `.gitignore` already excludes it. Keep it safe on your computer.

---

# 🚀 SETUP ON NEW DEVICE

## Step 1: Install Requirements
- Node.js (v18+): https://nodejs.org
- Git: https://git-scm.com

## Step 2: Clone & Install
```bash
git clone https://github.com/phyoea229-art/chinese-tutor-bot.git
cd chinese-tutor-bot
npm install
```

## Step 3: Create vercel-env.txt
Create `vercel-env.txt` with all env vars (use the list above).
Then import it into Vercel dashboard.

## Step 4: Setup Supabase
1. Go to https://supabase.com → Sign in
2. Open project: `nxuschdtjazkppixhskn`
3. **SQL Editor** → paste `database/schema.sql` → Run

## Step 5: Deploy to Vercel
1. Go to https://vercel.com → Import `chinese-tutor-bot` repo
2. Import `vercel-env.txt` as environment variables
3. Deploy

## Step 6: Set Webhooks
```bash
# Register Bot webhook
curl -F "url=https://YOUR-VERCEL-URL.vercel.app/api/register-bot" \
  "https://api.telegram.org/botYOUR_BOT1_TOKEN/setWebhook"

# Tutor Bot webhook
curl -F "url=https://YOUR-VERCEL-URL.vercel.app/api/tutor-bot" \
  "https://api.telegram.org/botYOUR_BOT2_TOKEN/setWebhook"
```

## Step 7: Test
1. Open **@sulearninghubcustomerservice_bot** → `/register`
2. Check Telegram → Approve
3. Open **@sulearninghubchinesetutor_bot** → `/start`

---

# 🎯 ADMIN ROLES

| Role | ID | Permissions |
|------|----|------------|
| **Owner** | `5349618042` | Can approve/reject students |
| **Admin** | `-5625864204` | Gets notified only |

---

# 🔗 LINKS

| Resource | Link |
|----------|------|
| GitHub Repo | https://github.com/phyoea229-art/chinese-tutor-bot |
| Live Site | https://chinese-tutor-bot-su.vercel.app |
| Supabase | https://supabase.com/dashboard/project/nxuschdtjazkppixhskn |
| Register Bot | https://t.me/sulearninghubcustomerservice_bot |
| Tutor Bot | https://t.me/sulearninghubchinesetutor_bot |

---

# 📝 NOTES
- **Supabase anon key** is safe for client-side
- **OpenRouter key** and **bot tokens** are server-side only
- Vercel auto-deploys on push to master
- Add more days by creating `day3.json` through `day30.json`
- Add video notes by setting `video_file_id` in curriculum JSON files