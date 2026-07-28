'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const createApp = require('../src/app');
const machine = require('../src/models/machine');

const app = createApp();

// Автомат — singleton, его состояние переживает между тестами. Сбрасываем
// перед каждым тестом, чтобы они были независимы друг от друга.
test.beforeEach(() => {
  machine.reset();
});

test.after(() => {
  machine.stopTicking();
});

test('GET /machine returns initial state with 200', async () => {
  const res = await request(app).get('/machine');

  assert.equal(res.status, 200);
  assert.equal(res.body.temperature, 20);
  assert.equal(res.body.credit, 0);
  assert.equal(res.body.revenue, 0);
  assert.equal(res.body.status, 'operational');
  assert.deepEqual(res.body.slots, []);
});

test('POST /machine/restock creates a new slot with 200', async () => {
  const res = await request(app)
    .post('/machine/restock')
    .send({ id: 1, product: 'Cola', price: 120, stock: 10 });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.slot, {
    id: 1,
    product: 'Cola',
    price: 120,
    stock: 10,
    freshness: 100,
  });
});

test('POST /machine/restock rejects missing required fields with 400', async () => {
  const res = await request(app)
    .post('/machine/restock')
    .send({ id: 1, product: 'Cola' });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Invalid restock payload');
  assert.ok(Array.isArray(res.body.details));
  assert.ok(res.body.details.some((d) => d.field === 'price'));
  assert.ok(res.body.details.some((d) => d.field === 'stock'));
});

test('POST /machine/restock rejects wrong field types with 400', async () => {
  const res = await request(app)
    .post('/machine/restock')
    .send({ id: '1', product: 'Cola', price: 'expensive', stock: 10 });

  assert.equal(res.status, 400);
  assert.ok(res.body.details.some((d) => d.field === 'id'));
  assert.ok(res.body.details.some((d) => d.field === 'price'));
});

test('POST /machine/insert increases credit and returns 200', async () => {
  const res = await request(app).post('/machine/insert').send({ amount: 100 });

  assert.equal(res.status, 200);
  assert.equal(res.body.credit, 100);
});

test('POST /machine/insert rejects non-positive amount with 400', async () => {
  const res = await request(app).post('/machine/insert').send({ amount: -5 });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Invalid insert payload');
});

test('POST /machine/select full purchase flow returns 200 and updates balances', async () => {
  await request(app)
    .post('/machine/restock')
    .send({ id: 1, product: 'Cola', price: 120, stock: 1 });
  await request(app).post('/machine/insert').send({ amount: 150 });

  const res = await request(app).post('/machine/select').send({ slotId: 1 });

  assert.equal(res.status, 200);
  assert.equal(res.body.product, 'Cola');
  assert.equal(res.body.price, 120);
  assert.equal(res.body.remainingCredit, 30);

  const state = await request(app).get('/machine');
  assert.equal(state.body.revenue, 120);
  assert.equal(state.body.slots[0].stock, 0);
});

test('POST /machine/select returns 404 for unknown slot', async () => {
  const res = await request(app).post('/machine/select').send({ slotId: 999 });

  assert.equal(res.status, 404);
  assert.equal(res.body.code, 'SLOT_NOT_FOUND');
});

test('POST /machine/select returns 409 when out of stock', async () => {
  await request(app)
    .post('/machine/restock')
    .send({ id: 1, product: 'Cola', price: 100, stock: 0 });
  await request(app).post('/machine/insert').send({ amount: 100 });

  const res = await request(app).post('/machine/select').send({ slotId: 1 });

  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'OUT_OF_STOCK');
});

test('POST /machine/select returns 402 when credit is insufficient', async () => {
  await request(app)
    .post('/machine/restock')
    .send({ id: 1, product: 'Cola', price: 500, stock: 1 });
  await request(app).post('/machine/insert').send({ amount: 10 });

  const res = await request(app).post('/machine/select').send({ slotId: 1 });

  assert.equal(res.status, 402);
  assert.equal(res.body.code, 'INSUFFICIENT_CREDIT');
});

test('POST /machine/select rejects invalid slotId type with 400', async () => {
  const res = await request(app).post('/machine/select').send({ slotId: 'one' });

  assert.equal(res.status, 400);
});

test('POST /machine/maintain lowers temperature and returns 200', async () => {
  await request(app).post('/machine/maintain'); // temperature 20 -> 0 (clamped)

  const res = await request(app).get('/machine');
  assert.equal(res.body.temperature, 0);
});

test('broken machine rejects all mutating endpoints with 409 MACHINE_BROKEN', async () => {
  // Разгоняем температуру напрямую, не дожидаясь реального таймера,
  // чтобы протестировать необратимую поломку через реальный HTTP-слой.
  machine.temperature = 150;

  const restock = await request(app)
    .post('/machine/restock')
    .send({ id: 1, product: 'Cola', price: 100, stock: 1 });
  const insert = await request(app).post('/machine/insert').send({ amount: 10 });
  const select = await request(app).post('/machine/select').send({ slotId: 1 });
  const maintain = await request(app).post('/machine/maintain');

  for (const res of [restock, insert, select, maintain]) {
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'MACHINE_BROKEN');
  }

  // GET остаётся доступным даже в состоянии broken.
  const state = await request(app).get('/machine');
  assert.equal(state.status, 200);
  assert.equal(state.body.status, 'broken');
});

test('malformed JSON body returns 400 with a clear error', async () => {
  const res = await request(app)
    .post('/machine/insert')
    .set('Content-Type', 'application/json')
    .send('{amount: 100'); // невалидный JSON

  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Invalid JSON in request body');
});

test('unknown route returns 404', async () => {
  const res = await request(app).get('/no-such-route');

  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'Route not found');
});
