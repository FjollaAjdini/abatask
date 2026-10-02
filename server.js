// Abatask — task tracker on Node.js + MongoDB. Node 20+.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const TEAM_PASSWORD = process.env.TEAM_PASSWORD || ''; // optional shared password for sign-in
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'mky_tasks';

const STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'];
const STATUS_LABEL = { backlog: 'Backlog', todo: 'Todo', in_progress: 'In progress', in_review: 'In review', done: 'Done', canceled: 'Canceled' };
const PRIORITY_LABEL = ['No priority', 'Urgent', 'High', 'Medium', 'Low'];
const NO_ID = { projection: { _id: 0 } };

class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

// ---------- database ----------
let db;
const col = (name) => db.collection(name);
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/** Numeric auto-increment ids (keeps ids short and URLs/API simple). */
async function nextId(name) {
  const r = await col('counters').findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return r.seq;
}
async function bumpCounterTo(name, value) {
  await col('counters').updateOne({ _id: name }, { $max: { seq: value } }, { upsert: true });
}

async function connect() {
  let client;
  try {
    client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 6000 });
    await client.connect();
  } catch (e) {
    console.error(`\nCould not connect to MongoDB at ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}\n${e.message}\n\nSet MONGODB_URI to your database (see README).`);
    process.exit(1);
  }
  db = client.db(MONGODB_DB);
  await col('users').createIndex({ email: 1 }, { unique: true });
  await col('users').createIndex({ id: 1 }, { unique: true });
  await col('sessions').createIndex({ token: 1 }, { unique: true });
  await col('projects').createIndex({ key: 1 }, { unique: true });
  await col('projects').createIndex({ id: 1 }, { unique: true });
  await col('issues').createIndex({ id: 1 }, { unique: true });
  await col('issues').createIndex({ project_id: 1, number: 1 }, { unique: true });
  await col('comments').createIndex({ issue_id: 1, id: 1 });
}

// ---------- live updates (SSE) ----------
const clients = new Set();
function broadcast() { for (const res of clients) res.write('data: changed\n\n'); }

// ---------- helpers ----------
function cleanLabels(v) {
  const arr = Array.isArray(v) ? v : String(v || '').split(',');
  return [...new Set(arr.map((s) => String(s).trim()).filter(Boolean))].slice(0, 12);
}
function cleanDate(v) {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, 'Invalid due date');
  return v;
}
const toInt = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
async function log(issueId, userId, body) {
  await col('comments').insertOne({ id: await nextId('comments'), issue_id: issueId, user_id: userId, kind: 'activity', body, created_at: now() });
}
/** Attach project_key and comment_count to issues. */
async function decorate(issues) {
  const projects = Object.fromEntries((await col('projects').find({}, NO_ID).toArray()).map((p) => [p.id, p.key]));
  const counts = Object.fromEntries((await col('comments').aggregate([
    { $match: { kind: 'comment' } }, { $group: { _id: '$issue_id', n: { $sum: 1 } } },
  ]).toArray()).map((c) => [c._id, c.n]));
  return issues.map((i) => ({ ...i, project_key: projects[i.project_id], comment_count: counts[i.id] || 0 }));
}
const getIssue = async (id) => (await decorate([await col('issues').findOne({ id: Number(id) }, NO_ID)]))[0];

// ---------- CSV (RFC 4180-ish) ----------
function parseCsv(text) {
  const rows = []; let row = [], cur = '', inQ = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = ''; rows.push(row); row = [];
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ''));
}

async function importLinear(csv, userId) {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new HttpError(400, 'CSV is empty');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const colIdx = (name) => head.indexOf(name);
  const iId = colIdx('id'), iTitle = colIdx('title');
  if (iId < 0 || iTitle < 0) throw new HttpError(400, 'This does not look like a Linear export (needs "ID" and "Title" columns).');
  const iTeam = colIdx('team'), iDesc = colIdx('description'), iStatus = colIdx('status'), iPrio = colIdx('priority'),
    iAssignee = colIdx('assignee'), iLabels = colIdx('labels'), iCreated = colIdx('created'), iDue = colIdx('due date');
  const statusMap = { backlog: 'backlog', triage: 'backlog', todo: 'todo', 'in progress': 'in_progress', 'in review': 'in_review', done: 'done', canceled: 'canceled', cancelled: 'canceled', duplicate: 'canceled' };
  const prioMap = { urgent: 1, high: 2, medium: 3, low: 4 };
  const stats = { imported: 0, skipped: 0, projects: 0 };
  const palette = ['#283C8C', '#383BFF', '#F7B844', '#6E86FF', '#7C5C22'];
  const projCache = {}; const userCache = {}; const maxNum = {};

  for (const r of rows.slice(1)) {
    const m = /^([A-Za-z0-9]+)-(\d+)$/.exec((r[iId] || '').trim());
    if (!m || !r[iTitle]) { stats.skipped++; continue; }
    const key = m[1].toUpperCase(), number = Number(m[2]);
    let proj = projCache[key] || (projCache[key] = await col('projects').findOne({ key }, NO_ID));
    if (!proj) {
      const n = await col('projects').countDocuments();
      proj = { id: await nextId('projects'), key, name: (iTeam >= 0 && r[iTeam]) || key, color: palette[n % palette.length], created_at: now() };
      await col('projects').insertOne({ ...proj });
      projCache[key] = proj; stats.projects++;
    }
    if (await col('issues').findOne({ project_id: proj.id, number }, { projection: { _id: 1 } })) { stats.skipped++; continue; }
    let assignee = null;
    const an = iAssignee >= 0 ? (r[iAssignee] || '').trim() : '';
    if (an) {
      const k = an.toLowerCase();
      if (!(k in userCache)) {
        const u = await col('users').findOne({ name: { $regex: `^${an.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
        userCache[k] = u ? u.id : await (async () => {
          const id = await nextId('users');
          await col('users').insertOne({ id, name: an, email: `${k.replace(/[^a-z0-9]+/g, '.')}@imported.local`, imported: 1, created_at: now() });
          return id;
        })();
      }
      assignee = userCache[k];
    }
    const created = iCreated >= 0 && r[iCreated] && !isNaN(Date.parse(r[iCreated])) ? new Date(r[iCreated]).toISOString().slice(0, 19).replace('T', ' ') : now();
    await col('issues').insertOne({
      id: await nextId('issues'), project_id: proj.id, number, title: r[iTitle].trim(), description: iDesc >= 0 ? r[iDesc] : '',
      status: statusMap[(iStatus >= 0 ? r[iStatus] : '').trim().toLowerCase()] || 'todo',
      priority: prioMap[(iPrio >= 0 ? r[iPrio] : '').trim().toLowerCase()] || 0,
      assignee_id: assignee, labels: cleanLabels(iLabels >= 0 ? r[iLabels] : ''),
      due_date: iDue >= 0 && /^\d{4}-\d{2}-\d{2}/.test(r[iDue] || '') ? r[iDue].slice(0, 10) : null,
      created_by: userId, created_at: created, updated_at: created,
    });
    maxNum[proj.id] = Math.max(maxNum[proj.id] || 0, number);
    stats.imported++;
  }
  for (const [pid, n] of Object.entries(maxNum)) await bumpCounterTo(`num:${pid}`, n);
  return stats;
}

// ---------- routes ----------
const routes = [];
const route = (method, pattern, handler, { auth = true } = {}) =>
  routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler, auth });

route('GET', '/api/config', () => ({ passwordRequired: !!TEAM_PASSWORD }), { auth: false });

route('POST', '/api/login', async ({ body, res }) => {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter your name and a valid email.');
  if (TEAM_PASSWORD && body.password !== TEAM_PASSWORD) throw new HttpError(401, 'Wrong team password.');
  let user = await col('users').findOne({ email }, NO_ID);
  if (!user) {
    // claim a placeholder created by the Linear import if the name matches
    const ghosts = await col('users').find({ imported: 1 }, NO_ID).toArray();
    const ghost = ghosts.find((g) => g.name.toLowerCase() === name.toLowerCase());
    if (ghost) {
      await col('users').updateOne({ id: ghost.id }, { $set: { email, imported: 0 } });
      user = { ...ghost, email, imported: 0 };
    } else {
      user = { id: await nextId('users'), name, email, imported: 0, created_at: now() };
      await col('users').insertOne({ ...user });
    }
  }
  const token = crypto.randomBytes(24).toString('hex');
  await col('sessions').insertOne({ token, user_id: user.id, created_at: now() });
  res.setHeader('Set-Cookie', `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
  broadcast();
  return { id: user.id, name: user.name, email: user.email };
}, { auth: false });

route('POST', '/api/logout', async ({ req, res }) => {
  const sid = cookie(req, 'sid');
  if (sid) await col('sessions').deleteOne({ token: sid });
  res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0');
  return { ok: true };
}, { auth: false });

route('GET', '/api/state', async ({ user }) => ({
  me: user,
  passwordRequired: !!TEAM_PASSWORD,
  users: (await col('users').find({}, { projection: { _id: 0, id: 1, name: 1, email: 1 } }).sort({ name: 1 }).toArray()),
  projects: await col('projects').find({}, NO_ID).sort({ name: 1 }).toArray(),
  issues: await decorate(await col('issues').find({}, NO_ID).sort({ updated_at: -1 }).toArray()),
}));

route('POST', '/api/projects', async ({ body }) => {
  const name = String(body.name || '').trim();
  const key = String(body.key || '').trim().toUpperCase();
  if (!name) throw new HttpError(400, 'Project name is required.');
  if (!/^[A-Z][A-Z0-9]{1,5}$/.test(key)) throw new HttpError(400, 'Key must be 2–6 letters/digits, e.g. MKY.');
  if (await col('projects').findOne({ key })) throw new HttpError(409, `Key ${key} is already used.`);
  const project = { id: await nextId('projects'), key, name, color: /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : '#283C8C', created_at: now() };
  await col('projects').insertOne({ ...project });
  broadcast();
  return project;
});

route('DELETE', '/api/projects/:id', async ({ params }) => {
  const pid = Number(params.id);
  const ids = (await col('issues').find({ project_id: pid }, { projection: { id: 1 } }).toArray()).map((i) => i.id);
  await col('comments').deleteMany({ issue_id: { $in: ids } });
  await col('issues').deleteMany({ project_id: pid });
  await col('projects').deleteOne({ id: pid });
  broadcast();
  return { ok: true };
});

route('POST', '/api/issues', async ({ body, user }) => {
  const title = String(body.title || '').trim();
  if (!title) throw new HttpError(400, 'Title is required.');
  const pid = Number(body.project_id);
  if (!(await col('projects').findOne({ id: pid }))) throw new HttpError(400, 'Pick a project.');
  const issue = {
    id: await nextId('issues'), project_id: pid, number: await nextId(`num:${pid}`), title, description: String(body.description || ''),
    status: STATUSES.includes(body.status) ? body.status : 'todo',
    priority: [0, 1, 2, 3, 4].includes(Number(body.priority)) ? Number(body.priority) : 0,
    assignee_id: toInt(body.assignee_id), labels: cleanLabels(body.labels), due_date: cleanDate(body.due_date),
    created_by: user.id, created_at: now(), updated_at: now(),
  };
  await col('issues').insertOne({ ...issue });
  await log(issue.id, user.id, 'created the issue');
  broadcast();
  return getIssue(issue.id);
});

route('PATCH', '/api/issues/:id', async ({ params, body, user }) => {
  const cur = await col('issues').findOne({ id: Number(params.id) }, NO_ID);
  if (!cur) throw new HttpError(404, 'Issue not found.');
  const set = {}; const notes = [];
  if ('title' in body) { const t = String(body.title).trim(); if (!t) throw new HttpError(400, 'Title is required.'); set.title = t; }
  if ('description' in body) set.description = String(body.description);
  if ('status' in body) {
    if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Bad status.');
    if (body.status !== cur.status) { set.status = body.status; notes.push(`changed status from ${STATUS_LABEL[cur.status]} to ${STATUS_LABEL[body.status]}`); }
  }
  if ('priority' in body) {
    const p = Number(body.priority);
    if (![0, 1, 2, 3, 4].includes(p)) throw new HttpError(400, 'Bad priority.');
    if (p !== cur.priority) { set.priority = p; notes.push(`set priority to ${PRIORITY_LABEL[p]}`); }
  }
  if ('assignee_id' in body) {
    const a = toInt(body.assignee_id);
    if (a !== cur.assignee_id) {
      set.assignee_id = a;
      const who = a ? (await col('users').findOne({ id: a }))?.name : null;
      notes.push(a ? `assigned to ${who || 'someone'}` : 'removed the assignee');
    }
  }
  if ('labels' in body) set.labels = cleanLabels(body.labels);
  if ('due_date' in body) set.due_date = cleanDate(body.due_date);
  if (Object.keys(set).length) {
    set.updated_at = now();
    await col('issues').updateOne({ id: cur.id }, { $set: set });
    for (const n of notes) await log(cur.id, user.id, n);
    broadcast();
  }
  return getIssue(cur.id);
});

route('DELETE', '/api/issues/:id', async ({ params }) => {
  const id = Number(params.id);
  await col('comments').deleteMany({ issue_id: id });
  await col('issues').deleteOne({ id });
  broadcast();
  return { ok: true };
});

route('GET', '/api/issues/:id/comments', async ({ params }) => {
  const list = await col('comments').find({ issue_id: Number(params.id) }, NO_ID).sort({ id: 1 }).toArray();
  const users = Object.fromEntries((await col('users').find({}, NO_ID).toArray()).map((u) => [u.id, u.name]));
  return list.map((c) => ({ ...c, user_name: users[c.user_id] || null }));
});

route('POST', '/api/issues/:id/comments', async ({ params, body, user }) => {
  const text = String(body.body || '').trim();
  if (!text) throw new HttpError(400, 'Write something first.');
  const issue_id = Number(params.id);
  await col('comments').insertOne({ id: await nextId('comments'), issue_id, user_id: user.id, kind: 'comment', body: text, created_at: now() });
  await col('issues').updateOne({ id: issue_id }, { $set: { updated_at: now() } });
  broadcast();
  return { ok: true };
});

route('POST', '/api/import/linear', async ({ body, user }) => {
  const stats = await importLinear(String(body.csv || ''), user.id);
  broadcast();
  return stats;
});

route('GET', '/api/events', ({ res }) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write('retry: 2000\n\n');
  clients.add(res);
  res.on('close', () => clients.delete(res));
  return undefined;
});

// ---------- server ----------
function cookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? m[1] : null;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 20e6) { reject(new HttpError(413, 'Too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { reject(new HttpError(400, 'Bad JSON')); }
    });
  });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json', '.ico': 'image/x-icon' };
function serveStatic(req, res, pathname) {
  const pub = path.join(ROOT, 'public');
  const file = path.normalize(path.join(pub, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(pub + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, decodeURIComponent(url.pathname));
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  try {
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) throw new HttpError(404, 'Not found');
    let user = null;
    const sid = cookie(req, 'sid');
    if (sid) {
      const s = await col('sessions').findOne({ token: sid });
      if (s) user = await col('users').findOne({ id: s.user_id }, { projection: { _id: 0, id: 1, name: 1, email: 1 } });
    }
    if (r.auth && !user) throw new HttpError(401, 'Not signed in');
    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req);
    const out = await r.handler({ req, res, body, user, params: r.re.exec(url.pathname).groups || {} });
    if (out !== undefined) send(200, out);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    send(e.code || 500, { error: e instanceof HttpError ? e.message : 'Server error' });
  }
});

const pingTimer = setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);
pingTimer.unref();

await connect();
server.listen(PORT, () => console.log(`Abatask running → http://localhost:${PORT}  (MongoDB: ${MONGODB_DB})${TEAM_PASSWORD ? '  (team password on)' : ''}`));
