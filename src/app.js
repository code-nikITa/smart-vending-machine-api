'use strict';

const express = require('express');
const machineRouter = require('./routes/machine');
const requestLogger = require('./middleware/logger');

function createApp() {
  const app = express();

  app.use(requestLogger);
  app.use(express.json());

  app.get('/', (req, res) => {
    res.status(200).json({
      message: 'Smart Vending Machine API',
      docs: 'See README.md for available endpoints',
    });
  });

  app.use('/machine', machineRouter);

  // 404 — неизвестный маршрут.
  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  // Центральный обработчик ошибок: например, битый JSON в теле запроса.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = createApp;
