'use strict';

const createApp = require('./src/app');
const machine = require('./src/models/machine');

const PORT = process.env.PORT || 3000;

const app = createApp();

machine.startTicking();

const server = app.listen(PORT, () => {
  console.log(`Vending machine API listening on port ${PORT}`);
});

function shutdown() {
  console.log('Shutting down...');
  machine.stopTicking();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = server;
