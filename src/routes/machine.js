'use strict';

const express = require('express');
const machine = require('../models/machine');
const {
  validateRestockPayload,
  validateInsertPayload,
  validateSelectPayload,
} = require('../validators/machine');

const router = express.Router();

/**
 * В статусе broken разрешён только просмотр состояния (GET /machine).
 * Этот middleware вешается на все изменяющие эндпоинты сразу.
 */
function rejectIfBroken(req, res, next) {
  if (machine.isBroken()) {
    return res.status(409).json({
      error: 'Machine is broken and cannot process this action',
      code: 'MACHINE_BROKEN',
    });
  }
  next();
}

// GET /machine — текущее состояние автомата.
router.get('/', (req, res) => {
  res.status(200).json(machine.toJSON());
});

// POST /machine/restock — создать или полностью заменить слот.
router.post('/restock', rejectIfBroken, (req, res) => {
  const errors = validateRestockPayload(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Invalid restock payload', details: errors });
  }

  const { id, product, price, stock } = req.body;
  const slot = machine.restock({ id, product, price, stock });

  res.status(200).json({ message: 'Slot updated', slot });
});

// POST /machine/insert — внести монеты.
router.post('/insert', rejectIfBroken, (req, res) => {
  const errors = validateInsertPayload(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Invalid insert payload', details: errors });
  }

  const { amount } = req.body;
  const credit = machine.insertCoins(amount);

  res.status(200).json({ message: 'Coins inserted', credit });
});

// POST /machine/select — купить товар из слота.
router.post('/select', rejectIfBroken, (req, res) => {
  const errors = validateSelectPayload(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Invalid select payload', details: errors });
  }

  const { slotId } = req.body;

  try {
    const result = machine.select(slotId);
    res.status(200).json({ message: 'Purchase successful', ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// POST /machine/maintain — обслуживание (доступно только вне статуса broken).
router.post('/maintain', rejectIfBroken, (req, res) => {
  const result = machine.maintain();
  res.status(200).json({ message: 'Maintenance completed', ...result });
});

module.exports = router;
