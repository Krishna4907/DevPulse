# DevPulse — Smart Collaboration for Student Teams

> **Smart collaboration platform for student teams that balances skill learning with delivery speed through explore/exploit task assignment, automated Git integrations, and instant AI blocker diagnostics.**

---

## ⚡ Problem
Students in hackathons and coursework projects face unbalanced skill levels — one experienced person carries everything while beginners learn nothing, get stuck on bugs, or drop off. Traditional project management tools are static, manual, and unaware of developer skill growth.

---

## 💡 Solution
**DevPulse** is an AI-powered project collaboration platform that:
- **Assigns tasks based on skill level** using an explore/exploit algorithm (Safe vs Stretch vs Overload + Navigator pairing).
- **Auto-moves Kanban cards** when commits and PRs are pushed via automated GitHub webhooks.
- **Diagnoses blockers using AI** in under 2 seconds (Google Gemini 1.5 Flash).
- **Tracks skill growth automatically** on every pull request merge.

---

## ✨ Features

- 🔐 **GitHub OAuth Authentication**: Seamless developer sign-in and profile synchronization.
- ⚡ **Smart Task Assignment**: Intelligent scoring engine categorizing tasks into:
  - **Safe**: Member already has 100% of required skills.
  - **Stretch**: Member has ~50%+ skills, assigned to promote learning.
  - **Overload**: Member has <50% skills, automatically pairs with an experienced navigator.
- 🔗 **Real-Time Git-Powered Kanban Board**:
  - Auto-moves tasks to *In Progress* on commit with `#taskId`.
  - Auto-moves tasks to *In Review* on Pull Request creation.
  - Auto-moves tasks to *Done* and awards skill badges upon PR merge.
- 🤖 **AI Blocker Diagnosis**:
  - Instant root cause analysis, actionable code fix, and reference documentation links in under 2 seconds powered by Google Gemini.
- 💬 **Real-Time Team Chat**:
  - Firestore live message synchronization, typing presence indicators, and unread badges.
- 🟢 **Member Presence Tracking**:
  - Live active/idle/blocked status indicators for team awareness.
- 📊 **Leader Dashboard & Skill Coverage Matrix**:
  - Live team overview metrics, unresolved blockers panel with 1-click resolve, and tech stack capability gap analysis.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS + Vanilla CSS Micro-animations
- **Database & Auth**: Firebase Auth + Cloud Firestore (Real-time listeners) + Firebase Admin SDK
- **AI Engine**: Google Gemini 1.5 Flash API
- **Webhooks**: GitHub REST & Webhook APIs
- **Deployment**: Vercel

---

## 🌐 Live Demo & Repository

- **Live URL**: [https://devpulse-collab.vercel.app](https://devpulse-collab.vercel.app)
- **GitHub Repository**: [https://github.com/Krishna4907/DevPulse](https://github.com/Krishna4907/DevPulse)

---

## 🚀 Setup & Local Development

### 1. Clone the repository
```bash
git clone https://github.com/Krishna4907/DevPulse.git
cd DevPulse
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local` and add your Firebase and Gemini credentials:
```bash
cp .env.example .env.local
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🏆 Built for
**Razorpay Buildathon 2026 — Open Track**
