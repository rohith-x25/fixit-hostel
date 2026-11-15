const { init } = require('./db');
const createApp = require('./app');
const db = init(process.env.DB_FILE || 'data.db');
const port = process.env.PORT || 3000;
createApp(db).listen(port, () => console.log(`FixIt Hostel running at http://localhost:${port}`));
