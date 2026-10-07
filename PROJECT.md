# Abatask by moneykey — Project Overview

## What it is

Abatask is an internal task-management platform built for **moneykey**. It replaces Linear, which the team outgrew on the free plan, with a tool we own and run ourselves: no seat limits and no per-user fees.

It follows the same core ideas as Linear (projects, issues with statuses and priorities, list and board views, keyboard shortcuts) in a deliberately small package, styled with the MKY design system (Manrope typography, MKY blue/indigo/gold palette).

## Who it's for

moneykey / MKY teams who need one shared place to create, assign, track and discuss work.

## Features

### Sign-in
- Sign in with name and email. New people are created automatically on first sign-in.
- Optional shared **team password** (set with `TEAM_PASSWORD`).
- Sessions stay signed in for a year via a secure cookie.

### Projects
- Create projects with a name, a short **key** (2–6 letters, e.g. `MKY`) and a colour.
- Issues in a project get IDs automatically: `MKY-1`, `MKY-2`, `MKY-3`…
- The sidebar shows each project with its count of open issues.

### Issues
Each issue has:
- **Title** and **description**
- **Status:** Backlog, Todo, In progress, In review, Done, Canceled
- **Priority:** Urgent, High, Medium, Low, or No priority
- **Assignee** (any team member)
- **Labels** (comma separated, up to 12)
- **Due date**, with overdue dates highlighted for issues that aren't done
- Who created it and when

### Views
- **List view:** issues grouped by status, with quick-change icons for priority, status and assignee right on each row.
- **Board view:** one column per status. Drag a card to another column to change its status.
- **My issues:** everything assigned to you.
- **All issues**, or a single project.

### Search and filters
- Search by title, issue ID (e.g. `MKY-12`) or label.
- Filter by status, assignee (including "Unassigned") and priority.

### Issue details panel
Open any issue to:
- Edit the title and description (saved when you click away).
- Change status, priority, assignee, due date and labels.
- **Comment** on the issue.
- Read an automatic **activity log**: "changed status from Todo to Done", "assigned to Ben", "set priority to High", and so on.
- **Copy a link** to the issue, or **delete** it.

### Live updates
Changes appear in everyone's browser within a moment, with no refresh needed. If you move a card, a colleague's board updates on its own.

### Linear import
Migrate from Linear: export a CSV in Linear (**Settings → Workspace → Import/Export**), then upload it via the gear icon in the sidebar.
- Keeps issue IDs, titles, descriptions, status, priority, assignee, labels, created date and due date.
- Creates projects from Linear's teams.
- Safe to run twice: issues that already exist are skipped.
- People mentioned as assignees are created as placeholders, and are claimed automatically when someone with the same name signs in.
- Comments and attachments are **not** imported.

### Keyboard shortcuts
| Key | Action |
|---|---|
| `C` | New issue |
| `/` | Focus search |
| `Esc` | Close the open panel, dialog or menu |
| `⌘/Ctrl + Enter` | Submit a new issue or a comment |

## What it doesn't do (yet)

Cycles or sprints, roadmaps, @mentions, email or push notifications, file attachments, roles and permissions, single sign-on, and a user interface for deleting projects.

## How it's built

| Part | Technology |
|---|---|
| Server | Node.js (plain `http`, no framework) |
| Database | MongoDB (official `mongodb` driver) |
| Frontend | Plain HTML, CSS and JavaScript, no build step |
| Live updates | Server-Sent Events |
| Look and feel | MKY design system tokens in `public/ds/` |

### Project structure
```
server.js          API, authentication, MongoDB access, static files
public/
  index.html       page shell
  app.js           the whole frontend (views, drawer, dialogs, drag and drop)
  app.css          app styling on top of the MKY tokens
  brand/           moneykey logo and icon
  ds/              copy of the MKY design system (fonts, tokens, components)
```

### Data (MongoDB collections)
`users`, `sessions`, `projects`, `issues`, `comments` (includes activity entries), `counters` (auto-incrementing IDs).

### API summary
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/login`, `/api/logout` | Sign in or out |
| GET | `/api/state` | Everything the app needs: user, people, projects, issues |
| POST | `/api/projects` | Create a project |
| POST | `/api/issues` | Create an issue |
| PATCH | `/api/issues/:id` | Update an issue |
| DELETE | `/api/issues/:id` | Delete an issue |
| GET, POST | `/api/issues/:id/comments` | Read or add comments and activity |
| POST | `/api/import/linear` | Import a Linear CSV |
| GET | `/api/events` | Live-update stream |

## Running it

See [README.md](README.md) for setup. In short:

```bash
npm install
MONGODB_URI="your-mongodb-connection-string" npm start    # http://localhost:3000
```

| Setting | Meaning | Default |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017` |
| `MONGODB_DB` | Database name | `mky_tasks` |
| `TEAM_PASSWORD` | Optional shared sign-in password | none |
| `PORT` | Port to listen on | `3000` |

## Security notes

- Sign-in is by name and email (plus the optional team password). That suits an internal tool on a private network, but it is **not hardened for the open internet**. If you host it publicly, set `TEAM_PASSWORD` at a minimum and consider proper authentication.
- Never commit the MongoDB connection string. It contains a password.
