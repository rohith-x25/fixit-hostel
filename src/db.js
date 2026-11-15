const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

function init(file) {
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student','technician','admin')),
      room TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS categories(
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS requests(
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id), location TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'Medium', status TEXT NOT NULL DEFAULT 'Open',
      created_by INTEGER NOT NULL REFERENCES users(id), assigned_to INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS request_logs(
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER NOT NULL REFERENCES requests(id),
      actor_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL, note TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP);
  `);
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
    const ins = db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)');
    ins.run('Hostel Admin', 'admin@sru.edu', bcrypt.hashSync('Admin@123', 10), 'admin');
    ins.run('Ravi Technician', 'tech@sru.edu', bcrypt.hashSync('Tech@123', 10), 'technician');
    ins.run('Demo Student', 'student@sru.edu', bcrypt.hashSync('Student@123', 10), 'student');
    const cat = db.prepare('INSERT INTO categories(name) VALUES(?)');
    ['Electrical', 'Plumbing', 'Furniture', 'Internet / Wi-Fi', 'Cleaning', 'Other'].forEach(n => cat.run(n));
  }
  return db;
}
module.exports = { init };
