const app = require('./app');
const config = require('./config');
const db = require('./database');

db.initialize();

const PORT = config.app.port;

app.listen(PORT, () => {
  console.log(`MindForum server running on port ${PORT}`);
  console.log(`Environment: ${config.app.env}`);
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});