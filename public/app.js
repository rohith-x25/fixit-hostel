const $ = s => document.querySelector(s);
let token = localStorage.getItem('t'), me = JSON.parse(localStorage.getItem('u') || 'null'), cats = [];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = m => { $('#msg').textContent = m; setTimeout(() => $('#msg').textContent = '', 4000); };
async function api(p, method = 'GET', body) {
  const r = await fetch('/api' + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && token) logout();
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
}
const fd = f => Object.fromEntries(new FormData(f));
const logout = () => { localStorage.clear(); token = me = null; nav(); loginView(); };
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };

function nav() {
  const n = $('#nav'); n.innerHTML = '';
  if (!me) return;
  const items = [['Dashboard', dashView]];
  if (me.role === 'student') items.push(['New Request', newView]);
  items.push(['Requests', listView]);
  if (me.role === 'admin') items.push(['Admin', adminView]);
  items.forEach(([t, f]) => { const b = document.createElement('button'); b.textContent = t; b.onclick = guard(f); n.append(b); });
  const o = document.createElement('button'); o.textContent = `Logout (${me.name})`; o.onclick = logout; n.append(o);
}
function loginView() {
  $('#app').innerHTML = `<div class="card" style="max-width:420px;margin:auto"><h2 id="ttl">Login</h2>
  <form id="f"><div id="extra" hidden><input name="name" placeholder="Full name"><input name="room" placeholder="Hostel room (e.g. A-101)"></div>
  <input name="email" type="email" placeholder="Email" required><input name="password" type="password" placeholder="Password" required>
  <button class="p" id="go">Login</button> <a href="#" id="sw">New student? Register</a></form>
  <small>Demo: student@sru.edu / Student@123 · tech@sru.edu / Tech@123 · admin@sru.edu / Admin@123</small></div>`;
  let reg = false;
  $('#sw').onclick = e => { e.preventDefault(); reg = !reg; $('#extra').hidden = !reg; $('#ttl').textContent = reg ? 'Register' : 'Login'; $('#go').textContent = reg ? 'Register' : 'Login'; };
  $('#f').onsubmit = guard(async e => {
    e.preventDefault();
    const d = await api(reg ? '/auth/register' : '/auth/login', 'POST', fd(e.target));
    token = d.token; me = d.user; localStorage.setItem('t', token); localStorage.setItem('u', JSON.stringify(me));
    cats = await api('/categories'); nav(); dashView();
  });
}
async function dashView() {
  const list = await api('/requests'); const cnt = {};
  list.forEach(r => cnt[r.status] = (cnt[r.status] || 0) + 1);
  let html = `<h2>Welcome, ${esc(me.name)} <small>(${me.role})</small></h2><div class="grid">` +
    ['Open', 'Assigned', 'In Progress', 'Resolved', 'Closed', 'Rejected'].map(s => `<div class="card stat"><b>${cnt[s] || 0}</b>${s}</div>`).join('') + '</div>';
  if (me.role !== 'student') {
    const s = await api('/reports/summary');
    html += `<div class="card"><h3>Category-wise Summary</h3><table><tr><th>Category</th><th>Requests</th></tr>${s.byCategory.map(c => `<tr><td>${esc(c.category)}</td><td>${c.count}</td></tr>`).join('')}</table></div>
    <div class="card"><h3>Pending (Open) Requests</h3>${table(s.pending)}</div>
    <div class="card"><h3>Resolved / Closed Requests</h3>${table(s.resolved)}</div>`;
  }
  $('#app').innerHTML = html; bindRows();
}
const table = l => l.length ? `<table><tr><th>#</th><th>Title</th><th>Category</th><th>Location</th><th>Priority</th><th>Status</th><th>Updated</th></tr>${l.map(r =>
  `<tr class="click" data-id="${r.id}"><td>${r.id}</td><td>${esc(r.title)}</td><td>${esc(r.category)}</td><td>${esc(r.location)}</td><td>${esc(r.priority)}</td><td><span class="badge">${esc(r.status)}</span></td><td>${esc(r.updated_at)}</td></tr>`).join('')}</table>` : '<p><small>No requests found.</small></p>';
const bindRows = () => document.querySelectorAll('tr.click').forEach(tr => tr.onclick = guard(() => detailView(tr.dataset.id)));
const catOpts = () => cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
function newView() {
  $('#app').innerHTML = `<div class="card"><h2>Report a Maintenance Issue</h2><form id="f">
  <input name="title" placeholder="Short title" required><textarea name="description" rows="4" placeholder="Describe the problem" required></textarea>
  <div class="row"><select name="category_id">${catOpts()}</select><select name="priority"><option>Low</option><option selected>Medium</option><option>High</option><option>Urgent</option></select></div>
  <input name="location" placeholder="Location (e.g. Block A, Room 101)" required><button class="p">Submit</button></form></div>`;
  $('#f').onsubmit = guard(async e => { e.preventDefault(); const b = fd(e.target); b.category_id = +b.category_id; await api('/requests', 'POST', b); toast('Request submitted'); listView(); });
}
async function listView() {
  $('#app').innerHTML = `<div class="card"><h2>Requests</h2><div class="row"><input id="q" placeholder="Search title / description / location">
  <select id="st"><option value="">All statuses</option>${['Open', 'Assigned', 'In Progress', 'Resolved', 'Closed', 'Rejected'].map(s => `<option>${s}</option>`).join('')}</select>
  <select id="ct"><option value="">All categories</option>${catOpts()}</select></div><div id="res"></div></div>`;
  const load = guard(async () => {
    const p = new URLSearchParams({ q: $('#q').value, status: $('#st').value, category_id: $('#ct').value });
    [...p.keys()].forEach(k => !p.get(k) && p.delete(k));
    $('#res').innerHTML = table(await api('/requests?' + p)); bindRows();
  });
  ['#q', '#st', '#ct'].forEach(s => $(s).oninput = load); load();
}
async function detailView(id) {
  const r = await api('/requests/' + id); const NEXT = { Open: ['Rejected'], Assigned: ['In Progress', 'Rejected'], 'In Progress': ['Resolved'], Resolved: ['Closed', 'In Progress'] };
  let ctl = '';
  if (me.role === 'admin' && ['Open', 'Assigned'].includes(r.status)) {
    const t = await api('/users/technicians');
    ctl += `<div class="row"><select id="tech">${t.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select><button class="p" id="asg">Assign</button></div>`;
  }
  const opts = (me.role === 'student' ? (r.status === 'Resolved' ? ['Closed'] : []) : (NEXT[r.status] || []));
  if (opts.length) ctl += `<div class="row"><select id="ns">${opts.map(o => `<option>${o}</option>`).join('')}</select><input id="note" placeholder="Note (optional)"><button class="p" id="upd">Update status</button></div>`;
  $('#app').innerHTML = `<div class="card"><h2>#${r.id} ${esc(r.title)} <span class="badge">${esc(r.status)}</span></h2>
  <p>${esc(r.description)}</p><p><small>${esc(r.category)} · ${esc(r.location)} · Priority: ${esc(r.priority)} · By ${esc(r.requester)} · Technician: ${esc(r.technician || 'Not assigned')}</small></p>${ctl}</div>
  <div class="card"><h3>History</h3><table>${r.logs.map(l => `<tr><td>${esc(l.timestamp)}</td><td>${esc(l.actor)}</td><td>${esc(l.action)}</td><td>${esc(l.note)}</td></tr>`).join('')}</table></div>`;
  if ($('#asg')) $('#asg').onclick = guard(async () => { await api(`/requests/${id}/assign`, 'PATCH', { technician_id: +$('#tech').value }); toast('Assigned'); detailView(id); });
  if ($('#upd')) $('#upd').onclick = guard(async () => { await api(`/requests/${id}/status`, 'PATCH', { status: $('#ns').value, note: $('#note').value }); toast('Updated'); detailView(id); });
}
async function adminView() {
  const t = await api('/users/technicians');
  $('#app').innerHTML = `<div class="card"><h2>Categories</h2><p>${cats.map(c => `<span class="badge">${esc(c.name)}</span>`).join(' ')}</p>
  <form id="cf" class="row"><input name="name" placeholder="New category" required><button class="p">Add</button></form></div>
  <div class="card"><h2>Technicians</h2><table>${t.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.email)}</td></tr>`).join('')}</table>
  <h3>Add technician</h3><form id="tf"><div class="row"><input name="name" placeholder="Name" required><input name="email" type="email" placeholder="Email" required><input name="password" type="password" placeholder="Password (min 8)" required></div><button class="p">Create</button></form></div>`;
  $('#cf').onsubmit = guard(async e => { e.preventDefault(); await api('/categories', 'POST', fd(e.target)); cats = await api('/categories'); toast('Category added'); adminView(); });
  $('#tf').onsubmit = guard(async e => { e.preventDefault(); await api('/users', 'POST', fd(e.target)); toast('Technician created'); adminView(); });
}
(async () => { nav(); if (me) { try { cats = await api('/categories'); dashView(); } catch { logout(); } } else loginView(); })();
