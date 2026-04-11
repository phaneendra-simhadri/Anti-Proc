# AntiProc - Complete Project Details

## 1. Project Summary

AntiProc (Anti-Procrastination Execution System) is a discipline-first productivity web app built to reduce procrastination through strict daily execution rules, measurable progress, and focused work tracking.

Unlike generic to-do apps, AntiProc enforces a hard structure:

- Exactly 3 active daily targets
- Day finalization with consequences
- Streak and XP progression
- Deep work session logging with analytics

The app is designed for students and makers who want accountability and consistency, not just task listing.

## 2. Problem It Solves

Most productivity apps fail because they allow unlimited tasks, no consequences, and weak feedback loops. This creates planning overload and low execution.

AntiProc solves this by:

- Limiting daily scope (3 active targets)
- Requiring explicit day finalization
- Applying reward/penalty mechanics
- Tracking focus quality, not just task checkboxes

## 3. Core Product Philosophy

- Constraint over freedom: fewer tasks, higher completion probability
- Execution over planning: complete work before adding more
- Consistency over intensity: streak and trends matter
- Visible accountability: every day is logged and measurable

## 4. Current Feature Set

### 4.1 Daily Task System

- Add tasks with category selection
- Maximum 3 active tasks at a time
- Mark tasks done, edit, delete, or carry forward
- Carry-forward tasks can roll into the next day
- Finalize day to lock outcomes and update stats

### 4.2 Day Finalization Rules

When finalizing:

- Completed day: all 3 active tasks done -> streak increases, +30 XP
- Missed/partial day: streak resets, XP penalty applied, penalty score increases
- Logs are stored per date with planned/completed/status/category breakdown

### 4.3 Progression Mechanics

- XP-based level progression (100 XP per level)
- Hero rank naming system for gamified milestones
- Best streak tracking
- Penalty tracking
- Restore streak option (spend XP to recover previous streak after a break, with rule limits)

### 4.4 Focus Work System

- Built-in timer with modes:
  - OFA mode (90 min)
  - Pomodoro mode (25 min)
  - Custom duration
- Session stop auto-logs focused work
- Manual training log for sessions outside timer
- Interruptions and planned-vs-actual tracking
- Session notes and start times supported

### 4.5 Analytics and Insights

- Daily focus time trend
- Weekly focus totals
- Efficiency trend visualization
- Day-of-week analysis
- Best focus hour distribution
- Summary pills (total time, average per day, best day/week, consistency, streak)

### 4.6 History and Data Visibility

- Day logs history
- Focus sessions history
- Date filter presets (today, 7d, 30d, 90d, all/custom)
- CSV export of historical performance data

### 4.7 Data Management

- Local save persistence via localStorage
- Import/Export backup in JSON
- Full reset with typed confirmation
- Undo support for many actions

### 4.8 Cloud Sync and Auth

- Google sign-in
- Firebase Auth session persistence
- Firestore cloud state storage
- Debounced cloud writes
- Sync status indicators (offline/syncing/synced/error)
- Local-first behavior with cloud synchronization

## 5. Features Removed in Current Version

The following were intentionally removed from current UI/flow:

- Weekly Debrief Notebook section
- Reflection history tab and related navigation
- Reflection-based redemption quest
- Separate "Today's Results and Tomorrow's Plan" section

## 6. User Experience Highlights

- Motivational theme and visual identity
- Login flow with online sync or offline mode
- Toast notifications and confirmation modals
- Keyboard-friendly controls
- Mobile-aware layout and responsive sections

## 7. Tech Stack

- Frontend: HTML, CSS, JavaScript (ES modules)
- Build Tool: Vite
- Cloud Backend: Firebase
  - Authentication: Google Auth
  - Database: Firestore
- Hosting: Firebase Hosting

## 8. Project Structure

- `index.html`: Main application UI layout
- `styles.css`: Full visual styling and responsive behavior
- `app.js`: Core state, business logic, UI rendering, analytics, interactions
- `firebase.js`: Firebase initialization, auth, cloud CRUD helpers
- `firebase.json`: Hosting rules and SPA rewrite config
- `.firebaserc`: Firebase project alias mapping
- `vite.config.js`: Build and dev server config
- `package.json`: scripts and dependency definitions

## 9. State and Data Model (High Level)

State includes:

- `currentDate`
- `tasks`
- `tomorrowQueue`
- `streak`, `bestStreak`, `lastStreak`, `streakRestoreUsed`
- `xp`, `penalty`
- `logs`
- `focusSessions`
- `categories`
- `redemptions`

Persistence:

- Local key: `antiproc-state-v2`
- Cloud doc path: `users/{uid}/apex/state`

## 10. Security and Access Model

Firestore is expected to use user-scoped rules where users can only read/write their own data path.

Intended rule pattern:

- Auth required
- `request.auth.uid == uid` for user document path

## 11. Build and Deployment

### Local Development

- Install dependencies: `npm install`
- Run dev server: `npm run dev`

### Production Build

- `npm run build`

### Deploy

- `npm run deploy`
- Deployment target: Firebase Hosting project `antiproc-apex`
- Production URL: `https://antiproc-apex.web.app`

## 12. Production Hardening Already Applied

- State normalization for local/import/cloud restores
- Safer ID generation fallback
- Offline-to-sign-in sync initialization fix
- Build and deploy validation after major UI/logic changes

## 13. Portfolio-Ready Description

AntiProc is a gamified, discipline-first execution platform that enforces strict daily task limits, tracks deep work quality, and visualizes consistency trends over time. It combines constrained task planning with a focus timer, XP/streak mechanics, and Firebase cloud sync to transform productivity from passive planning into measurable daily execution.

## 14. Resume Bullet Options

- Built a discipline-focused productivity web app with strict daily task constraints, XP/streak progression, and focus analytics to improve execution consistency.
- Implemented local-first state management with Firebase Auth + Firestore cloud sync for cross-device continuity and resilient offline behavior.
- Designed and shipped an end-to-end production deployment pipeline using Vite and Firebase Hosting, including data export/import and historical analytics.

## 15. Future Enhancements (Optional Roadmap)

- Automated unit/integration tests for core business rules
- End-to-end smoke tests for auth/sync/finalization flows
- Multi-profile or team mode
- Smarter anomaly detection for procrastination patterns
- Calendar integrations and reminder workflows
