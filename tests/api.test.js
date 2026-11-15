const request = require('supertest');
const { init } = require('../src/db');
const createApp = require('../src/app');

let app;
beforeAll(() => { app = createApp(init(':memory:')); });
const login = async (email, password) =>
  (await request(app).post('/api/auth/login').send({ email, password })).body.token;
const auth = t => ({ Authorization: `Bearer ${t}` });
const sample = { title: 'Fan not working', description: 'Ceiling fan stopped', category_id: 1, location: 'Block A, Room 101', priority: 'High' };

test('TC-01 login with valid credentials returns token', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'student@sru.edu', password: 'Student@123' });
  expect(res.status).toBe(200); expect(res.body.token).toBeDefined(); expect(res.body.user.role).toBe('student');
});
test('TC-02 login with wrong password is rejected', async () => {
  const res = await request(app).post('/api/auth/login').send({ email: 'student@sru.edu', password: 'bad' });
  expect(res.status).toBe(401);
});
test('TC-03 student creates a valid request', async () => {
  const t = await login('student@sru.edu', 'Student@123');
  const res = await request(app).post('/api/requests').set(auth(t)).send(sample);
  expect(res.status).toBe(201); expect(res.body.status).toBe('Open');
});
test('TC-04 missing required fields returns 400', async () => {
  const t = await login('student@sru.edu', 'Student@123');
  const res = await request(app).post('/api/requests').set(auth(t)).send({ title: 'x' });
  expect(res.status).toBe(400);
});
test('TC-05 student cannot assign or call admin report', async () => {
  const t = await login('student@sru.edu', 'Student@123');
  expect((await request(app).patch('/api/requests/1/assign').set(auth(t)).send({ technician_id: 2 })).status).toBe(403);
  expect((await request(app).get('/api/reports/summary').set(auth(t))).status).toBe(403);
});
test('TC-06 full lifecycle: assign -> in progress -> resolved -> closed', async () => {
  const st = await login('student@sru.edu', 'Student@123');
  const ad = await login('admin@sru.edu', 'Admin@123');
  const te = await login('tech@sru.edu', 'Tech@123');
  const id = (await request(app).post('/api/requests').set(auth(st)).send(sample)).body.id;
  const techs = (await request(app).get('/api/users/technicians').set(auth(ad))).body;
  expect((await request(app).patch(`/api/requests/${id}/assign`).set(auth(ad)).send({ technician_id: techs[0].id })).status).toBe(200);
  expect((await request(app).patch(`/api/requests/${id}/status`).set(auth(te)).send({ status: 'Closed' })).status).toBe(400);
  expect((await request(app).patch(`/api/requests/${id}/status`).set(auth(te)).send({ status: 'In Progress' })).status).toBe(200);
  expect((await request(app).patch(`/api/requests/${id}/status`).set(auth(te)).send({ status: 'Resolved', note: 'Replaced capacitor' })).status).toBe(200);
  expect((await request(app).patch(`/api/requests/${id}/status`).set(auth(st)).send({ status: 'Closed' })).status).toBe(200);
  const detail = await request(app).get(`/api/requests/${id}`).set(auth(st));
  expect(detail.body.status).toBe('Closed'); expect(detail.body.logs.length).toBe(5);
});
test('TC-07 search and filter, plus summary report', async () => {
  const ad = await login('admin@sru.edu', 'Admin@123');
  const list = await request(app).get('/api/requests?q=fan&category_id=1').set(auth(ad));
  expect(list.status).toBe(200); expect(list.body.length).toBeGreaterThan(0);
  const sum = await request(app).get('/api/reports/summary').set(auth(ad));
  expect(sum.status).toBe(200); expect(Array.isArray(sum.body.byStatus)).toBe(true);
});
