require('dotenv').config();
const app = require('./app');
const config = require('./config');
const db = require('./database');

async function start() {
  try {
    await db.initialize();

    // Seed default settings after database init (avoids circular dependency)
    const SettingService = require('./services/setting.service');
    await SettingService.seedDefaults();

    const PORT = config.app.port;
    app.listen(PORT, () => {
      console.log(`MindForum server running on port ${PORT}`);
      console.log(`Environment: ${config.app.env}`);
    });
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

start();

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await db.close();
  process.exit(0);
});