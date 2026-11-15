const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const NEXT = { Open: ['Assigned', 'Rejected'], Assigned: ['In Progress', 'Rejected'],
  'In Progress': ['Resolved'], Resolved: ['Closed', 'In Progress'], Closed: [], Rejected: [] };
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const log = (rid, actor, action, note = '') =>
    db.prepare('INSERT INTO request_logs(request_id,actor_id,action,note) VALUES(?,?,?,?)').run(rid, actor, action, note);

  // Authentication + server-side role check
  const auth = (...roles) => (req, res, next) => {
    try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET); }
    catch { return res.status(401).json({ error: 'Login required' }); }
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
    next();
  };
  const token = u => jwt.sign({ id: u.id, name: u.name, role: u.role }, SECRET, { expiresIn: '8h' });
  const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, room: u.room });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  // ---------- Auth ----------
  app.post('/api/auth/register', (req, res) => {
    const { name, email, password, room } = req.body || {};
    if (!name || !EMAIL.test(email || '') || !password || password.length < 8)
      return res.status(400).json({ error: 'Name, valid email and password (min 8 chars) are required' });
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email.toLowerCase()))
      return res.status(409).json({ error: 'Email already registered' });
    const id = db.prepare('INSERT INTO users(name,email,password_hash,role,room) VALUES(?,?,?,?,?)')
      .run(name.trim(), email.toLowerCase(), bcrypt.hashSync(password, 10), 'student', room || null).lastInsertRowid;
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    res.status(201).json({ token: token(u), user: pub(u) });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    const u = db.prepare('SELECT * FROM users WHERE email=?').get((email || '').toLowerCase());
    if (!u || !bcrypt.compareSync(password || '', u.password_hash))
      return res.status(401).json({ error: 'Invalid email or password' });
    res.json({ token: token(u), user: pub(u) });
  });

  // ---------- Categories & users ----------
  app.get('/api/categories', auth(), (_q, res) => res.json(db.prepare('SELECT * FROM categories ORDER BY name').all()));
  app.post('/api/categories', auth('admin'), (req, res) => {
    const name = ((req.body || {}).name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name required' });
    try { res.status(201).json({ id: db.prepare('INSERT INTO categories(name) VALUES(?)').run(name).lastInsertRowid, name }); }
    catch { res.status(409).json({ error: 'Category already exists' }); }
  });
  app.get('/api/users/technicians', auth('admin'), (_q, res) =>
    res.json(db.prepare("SELECT id,name,email FROM users WHERE role='technician'").all()));
  app.post('/api/users', auth('admin'), (req, res) => {
    const { name, email, password } = req.body || {};
    if (!name || !EMAIL.test(email || '') || !password || password.length < 8)
      return res.status(400).json({ error: 'Name, valid email and password (min 8 chars) are required' });
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email.toLowerCase())) return res.status(409).json({ error: 'Email already registered' });
    const id = db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'technician')")
      .run(name, email.toLowerCase(), bcrypt.hashSync(password, 10)).lastInsertRowid;
    res.status(201).json({ id, name, email });
  });

  // ---------- Requests ----------
  const BASE = `SELECT r.*, c.name category, u.name requester, u.room requester_room, t.name technician
    FROM requests r JOIN categories c ON c.id=r.category_id JOIN users u ON u.id=r.created_by
    LEFT JOIN users t ON t.id=r.assigned_to`;
  const canSee = (u, r) => u.role === 'admin' || (u.role === 'student' && r.created_by === u.id) ||
    (u.role === 'technician' && r.assigned_to === u.id);

  app.post('/api/requests', auth('student'), (req, res) => {
    const { title, description, category_id, location, priority = 'Medium' } = req.body || {};
    if (!title || !description || !category_id || !location || !PRIORITIES.includes(priority))
      return res.status(400).json({ error: 'title, description, category_id, location and a valid priority are required' });
    if (!db.prepare('SELECT 1 FROM categories WHERE id=?').get(category_id))
      return res.status(400).json({ error: 'Unknown category' });
    const id = db.prepare('INSERT INTO requests(title,description,category_id,location,priority,created_by) VALUES(?,?,?,?,?,?)')
      .run(title.trim(), description.trim(), category_id, location.trim(), priority, req.user.id).lastInsertRowid;
    log(id, req.user.id, 'Created');
    res.status(201).json({ id, status: 'Open' });
  });

  app.get('/api/requests', auth(), (req, res) => {
    const { status, category_id, q } = req.query;
    const w = [], p = [];
    if (req.user.role === 'student') { w.push('r.created_by=?'); p.push(req.user.id); }
    if (req.user.role === 'technician') { w.push('r.assigned_to=?'); p.push(req.user.id); }
    if (status) { w.push('r.status=?'); p.push(status); }
    if (category_id) { w.push('r.category_id=?'); p.push(category_id); }
    if (q) { w.push('(r.title LIKE ? OR r.description LIKE ? OR r.location LIKE ?)'); p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    res.json(db.prepare(`${BASE} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY r.id DESC`).all(...p));
  });

  app.get('/api/requests/:id', auth(), (req, res) => {
    const r = db.prepare(`${BASE} WHERE r.id=?`).get(req.params.id);
    if (!r || !canSee(req.user, r)) return res.status(404).json({ error: 'Request not found' });
    r.logs = db.prepare(`SELECT l.action,l.note,l.timestamp,u.name actor FROM request_logs l
      JOIN users u ON u.id=l.actor_id WHERE l.request_id=? ORDER BY l.id`).all(r.id);
    res.json(r);
  });

  app.patch('/api/requests/:id/assign', auth('admin'), (req, res) => {
    const r = db.prepare('SELECT * FROM requests WHERE id=?').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found' });
    const t = db.prepare("SELECT * FROM users WHERE id=? AND role='technician'").get((req.body || {}).technician_id);
    if (!t) return res.status(400).json({ error: 'Valid technician_id required' });
    if (!['Open', 'Assigned'].includes(r.status)) return res.status(400).json({ error: 'Request can no longer be assigned' });
    db.prepare("UPDATE requests SET assigned_to=?, status='Assigned', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(t.id, r.id);
    log(r.id, req.user.id, 'Assigned', `Assigned to ${t.name}`);
    res.json({ id: r.id, status: 'Assigned' });
  });

  app.patch('/api/requests/:id/status', auth(), (req, res) => {
    const r = db.prepare('SELECT * FROM requests WHERE id=?').get(req.params.id);
    const { status, note = '' } = req.body || {};
    if (!r || !canSee(req.user, r)) return res.status(404).json({ error: 'Request not found' });
    if (req.user.role === 'student' && !(r.status === 'Resolved' && status === 'Closed'))
      return res.status(403).json({ error: 'Students can only close their own resolved requests' });
    if (!(NEXT[r.status] || []).includes(status))
      return res.status(400).json({ error: `Cannot move from ${r.status} to ${status}` });
    if (status === 'Assigned') return res.status(400).json({ error: 'Use the assign endpoint' });
    db.prepare('UPDATE requests SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, r.id);
    log(r.id, req.user.id, `Status: ${status}`, note);
    res.json({ id: r.id, status });
  });

  // ---------- Reports ----------
  app.get('/api/reports/summary', auth('admin', 'technician'), (req, res) => {
    const scope = req.user.role === 'technician' ? `AND r.assigned_to=${Number(req.user.id)}` : '';
    res.json({
      byStatus: db.prepare('SELECT status, COUNT(*) count FROM requests GROUP BY status').all(),
      byCategory: db.prepare(`SELECT c.name category, COUNT(r.id) count FROM categories c
        LEFT JOIN requests r ON r.category_id=c.id GROUP BY c.id ORDER BY count DESC`).all(),
      pending: db.prepare(`${BASE} WHERE r.status='Open' ORDER BY r.id`).all(),
      resolved: db.prepare(`${BASE} WHERE r.status IN ('Resolved','Closed') ${scope} ORDER BY r.updated_at DESC`).all()
    });
  });

  return app;
};
