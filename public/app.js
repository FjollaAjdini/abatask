// MKY Tasks — vanilla JS single-page app. No build step.
// Product name — change here (and in index.html <title>) once decided.
const APP_NAME = 'Tasks';
const APP_BYLINE = 'by moneykey';

const STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'];
const STATUS_LABEL = { backlog: 'Backlog', todo: 'Todo', in_progress: 'In progress', in_review: 'In review', done: 'Done', canceled: 'Canceled' };
const STATUS_COLOR = { backlog: '#9AA0B2', todo: '#5B6275', in_progress: '#F7B844', in_review: '#383BFF', done: '#283C8C', canceled: '#9AA0B2' };
const PRIORITIES = [[1, 'Urgent'], [2, 'High'], [3, 'Medium'], [4, 'Low'], [0, 'No priority']];
const PROJECT_COLORS = ['#283C8C', '#383BFF', '#F7B844', '#6E86FF', '#7C5C22', '#020617'];

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (n) => (n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const state = {
  me: null, users: [], projects: [], issues: [], passwordRequired: false,
  scope: 'all',             // 'all' | 'mine' | project id
  layout: localStorage.getItem('layout') || 'list',
  q: '', fStatus: '', fAssignee: '', fPriority: '',
  openId: null, comments: [],
};

// ---------- api ----------
async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') { state.me = null; renderLogin(); throw new Error('signed out'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2400);
}
async function run(fn) { try { return await fn(); } catch (e) { if (e.message !== 'signed out') toast(e.message); } }

// ---------- icons ----------
const svg = (inner, s = 16, extra = '') => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" ${extra}>${inner}</svg>`;
function statusIcon(st) {
  const c = STATUS_COLOR[st];
  const ring = (dash = '') => `<circle cx="8" cy="8" r="6" stroke="${c}" stroke-width="1.5" ${dash}/>`;
  const pie = (frac) => `<circle cx="8" cy="8" r="3" stroke="${c}" stroke-width="6" stroke-dasharray="${(18.85 * frac).toFixed(2)} 18.85" transform="rotate(-90 8 8)"/>`;
  if (st === 'backlog') return svg(ring('stroke-dasharray="2.2 2.2"'));
  if (st === 'todo') return svg(ring());
  if (st === 'in_progress') return svg(ring() + pie(0.5));
  if (st === 'in_review') return svg(ring() + pie(0.75));
  if (st === 'done') return svg(`<circle cx="8" cy="8" r="7" fill="${c}"/><path d="M5 8.2l2 2 4-4.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`);
  return svg(`<circle cx="8" cy="8" r="7" fill="${c}"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`);
}
function prioIcon(p) {
  if (p === 1) return svg(`<rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill="#020617"/><path d="M8 4.5v4.2" stroke="#F7B844" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="11.3" r="1" fill="#F7B844"/>`);
  if (p === 0) return svg(`<path d="M3 8h2.5M6.8 8h2.5M10.6 8H13" stroke="#9AA0B2" stroke-width="1.6" stroke-linecap="round"/>`);
  const on = 5 - p; // high=3 bars, medium=2, low=1
  return svg([0, 1, 2].map((i) => `<rect x="${2 + i * 4.4}" y="${10 - i * 3}" width="3" height="${4 + i * 3}" rx="1" fill="${i < on ? '#283C8C' : '#D5D8E2'}"/>`).join(''));
}
const I = {
  plus: svg('<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
  search: svg('<circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
  x: svg('<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
  all: svg('<rect x="2" y="2" width="5" height="5" rx="1.3" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="2" width="5" height="5" rx="1.3" stroke="currentColor" stroke-width="1.4"/><rect x="2" y="9" width="5" height="5" rx="1.3" stroke="currentColor" stroke-width="1.4"/><rect x="9" y="9" width="5" height="5" rx="1.3" stroke="currentColor" stroke-width="1.4"/>'),
  mine: svg('<circle cx="8" cy="5.5" r="2.7" stroke="currentColor" stroke-width="1.4"/><path d="M2.8 14c.6-2.6 2.6-4 5.2-4s4.6 1.4 5.2 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'),
};
const avatar = (u, cls = '') => u ? `<span class="avatar ${cls}" title="${esc(u.name)}">${esc(initials(u.name))}</span>` : `<span class="avatar avatar--empty ${cls}" title="Unassigned">${svg('<path d="M8 4v8M4 8h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>', 10)}</span>`;

// ---------- selectors ----------
const userById = (id) => state.users.find((u) => u.id === id);
const projectById = (id) => state.projects.find((p) => p.id === id);
const ident = (i) => `${i.project_key}-${i.number}`;
const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
const isLate = (i) => i.due_date && !['done', 'canceled'].includes(i.status) && i.due_date < new Date().toISOString().slice(0, 10);

function scoped() {
  if (state.scope === 'mine') return state.issues.filter((i) => i.assignee_id === state.me.id);
  if (state.scope === 'all') return state.issues;
  return state.issues.filter((i) => i.project_id === state.scope);
}
function visible() {
  const q = state.q.trim().toLowerCase();
  return scoped().filter((i) =>
    (!state.fStatus || i.status === state.fStatus) &&
    (!state.fPriority || String(i.priority) === state.fPriority) &&
    (!state.fAssignee || (state.fAssignee === 'none' ? !i.assignee_id : String(i.assignee_id) === state.fAssignee)) &&
    (!q || i.title.toLowerCase().includes(q) || ident(i).toLowerCase().includes(q) || i.labels.some((l) => l.toLowerCase().includes(q))))
    .sort((a, b) => (a.priority || 9) - (b.priority || 9) || b.updated_at.localeCompare(a.updated_at));
}

// ---------- data ----------
async function load() {
  const s = await api('GET', '/api/state');
  Object.assign(state, s);
  if (typeof state.scope === 'number' && !projectById(state.scope)) state.scope = 'all';
}
async function refresh() {
  await load();
  renderSidebar(); renderContent();
  if (state.openId) {
    if (!state.issues.some((i) => i.id === state.openId)) closeDrawer();
    else if (!$('#drawer').contains(document.activeElement)) { await loadComments(); renderDrawer(); }
  }
}
async function loadComments() { state.comments = await api('GET', `/api/issues/${state.openId}/comments`); }

async function patchIssue(id, patch) {
  const i = state.issues.find((x) => x.id === id);
  Object.assign(i, patch);                       // optimistic
  renderSidebar(); renderContent();
  const saved = await run(() => api('PATCH', `/api/issues/${id}`, patch));
  if (!saved) return refresh();
  Object.assign(i, saved);
  if (state.openId === id) { await loadComments(); renderDrawer(); }
}

function connectEvents() {
  const es = new EventSource('/api/events');
  let t;
  es.onmessage = () => { clearTimeout(t); t = setTimeout(() => state.me && refresh().catch(() => {}), 150); };
}

// ---------- login ----------
// The password input only exists when a team password is set, so browsers don't offer saved logins otherwise.
const pwField = () => '<div class="mky-field"><label class="mky-label" for="lp">Team password</label><input class="mky-input" id="lp" type="password" autocomplete="off"></div>';
function renderLogin() {
  $('#drawer').innerHTML = ''; $('#modal').innerHTML = '';
  $('#app').innerHTML = `
  <div class="login">
    <div class="login__art">
      <div class="login__logo"><img src="/brand/moneykey-logo.png" alt="moneykey"></div>
      <h1 class="login__headline">Keep every task in <span class="mky-hl">one place</span>.</h1>
      <span style="opacity:.7;font-size:14px">${esc(APP_NAME)} ${esc(APP_BYLINE)}</span>
    </div>
    <form class="login__form" id="loginForm">
      <h2>Sign in</h2>
      <p class="muted" style="margin:0 0 8px">New here? Just enter your name and email and you're in.</p>
      <div class="mky-field"><label class="mky-label" for="ln">Name</label><input class="mky-input" id="ln" autocomplete="off" required autofocus></div>
      <div class="mky-field"><label class="mky-label" for="le">Email</label><input class="mky-input" id="le" type="email" autocomplete="off" required></div>
      <div id="pwslot">${state.passwordRequired ? pwField() : ''}</div>
      <div class="err" id="lerr"></div>
      <button class="mky-btn mky-btn--primary" type="submit">Continue</button>
    </form>
  </div>`;
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('POST', '/api/login', { name: $('#ln').value, email: $('#le').value, password: $('#lp')?.value });
      await boot();
    } catch (err) {
      $('#lerr').textContent = err.message;
      if (/password/i.test(err.message) && !$('#lp')) $('#pwslot').innerHTML = pwField();
    }
  });
}

// ---------- shell ----------
function renderShell() {
  $('#app').innerHTML = `
  <div class="shell">
    <aside class="side" id="side"></aside>
    <main class="main">
      <header class="head" id="head"></header>
      <div class="content" id="content"></div>
    </main>
  </div>`;
  renderSidebar(); renderHead(); renderContent();
}

function renderSidebar() {
  const mine = state.issues.filter((i) => i.assignee_id === state.me.id && !['done', 'canceled'].includes(i.status)).length;
  const open = (pid) => state.issues.filter((i) => i.project_id === pid && !['done', 'canceled'].includes(i.status)).length;
  const nav = (scope, icon, label, count) => `<button class="nav ${state.scope === scope ? 'on' : ''}" data-act="scope" data-scope="${scope}">${icon}${esc(label)}<span class="count">${count || ''}</span></button>`;
  $('#side').innerHTML = `
    <div class="side__brand"><img src="/brand/moneykey-logo.png" alt="moneykey"><div class="side__app"><b>${esc(APP_NAME)}</b> ${esc(APP_BYLINE)}</div></div>
    <button class="mky-btn mky-btn--primary mky-btn--sm" data-act="new-issue" style="margin:0 4px 8px">${I.plus} New issue <kbd style="margin-left:auto;background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.3);color:#fff">C</kbd></button>
    ${nav('mine', I.mine, 'My issues', mine)}
    ${nav('all', I.all, 'All issues', state.issues.filter((i) => !['done', 'canceled'].includes(i.status)).length)}
    <div class="side__label">Projects <button class="iconbtn" data-act="new-project" title="New project">${I.plus}</button></div>
    ${state.projects.map((p) => nav(p.id, `<span class="dot" style="background:${esc(p.color)}"></span>`, p.name, open(p.id))).join('') || '<div class="muted" style="padding:6px 10px;font-size:13px">No projects yet</div>'}
    <div class="side__foot">
      ${avatar(state.me, 'avatar--lg')}
      <div class="who"><b>${esc(state.me.name)}</b><span>${esc(state.me.email)}</span></div>
      <button class="iconbtn" data-act="settings" title="Import / settings" aria-label="Settings">${svg('<circle cx="8" cy="8" r="2.2" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>')}</button>
    </div>`;
}

function renderHead() {
  const title = state.scope === 'mine' ? 'My issues' : state.scope === 'all' ? 'All issues' : projectById(state.scope)?.name || '';
  const sel = (id, ph, opts, val) => `<select class="mky-select field-sm" id="${id}" aria-label="${ph}"><option value="">${ph}</option>${opts.map(([v, l]) => `<option value="${v}" ${String(val) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  $('#head').innerHTML = `
    <h1>${esc(title)} <small id="countLabel"></small></h1>
    <div class="search">${I.search}<input class="mky-input field-sm" id="search" placeholder="Search  ( / )" value="${esc(state.q)}"></div>
    ${sel('fStatus', 'Status', STATUSES.map((s) => [s, STATUS_LABEL[s]]), state.fStatus)}
    ${sel('fAssignee', 'Assignee', [['none', 'Unassigned'], ...state.users.map((u) => [u.id, u.name])], state.fAssignee)}
    ${sel('fPriority', 'Priority', PRIORITIES.map(([v, l]) => [v, l]), state.fPriority)}
    <div class="seg" role="group" aria-label="Layout">
      <button data-act="layout" data-layout="list" class="${state.layout === 'list' ? 'on' : ''}">List</button>
      <button data-act="layout" data-layout="board" class="${state.layout === 'board' ? 'on' : ''}">Board</button>
    </div>`;
}

// ---------- list + board ----------
function rowHtml(i) {
  const u = userById(i.assignee_id);
  return `<div class="row" data-act="open" data-id="${i.id}">
    <button class="pill" data-act="pick-priority" data-id="${i.id}" title="Priority">${prioIcon(i.priority)}</button>
    <span class="row__id">${esc(ident(i))}</span>
    <button class="pill" data-act="pick-status" data-id="${i.id}" title="${STATUS_LABEL[i.status]}">${statusIcon(i.status)}</button>
    <span class="row__title">${esc(i.title)}</span>
    <span class="row__labels">${i.labels.slice(0, 2).map((l) => `<span class="tag">${esc(l)}</span>`).join('')}</span>
    <span class="row__due ${isLate(i) ? 'late' : ''}">${fmtDate(i.due_date)}</span>
    <button class="pill" data-act="pick-assignee" data-id="${i.id}" title="${esc(u?.name || 'Unassigned')}">${avatar(u)}</button>
  </div>`;
}
function cardHtml(i) {
  const u = userById(i.assignee_id);
  return `<div class="card" draggable="true" data-act="open" data-id="${i.id}">
    <div class="card__top"><span class="row__id">${esc(ident(i))}</span>${prioIcon(i.priority)}</div>
    <div class="card__title">${esc(i.title)}</div>
    <div class="card__foot">${i.labels.slice(0, 2).map((l) => `<span class="tag">${esc(l)}</span>`).join('')}
      ${i.due_date ? `<span class="row__due ${isLate(i) ? 'late' : ''}">${fmtDate(i.due_date)}</span>` : ''}${avatar(u)}</div>
  </div>`;
}

function renderContent() {
  const el = $('#content'); if (!el) return;
  const items = visible();
  const lbl = $('#countLabel'); if (lbl) lbl.textContent = `${items.length} issue${items.length === 1 ? '' : 's'}`;
  if (!state.projects.length) {
    el.innerHTML = `<div class="empty"><h3>Start with a project</h3><p>Projects group your issues and give them IDs like <b>MKY-12</b>.<br>You can also import everything from Linear.</p>
      <button class="mky-btn mky-btn--primary" data-act="new-project">Create a project</button> <button class="mky-btn mky-btn--outline" data-act="settings">Import from Linear</button></div>`;
    return;
  }
  if (!items.length) {
    el.innerHTML = `<div class="empty"><h3>Nothing here</h3><p>No issues match. Press <kbd>C</kbd> to create one.</p></div>`; return;
  }
  if (state.layout === 'board') {
    el.innerHTML = `<div class="board">${STATUSES.map((s) => {
      const col = items.filter((i) => i.status === s);
      return `<section class="col" data-status="${s}"><div class="col__head">${statusIcon(s)} ${STATUS_LABEL[s]} <span class="n">${col.length}</span></div><div class="col__body">${col.map(cardHtml).join('')}</div></section>`;
    }).join('')}</div>`;
  } else {
    el.innerHTML = STATUSES.map((s) => {
      const g = items.filter((i) => i.status === s);
      return g.length ? `<div class="group__head">${statusIcon(s)} ${STATUS_LABEL[s]} <span class="n">${g.length}</span></div>${g.map(rowHtml).join('')}` : '';
    }).join('');
  }
}

// ---------- popover ----------
function popover(anchor, options, onPick) {
  closePop();
  const pop = document.createElement('div'); pop.className = 'pop'; pop.id = 'pop';
  pop.innerHTML = options.map(([v, label, icon]) => `<button data-v="${esc(v)}">${icon || ''}${esc(label)}</button>`).join('');
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.min(r.left, innerWidth - pop.offsetWidth - 8) + 'px';
  pop.style.top = (r.bottom + pop.offsetHeight + 12 > innerHeight ? Math.max(8, r.top - pop.offsetHeight - 4) : r.bottom + 4) + 'px';
  pop.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { closePop(); onPick(b.dataset.v); } });
}
const closePop = () => $('#pop')?.remove();

// ---------- drawer ----------
async function openDrawer(id) {
  state.openId = id; await loadComments(); renderDrawer();
}
function closeDrawer() { state.openId = null; $('#drawer').innerHTML = ''; }

function renderDrawer() {
  const i = state.issues.find((x) => x.id === state.openId); if (!i) return closeDrawer();
  const keepScroll = $('.drawer__main')?.scrollTop || 0;
  const opt = (v, l, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
  $('#drawer').innerHTML = `
  <div class="scrim" data-act="close-drawer"></div>
  <aside class="drawer" role="dialog" aria-label="Issue ${esc(ident(i))}">
    <div class="drawer__main">
      <div class="drawer__bar"><span class="tag" style="font-size:12px">${esc(ident(i))}</span>
        <span><button class="mky-btn mky-btn--ghost mky-btn--sm" data-act="copy-link">Copy link</button>
        <button class="mky-btn mky-btn--ghost mky-btn--sm" style="color:var(--danger)" data-act="delete-issue">Delete</button>
        <button class="iconbtn" data-act="close-drawer" aria-label="Close" style="display:inline-grid;vertical-align:middle">${I.x}</button></span></div>
      <textarea class="title-input" id="dTitle" rows="1" aria-label="Title">${esc(i.title)}</textarea>
      <textarea class="mky-textarea desc" id="dDesc" placeholder="Add a description…" aria-label="Description">${esc(i.description)}</textarea>
      <h3 class="sect">Activity</h3>
      <div class="feed">${state.comments.map((c) => c.kind === 'activity'
        ? `<div class="act"><b>${esc(c.user_name || 'Someone')}</b> ${esc(c.body)} · ${timeAgo(c.created_at)}</div>`
        : `<div class="cmt">${avatar({ name: c.user_name || '?' })}<div class="cmt__body"><div class="cmt__meta"><b>${esc(c.user_name || 'Someone')}</b> · ${timeAgo(c.created_at)}</div><div class="cmt__text">${esc(c.body)}</div></div></div>`).join('')}</div>
      <div class="mky-field"><textarea class="mky-textarea" id="dComment" placeholder="Leave a comment…  (⌘/Ctrl + Enter to send)" style="min-height:72px"></textarea>
        <div><button class="mky-btn mky-btn--primary mky-btn--sm" data-act="add-comment">Comment</button></div></div>
    </div>
    <div class="drawer__props">
      <div class="prop"><label for="pStatus">Status</label><select class="mky-select" id="pStatus">${STATUSES.map((s) => opt(s, STATUS_LABEL[s], i.status)).join('')}</select></div>
      <div class="prop"><label for="pPrio">Priority</label><select class="mky-select" id="pPrio">${PRIORITIES.map(([v, l]) => opt(v, l, i.priority)).join('')}</select></div>
      <div class="prop"><label for="pAssignee">Assignee</label><select class="mky-select" id="pAssignee">${opt('', 'Unassigned', i.assignee_id || '')}${state.users.map((u) => opt(u.id, u.name, i.assignee_id)).join('')}</select></div>
      <div class="prop"><label for="pDue">Due date</label><input class="mky-input" type="date" id="pDue" value="${esc(i.due_date || '')}"></div>
      <div class="prop"><label for="pLabels">Labels</label><input class="mky-input" id="pLabels" placeholder="bug, design…" value="${esc(i.labels.join(', '))}"></div>
      <div class="prop"><label>Project</label><div style="font-size:14px;font-weight:600">${esc(projectById(i.project_id)?.name || '')}</div></div>
      <div class="prop muted" style="font-size:12px">Created ${timeAgo(i.created_at)}${userById(i.created_by) ? ' by ' + esc(userById(i.created_by).name) : ''}</div>
    </div>
  </aside>`;
  $('.drawer__main').scrollTop = keepScroll;
  const fit = (t) => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
  const title = $('#dTitle'); fit(title); title.addEventListener('input', () => fit(title));
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } });
  title.addEventListener('blur', () => { const v = title.value.trim(); if (v && v !== i.title) patchIssue(i.id, { title: v }); else title.value = i.title; });
  $('#dDesc').addEventListener('blur', (e) => { if (e.target.value !== i.description) patchIssue(i.id, { description: e.target.value }); });
  $('#pStatus').onchange = (e) => patchIssue(i.id, { status: e.target.value });
  $('#pPrio').onchange = (e) => patchIssue(i.id, { priority: Number(e.target.value) });
  $('#pAssignee').onchange = (e) => patchIssue(i.id, { assignee_id: e.target.value ? Number(e.target.value) : null });
  $('#pDue').onchange = (e) => patchIssue(i.id, { due_date: e.target.value || null });
  $('#pLabels').onchange = (e) => patchIssue(i.id, { labels: e.target.value });
  $('#dComment').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment(); });
}
async function addComment() {
  const t = $('#dComment'); const body = t.value.trim(); if (!body) return;
  await run(() => api('POST', `/api/issues/${state.openId}/comments`, { body }));
  await loadComments(); renderDrawer(); renderContent();
}
function timeAgo(s) {
  const d = new Date(s.replace(' ', 'T') + 'Z'), sec = (Date.now() - d) / 1000;
  if (sec < 60) return 'just now'; if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`; if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------- modals ----------
function closeModal() { $('#modal').innerHTML = ''; }
function modal(html) { $('#modal').innerHTML = `<div class="scrim" data-act="close-modal"></div><div class="modal" role="dialog">${html}</div>`; }

function newIssueModal() {
  if (!state.projects.length) return newProjectModal();
  const defProject = typeof state.scope === 'number' ? state.scope : (JSON.parse(localStorage.getItem('lastProject') || 'null') ?? state.projects[0].id);
  const opt = (v, l, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`;
  modal(`<h2>New issue</h2>
    <input class="mky-input" id="nTitle" placeholder="Issue title" aria-label="Title" autofocus>
    <textarea class="mky-textarea" id="nDesc" placeholder="Description (optional)" style="min-height:90px"></textarea>
    <div class="modal__row">
      <select class="mky-select" id="nProject" aria-label="Project">${state.projects.map((p) => opt(p.id, p.name, p.id === defProject ? p.id : '')).join('')}</select>
      <select class="mky-select" id="nStatus" aria-label="Status">${STATUSES.map((s) => opt(s, STATUS_LABEL[s], 'todo')).join('')}</select>
      <select class="mky-select" id="nPrio" aria-label="Priority">${PRIORITIES.map(([v, l]) => opt(v, l, 0)).join('')}</select>
    </div>
    <div class="modal__row">
      <select class="mky-select" id="nAssignee" aria-label="Assignee">${opt('', 'Unassigned', '')}${state.users.map((u) => opt(u.id, u.name, state.scope === 'mine' ? state.me.id : '')).join('')}</select>
      <input class="mky-input" type="date" id="nDue" aria-label="Due date">
      <input class="mky-input" id="nLabels" placeholder="Labels, comma separated" aria-label="Labels">
    </div>
    <div class="err" id="nErr"></div>
    <div class="modal__foot"><span class="hint"><kbd>⌘</kbd> <kbd>Enter</kbd> to create</span>
      <button class="mky-btn mky-btn--ghost" data-act="close-modal">Cancel</button>
      <button class="mky-btn mky-btn--primary" data-act="create-issue">Create issue</button></div>`);
  $('#nTitle').focus();
  $('#modal').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) createIssue(); });
}
async function createIssue() {
  const v = (id) => $(id).value;
  try {
    const pid = Number(v('#nProject'));
    const issue = await api('POST', '/api/issues', { project_id: pid, title: v('#nTitle'), description: v('#nDesc'), status: v('#nStatus'), priority: Number(v('#nPrio')), assignee_id: v('#nAssignee') ? Number(v('#nAssignee')) : null, due_date: v('#nDue') || null, labels: v('#nLabels') });
    localStorage.setItem('lastProject', String(pid));
    closeModal(); await refresh(); toast(`Created ${ident(issue)}`);
  } catch (e) { $('#nErr').textContent = e.message; }
}

let pickedColor = PROJECT_COLORS[0];
function newProjectModal() {
  pickedColor = PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length];
  modal(`<h2>New project</h2>
    <div class="modal__row"><div class="mky-field" style="flex:3"><label class="mky-label" for="pjName">Name</label><input class="mky-input" id="pjName" placeholder="e.g. Marketing" autofocus></div>
      <div class="mky-field" style="flex:1"><label class="mky-label" for="pjKey">Key</label><input class="mky-input" id="pjKey" placeholder="MKT" maxlength="6" style="text-transform:uppercase"></div></div>
    <div class="mky-field"><span class="mky-label">Color</span><div class="colors">${PROJECT_COLORS.map((c) => `<button type="button" data-act="pick-color" data-c="${c}" class="${c === pickedColor ? 'on' : ''}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div></div>
    <div class="err" id="pErr"></div>
    <div class="modal__foot"><button class="mky-btn mky-btn--ghost" data-act="close-modal">Cancel</button><button class="mky-btn mky-btn--primary" data-act="create-project">Create project</button></div>`);
  $('#pjName').addEventListener('input', (e) => { const k = $('#pjKey'); if (!k.dataset.touched) k.value = e.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase(); });
  $('#pjKey').addEventListener('input', (e) => { e.target.dataset.touched = 1; });
  $('#pjName').focus();
}
async function createProject() {
  try {
    const p = await api('POST', '/api/projects', { name: $('#pjName').value, key: $('#pjKey').value, color: pickedColor });
    closeModal(); state.scope = p.id; await load(); renderShell();
  } catch (e) { $('#pErr').textContent = e.message; }
}

function settingsModal() {
  modal(`<h2>Import from Linear</h2>
    <p class="muted" style="margin:0">In Linear: <b>Settings → Workspace → Import/Export → Export CSV</b>. Upload the file here — issues keep their IDs (e.g. MKY-12), status, priority, assignee, labels and due dates. Safe to run twice; existing issues are skipped.</p>
    <input type="file" id="csvFile" accept=".csv,text/csv" class="mky-input">
    <div class="err" id="iErr"></div>
    <div class="modal__foot"><button class="mky-btn mky-btn--ghost" data-act="close-modal">Close</button>
      <button class="mky-btn mky-btn--primary" data-act="do-import">Import</button></div>
    <hr style="border:0;border-top:1px solid var(--mky-border);width:100%">
    <div class="modal__foot"><span class="hint">Signed in as ${esc(state.me.email)}</span><button class="mky-btn mky-btn--outline mky-btn--sm" data-act="logout">Sign out</button></div>`);
}
async function doImport() {
  const f = $('#csvFile').files[0]; if (!f) { $('#iErr').textContent = 'Choose a CSV file first.'; return; }
  try {
    const r = await api('POST', '/api/import/linear', { csv: await f.text() });
    closeModal(); await refresh(); toast(`Imported ${r.imported} issues${r.projects ? `, ${r.projects} projects` : ''}${r.skipped ? ` (${r.skipped} skipped)` : ''}`);
  } catch (e) { $('#iErr').textContent = e.message; }
}

// ---------- events ----------
document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-act]');
  if (!a) { if (!e.target.closest('#pop')) closePop(); return; }
  const act = a.dataset.act, id = Number(a.dataset.id);
  if (['pick-priority', 'pick-status', 'pick-assignee'].includes(act)) {
    e.stopPropagation();
    const i = state.issues.find((x) => x.id === id);
    if (act === 'pick-status') popover(a, STATUSES.map((s) => [s, STATUS_LABEL[s], statusIcon(s)]), (v) => patchIssue(id, { status: v }));
    if (act === 'pick-priority') popover(a, PRIORITIES.map(([v, l]) => [v, l, prioIcon(v)]), (v) => patchIssue(id, { priority: Number(v) }));
    if (act === 'pick-assignee') popover(a, [['', 'Unassigned', avatar(null)], ...state.users.map((u) => [u.id, u.name, avatar(u)])], (v) => patchIssue(id, { assignee_id: v ? Number(v) : null }));
    return void i;
  }
  closePop();
  switch (act) {
    case 'scope': state.scope = a.dataset.scope === 'all' || a.dataset.scope === 'mine' ? a.dataset.scope : Number(a.dataset.scope); renderSidebar(); renderHead(); renderContent(); break;
    case 'layout': state.layout = a.dataset.layout; localStorage.setItem('layout', state.layout); renderHead(); renderContent(); break;
    case 'open': openDrawer(id); break;
    case 'close-drawer': closeDrawer(); break;
    case 'new-issue': newIssueModal(); break;
    case 'new-project': newProjectModal(); break;
    case 'settings': settingsModal(); break;
    case 'close-modal': closeModal(); break;
    case 'create-issue': createIssue(); break;
    case 'create-project': createProject(); break;
    case 'do-import': doImport(); break;
    case 'pick-color': pickedColor = a.dataset.c; document.querySelectorAll('.colors button').forEach((b) => b.classList.toggle('on', b.dataset.c === pickedColor)); break;
    case 'add-comment': addComment(); break;
    case 'copy-link': navigator.clipboard?.writeText(`${location.origin}/#${state.openId}`); toast('Link copied'); break;
    case 'delete-issue':
      if (confirm('Delete this issue permanently?')) { const d = state.openId; closeDrawer(); await run(() => api('DELETE', `/api/issues/${d}`)); await refresh(); toast('Issue deleted'); }
      break;
    case 'logout': await api('POST', '/api/logout'); state.me = null; renderLogin(); break;
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'search') { state.q = e.target.value; renderContent(); }
});
document.addEventListener('change', (e) => {
  const map = { fStatus: 'fStatus', fAssignee: 'fAssignee', fPriority: 'fPriority' };
  if (map[e.target.id]) { state[map[e.target.id]] = e.target.value; renderContent(); }
});
document.addEventListener('keydown', (e) => {
  if (!state.me) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (e.key === 'Escape') { if ($('#pop')) closePop(); else if ($('.modal')) closeModal(); else if (state.openId) closeDrawer(); else if (typing) document.activeElement.blur(); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'c') { e.preventDefault(); newIssueModal(); }
  if (e.key === '/') { e.preventDefault(); $('#search')?.focus(); }
});

// drag & drop on the board
let dragId = null;
document.addEventListener('dragstart', (e) => { const c = e.target.closest?.('.card'); if (!c) return; dragId = Number(c.dataset.id); c.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; });
document.addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.drag,.over').forEach((x) => x.classList.remove('drag', 'over')); });
document.addEventListener('dragover', (e) => { const col = e.target.closest?.('.col'); if (col && dragId) { e.preventDefault(); document.querySelectorAll('.over').forEach((x) => x !== col && x.classList.remove('over')); col.classList.add('over'); } });
document.addEventListener('drop', (e) => {
  const col = e.target.closest?.('.col'); if (!col || !dragId) return;
  e.preventDefault(); const id = dragId; dragId = null;
  const i = state.issues.find((x) => x.id === id);
  if (i && i.status !== col.dataset.status) patchIssue(id, { status: col.dataset.status });
  else renderContent();
});

// ---------- boot ----------
let eventsConnected = false;
async function boot() {
  try { await load(); } catch {
    state.passwordRequired = (await fetch('/api/config').then((r) => r.json()).catch(() => ({}))).passwordRequired;
    return renderLogin();
  }
  renderShell();
  if (!eventsConnected) { connectEvents(); eventsConnected = true; }
  const hash = Number((location.hash || '').slice(1));
  if (hash && state.issues.some((i) => i.id === hash)) openDrawer(hash);
}
boot();
