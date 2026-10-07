# Abatask by moneykey

Our own Linear replacement. Node.js + MongoDB, plain HTML/CSS/JS frontend (no build step).
Built for moneykey and styled with the MKY design system (tokens copied to `public/ds/`).

## Run
1. Get a MongoDB database (pick one):
   - **MongoDB Atlas free tier (M0)** — free, hosted, no install. Create a cluster, add a database user,
     allow your IP, and copy the connection string (`mongodb+srv://…`).
   - **Local, no install (easiest):** run `npm run db` in a separate terminal. It starts MongoDB on 127.0.0.1:27017 and keeps data in `data/mongo`.
   - **Local, system install:** `brew tap mongodb/brew && brew install mongodb-community && brew services start mongodb-community`
     (connection string is then `mongodb://127.0.0.1:27017`, which is the default).
2. Start the app:
```bash
npm install
MONGODB_URI="mongodb+srv://USER:PASS@cluster.mongodb.net" npm start   # http://localhost:3000
```
Optional: `MONGODB_DB=mky_tasks` (database name), `PORT=3000`, `COOKIE_SECURE=1` (when served over https).

### First run
Open the app. You'll be asked to **set up the workspace** by creating the first account, which becomes the admin.
After that, add people from **Team** in the sidebar: each person gets a personal invite link to choose their own password.

## Features
- Projects with keys (MKY-12), issues, status / priority / assignee / labels / due date
- List and Board (drag cards between columns), search + filters, My issues
- Issue drawer with description, comments and automatic activity log
- Accounts with admin and member roles; admins invite people by link (no public sign-up)
- Live updates across everyone's browser
- Shortcuts: `C` new issue, `/` search, `Esc` close
- Linear import (gear icon → upload the CSV exported from Linear). Keeps IDs, status, priority, assignee, labels.

## Data
Collections: `users, sessions, projects, issues, comments, counters`. Back up with `mongodump` (or Atlas backups).

## Sharing with the team
Host the Node app anywhere (Fly.io, Render, Railway, a VPS) with `MONGODB_URI` pointing at Atlas, behind https, and set `COOKIE_SECURE=1`.
