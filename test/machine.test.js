'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { VendingMachine, STATUS } = require('../src/models/machine');

test('initial state matches spec defaults', () => {
  const machine = new VendingMachine();
  assert.equal(machine.temperature, 20);
  assert.equal(machine.credit, 0);
  assert.equal(machine.revenue, 0);
  assert.equal(machine.slots.length, 0);
  assert.equal(machine.getStatus(), STATUS.OPERATIONAL);
});

test('restock creates a new slot with freshness reset to 100', () => {
  const machine = new VendingMachine();
  const slot = machine.restock({ id: 1, product: 'Cola', price: 120, stock: 10 });
  assert.equal(machine.slots.length, 1);
  assert.deepEqual(slot, { id: 1, product: 'Cola', price: 120, stock: 10, freshness: 100 });
});

test('restock fully replaces an existing slot by id', () => {
  const machine = new VendingMachine();
  machine.restock({ id: 1, product: 'Cola', price: 120, stock: 10 });
  machine.slots[0].freshness = 40;

  machine.restock({ id: 1, product: 'Sprite', price: 130, stock: 5 });

  assert.equal(machine.slots.length, 1);
  assert.deepEqual(machine.slots[0], {
    id: 1,
    product: 'Sprite',
    price: 130,
    stock: 5,
    freshness: 100,
  });
});

test('insertCoins accumulates credit', () => {
  const machine = new VendingMachine();
  machine.insertCoins(50);
  machine.insertCoins(25);
  assert.equal(machine.credit, 75);
});

test('select purchases successfully and updates all balances', () => {
  const machine = new VendingMachine();
  machine.restock({ id: 1, product: 'Cola', price: 120, stock: 1 });
  machine.insertCoins(200);

  const result = machine.select(1);

  assert.deepEqual(result, { product: 'Cola', price: 120, remainingCredit: 80 });
  assert.equal(machine.credit, 80);
  assert.equal(machine.revenue, 120);
  assert.equal(machine.slots[0].stock, 0);
});

test('select throws SLOT_NOT_FOUND for unknown slot', () => {
  const machine = new VendingMachine();
  assert.throws(() => machine.select(999), (err) => err.code === 'SLOT_NOT_FOUND' && err.status === 404);
});

test('select throws OUT_OF_STOCK when stock is zero', () => {
  const machine = new VendingMachine();
  machine.restock({ id: 1, product: 'Cola', price: 120, stock: 0 });
  machine.insertCoins(200);
  assert.throws(() => machine.select(1), (err) => err.code === 'OUT_OF_STOCK' && err.status === 409);
});

test('select throws PRODUCT_EXPIRED when freshness is zero', () => {
  const machine = new VendingMachine();
  machine.restock({ id: 1, product: 'Cola', price: 120, stock: 1 });
  machine.slots[0].freshness = 0;
  machine.insertCoins(200);
  assert.throws(() => machine.select(1), (err) => err.code === 'PRODUCT_EXPIRED' && err.status === 409);
});

test('select throws INSUFFICIENT_CREDIT when credit is too low', () => {
  const machine = new VendingMachine();
  machine.restock({ id: 1, product: 'Cola', price: 120, stock: 1 });
  machine.insertCoins(50);
  assert.throws(() => machine.select(1), (err) => err.code === 'INSUFFICIENT_CREDIT' && err.status === 402);
});

test('tick raises temperature by 3 and lowers freshness by 1', () => {
  const machine = new VendingMachine();
  machine.restock({ id: 1, product: 'Cola', price: 120, stock: 1 });

  machine.tick();

  assert.equal(machine.temperature, 23);
  assert.equal(machine.slots[0].freshness, 99);
});

test('freshness never drops below zero', () => {
  const machine = new VendingMachine();
  machine.restock({ id: 1, product: 'Cola', price: 120, stock: 1 });
  machine.slots[0].freshness = 0;

  machine.tick();

  assert.equal(machine.slots[0].freshness, 0);
});

test('machine becomes irreversibly broken once temperature exceeds 100', () => {
  const machine = new VendingMachine();
  machine.temperature = 99; // +3 -> 102, за критической отметкой

  machine.tick();

  assert.equal(machine.getStatus(), STATUS.BROKEN);
  assert.equal(machine.temperature, 102);

  // Дальнейшие тики не должны больше ничего менять — таймер сам себя остановил,
  // но даже прямой вызов tick() безопасен и ничего не меняет для сломанной машины.
  machine.tick();
  assert.equal(machine.temperature, 102);
});

test('maintain lowers temperature by 30 but never below zero', () => {
  const machine = new VendingMachine();
  machine.temperature = 10;

  const result = machine.maintain();

  assert.equal(result.temperature, 0);
  assert.equal(machine.temperature, 0);
  assert.equal(result.status, STATUS.OPERATIONAL);
});

test('status thresholds match specification exactly', () => {
  const machine = new VendingMachine();

  machine.temperature = 80;
  assert.equal(machine.getStatus(), STATUS.OPERATIONAL);

  machine.temperature = 81;
  assert.equal(machine.getStatus(), STATUS.OVERHEATED);

  machine.temperature = 100;
  assert.equal(machine.getStatus(), STATUS.OVERHEATED);

  machine.temperature = 101;
  assert.equal(machine.getStatus(), STATUS.BROKEN);
});
