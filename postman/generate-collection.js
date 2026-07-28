'use strict';

const fs = require('fs');
const path = require('path');

function item(name, request, tests, description) {
  const events = [];
  if (tests && tests.length) {
    events.push({
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: tests,
      },
    });
  }
  const result = {
    name,
    request,
    response: [],
  };
  if (description) result.request.description = description;
  if (events.length) result.event = events;
  return result;
}

function jsonBody(obj) {
  return {
    mode: 'raw',
    raw: JSON.stringify(obj, null, 2),
    options: { raw: { language: 'json' } },
  };
}

// Для случаев, когда переменная коллекции должна подставиться как ЧИСЛО
// внутри JSON (Postman подставляет строки в кавычки буквально, поэтому
// JSON.stringify тут не подходит — собираем raw-тело вручную).
function templateJsonBody(rawString) {
  return {
    mode: 'raw',
    raw: rawString,
    options: { raw: { language: 'json' } },
  };
}

function rawBody(str) {
  return {
    mode: 'raw',
    raw: str,
    options: { raw: { language: 'json' } },
  };
}

function req(method, urlPath, body) {
  const r = {
    method,
    header: [{ key: 'Content-Type', value: 'application/json' }],
    url: {
      raw: '{{baseUrl}}' + urlPath,
      host: ['{{baseUrl}}'],
      path: urlPath.replace(/^\//, '').split('/').filter(Boolean),
    },
  };
  if (body) r.body = body;
  return r;
}

// ---------------------------------------------------------------------------
// Info
// ---------------------------------------------------------------------------

const infoFolder = {
  name: '1. Info',
  description: 'Базовый health-check эндпоинт, не описанный в спецификации явно, но полезный для проверки, что сервер поднят.',
  item: [
    item(
      'GET API Root Info',
      req('GET', '/'),
      [
        "pm.test('Status code is 200', () => pm.response.to.have.status(200));",
        "pm.test('Response has a welcome message', () => {",
        '  const json = pm.response.json();',
        "  pm.expect(json).to.have.property('message');",
        "  pm.expect(json.message).to.include('Vending Machine');",
        '});',
      ]
    ),
  ],
};

// ---------------------------------------------------------------------------
// Machine State
// ---------------------------------------------------------------------------

const stateFolder = {
  name: '2. Machine State',
  description: 'GET /machine — просмотр текущего состояния автомата. Единственный эндпоинт, доступный даже когда автомат сломан.',
  item: [
    item(
      'GET Machine State',
      req('GET', '/machine'),
      [
        "pm.test('Status code is 200', () => pm.response.to.have.status(200));",
        "pm.test('Response has full machine shape', () => {",
        '  const json = pm.response.json();',
        "  pm.expect(json).to.have.all.keys('temperature', 'credit', 'revenue', 'status', 'slots');",
        "  pm.expect(json.slots).to.be.an('array');",
        "  pm.expect(json.status).to.be.oneOf(['operational', 'overheated', 'broken']);",
        '});',
        "pm.test('temperature, credit and revenue are numbers', () => {",
        '  const json = pm.response.json();',
        "  pm.expect(json.temperature).to.be.a('number');",
        "  pm.expect(json.credit).to.be.a('number');",
        "  pm.expect(json.revenue).to.be.a('number');",
        '});',
      ]
    ),
  ],
};

// ---------------------------------------------------------------------------
// Restock
// ---------------------------------------------------------------------------

const restockFolder = {
  name: '3. Restock',
  description: 'POST /machine/restock — создание нового слота или полная замена существующего. Freshness всегда сбрасывается в 100.',
  item: [
    item(
      'Restock — Create New Slot (201-style 200 OK)',
      req('POST', '/machine/restock', jsonBody({ id: 501, product: 'Postman Test Cola', price: 100, stock: 10 })),
      [
        "pm.test('Status code is 200', () => pm.response.to.have.status(200));",
        "pm.test('Slot created with freshness reset to 100', () => {",
        '  const json = pm.response.json();',
        "  pm.expect(json.slot).to.include({ id: 501, product: 'Postman Test Cola', price: 100, stock: 10, freshness: 100 });",
        '});',
      ]
    ),
    item(
      'Restock — Replace Existing Slot',
      req('POST', '/machine/restock', jsonBody({ id: 501, product: 'Postman Test Sprite', price: 90, stock: 3 })),
      [
        "pm.test('Status code is 200', () => pm.response.to.have.status(200));",
        "pm.test('Slot fully replaced, not merged', () => {",
        '  const json = pm.response.json();',
        "  pm.expect(json.slot.product).to.eql('Postman Test Sprite');",
        '  pm.expect(json.slot.price).to.eql(90);',
        '  pm.expect(json.slot.stock).to.eql(3);',
        '  pm.expect(json.slot.freshness).to.eql(100);',
        '});',
      ]
    ),
    item(
      'Restock — 400 Missing Required Fields',
      req('POST', '/machine/restock', jsonBody({ id: 502, product: 'Incomplete Item' })),
      [
        "pm.test('Status code is 400', () => pm.response.to.have.status(400));",
        "pm.test('Response lists missing fields', () => {",
        '  const json = pm.response.json();',
        "  const fields = json.details.map((d) => d.field);",
        "  pm.expect(fields).to.include.members(['price', 'stock']);",
        '});',
      ]
    ),
    item(
      'Restock — 400 Wrong Field Types',
      req('POST', '/machine/restock', jsonBody({ id: '502', product: 'Bad Types', price: 'expensive', stock: 10 })),
      [
        "pm.test('Status code is 400', () => pm.response.to.have.status(400));",
        "pm.test('Response flags id and price as invalid', () => {",
        '  const json = pm.response.json();',
        "  const fields = json.details.map((d) => d.field);",
        "  pm.expect(fields).to.include.members(['id', 'price']);",
        '});',
      ]
    ),
  ],
};

// ---------------------------------------------------------------------------
// Insert Coins
// ---------------------------------------------------------------------------

const insertFolder = {
  name: '4. Insert Coins',
  description: 'POST /machine/insert — пополнение кредита монетами.',
  item: [
    item(
      'Insert Coins — Success',
      req('POST', '/machine/insert', jsonBody({ amount: 50 })),
      [
        "pm.test('Status code is 200', () => pm.response.to.have.status(200));",
        "pm.test('Credit increases by inserted amount', () => {",
        '  const json = pm.response.json();',
        "  pm.expect(json).to.have.property('credit');",
        "  pm.expect(json.credit).to.be.a('number');",
        '});',
      ]
    ),
    item(
      'Insert Coins — 400 Non-Positive Amount',
      req('POST', '/machine/insert', jsonBody({ amount: -5 })),
      [
        "pm.test('Status code is 400', () => pm.response.to.have.status(400));",
        "pm.test('Error message mentions invalid payload', () => {",
        '  const json = pm.response.json();',
        "  pm.expect(json.error).to.include('Invalid insert payload');",
        '});',
      ]
    ),
  ],
};

// ---------------------------------------------------------------------------
// Purchase Flow (happy path, chained via collection variables)
// ---------------------------------------------------------------------------

const purchaseFlowFolder = {
  name: '5. Purchase Flow (Happy Path)',
  description:
    'Последовательный сценарий покупки от начала до конца. Запросы должны выполняться по порядку (сверху вниз) — каждый следующий шаг использует данные, сохранённые предыдущим через переменные коллекции. Это делает сценарий устойчивым к повторным запускам, так как сравниваются относительные изменения (дельты), а не абсолютные значения.',
  item: [
    item(
      '0. Get State Before Flow',
      req('GET', '/machine'),
      [
        "pm.test('Status code is 200', () => pm.response.to.have.status(200));",
        'const json = pm.response.json();',
        "pm.collectionVariables.set('revenueBeforeFlow', json.revenue);",
      ]
    ),
    item(
      '1. Restock Product For Flow',
      req('POST', '/machine/restock', templateJsonBody(
        '{\n' +
        '  "id": {{restockSlotId}},\n' +
        '  "product": "Postman Flow Cola",\n' +
        '  "price": {{restockPrice}},\n' +
        '  "stock": 5\n' +
        '}'
      )),
      [
        "pm.test('Status code is 200', () => pm.response.to.have.status(200));",
        'const json = pm.response.json();',
        "pm.test('Slot has full stock and fresh product', () => {",
        '  pm.expect(json.slot.stock).to.eql(5);',
        '  pm.expect(json.slot.freshness).to.eql(100);',
        '});',
        "pm.collectionVariables.set('flowPrice', json.slot.price);",
      ]
    ),
    item(
      '2. Insert Sufficient Coins',
      req('POST', '/machine/insert', jsonBody({ amount: 500 })),
      [
        "pm.test('Status code is 200', () => pm.response.to.have.status(200));",
        'const json = pm.response.json();',
        "pm.collectionVariables.set('creditAfterInsert', json.credit);",
      ]
    ),
    item(
      '3. Purchase Product — Success',
      req('POST', '/machine/select', templateJsonBody('{\n  "slotId": {{restockSlotId}}\n}')),
      [
        "pm.test('Status code is 200', () => pm.response.to.have.status(200));",
        'const json = pm.response.json();',
        "const price = Number(pm.collectionVariables.get('flowPrice'));",
        "const creditAfterInsert = Number(pm.collectionVariables.get('creditAfterInsert'));",
        "pm.test('Purchased product matches restocked product', () => {",
        "  pm.expect(json.product).to.eql('Postman Flow Cola');",
        '  pm.expect(json.price).to.eql(price);',
        '});',
        "pm.test('Remaining credit equals creditAfterInsert minus price', () => {",
        '  pm.expect(json.remainingCredit).to.eql(creditAfterInsert - price);',
        '});',
        "pm.collectionVariables.set('remainingCreditAfterPurchase', json.remainingCredit);",
      ]
    ),
    item(
      '4. Verify State After Purchase',
      req('GET', '/machine'),
      [
        "pm.test('Status code is 200', () => pm.response.to.have.status(200));",
        'const json = pm.response.json();',
        "const price = Number(pm.collectionVariables.get('flowPrice'));",
        "const revenueBeforeFlow = Number(pm.collectionVariables.get('revenueBeforeFlow'));",
        "const expectedCredit = Number(pm.collectionVariables.get('remainingCreditAfterPurchase'));",
        "pm.test('Revenue increased by exactly the purchase price', () => {",
        '  pm.expect(json.revenue).to.eql(revenueBeforeFlow + price);',
        '});',
        "pm.test('Slot stock decreased by 1 (5 -> 4)', () => {",
        "  const slot = json.slots.find((s) => s.id === Number(pm.collectionVariables.get('restockSlotId')));",
        '  pm.expect(slot.stock).to.eql(4);',
        '});',
        "pm.test('Credit matches the value returned by the purchase', () => {",
        '  pm.expect(json.credit).to.eql(expectedCredit);',
        '});',
      ]
    ),
  ],
};

// ---------------------------------------------------------------------------
// Purchase Errors
// ---------------------------------------------------------------------------

const purchaseErrorsFolder = {
  name: '6. Purchase Errors',
  description: 'Все ветки отказа при POST /machine/select: неверный тип поля, несуществующий слот, нет остатка, недостаточно кредита.',
  item: [
    item(
      'Select — 400 Invalid slotId Type',
      req('POST', '/machine/select', jsonBody({ slotId: 'one' })),
      [
        "pm.test('Status code is 400', () => pm.response.to.have.status(400));",
      ]
    ),
    item(
      'Select — 404 Unknown Slot',
      req('POST', '/machine/select', jsonBody({ slotId: 999999 })),
      [
        "pm.test('Status code is 404', () => pm.response.to.have.status(404));",
        "pm.test('Error code is SLOT_NOT_FOUND', () => {",
        '  const json = pm.response.json();',
        "  pm.expect(json.code).to.eql('SLOT_NOT_FOUND');",
        '});',
      ]
    ),
    item(
      'Setup: Restock Out-of-Stock Slot',
      req('POST', '/machine/restock', jsonBody({ id: 601, product: 'Sold Out Item', price: 50, stock: 0 })),
      [
        "pm.test('Status code is 200', () => pm.response.to.have.status(200));",
      ]
    ),
    item(
      'Select — 409 Out of Stock',
      req('POST', '/machine/select', jsonBody({ slotId: 601 })),
      [
        "pm.test('Status code is 409', () => pm.response.to.have.status(409));",
        "pm.test('Error code is OUT_OF_STOCK', () => {",
        '  const json = pm.response.json();',
        "  pm.expect(json.code).to.eql('OUT_OF_STOCK');",
        '});',
      ]
    ),
    item(
      'Setup: Restock Astronomically Priced Slot',
      req('POST', '/machine/restock', jsonBody({ id: 602, product: 'Unaffordable Item', price: 999999999, stock: 1 })),
      [
        "pm.test('Status code is 200', () => pm.response.to.have.status(200));",
      ],
      'Цена намеренно огромна, чтобы тест был устойчив к любому остаточному кредиту от предыдущих запросов в этом же прогоне коллекции.'
    ),
    item(
      'Select — 402 Insufficient Credit',
      req('POST', '/machine/select', jsonBody({ slotId: 602 })),
      [
        "pm.test('Status code is 402', () => pm.response.to.have.status(402));",
        "pm.test('Error code is INSUFFICIENT_CREDIT', () => {",
        '  const json = pm.response.json();',
        "  pm.expect(json.code).to.eql('INSUFFICIENT_CREDIT');",
        '});',
      ]
    ),
  ],
};

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

const maintenanceFolder = {
  name: '7. Maintenance',
  description: 'POST /machine/maintain — снижает температуру на 30 (не ниже 0). Недоступен, если автомат уже сломан.',
  item: [
    item(
      '0. Get Temperature Before Maintenance',
      req('GET', '/machine'),
      [
        'const json = pm.response.json();',
        "pm.collectionVariables.set('temperatureBeforeMaintenance', json.temperature);",
      ]
    ),
    item(
      'Maintain — Lower Temperature',
      req('POST', '/machine/maintain'),
      [
        "pm.test('Status code is 200', () => pm.response.to.have.status(200));",
        'const json = pm.response.json();',
        "const before = Number(pm.collectionVariables.get('temperatureBeforeMaintenance'));",
        'const expected = Math.max(0, before - 30);',
        "pm.test('Temperature decreased by 30, clamped at 0', () => {",
        '  pm.expect(json.temperature).to.eql(expected);',
        '});',
        "pm.test('Status recalculated correctly', () => {",
        "  pm.expect(json.status).to.eql(expected > 100 ? 'broken' : expected > 80 ? 'overheated' : 'operational');",
        '});',
      ]
    ),
  ],
};

// ---------------------------------------------------------------------------
// Error Handling (generic)
// ---------------------------------------------------------------------------

const errorHandlingFolder = {
  name: '8. Error Handling (Generic)',
  description: 'Общие сценарии ошибок, не завязанные на бизнес-логику автомата: неизвестный роут и невалидный JSON в теле запроса.',
  item: [
    item(
      'Unknown Route — 404',
      req('GET', '/no-such-route'),
      [
        "pm.test('Status code is 404', () => pm.response.to.have.status(404));",
        "pm.test('Error message is Route not found', () => {",
        '  const json = pm.response.json();',
        "  pm.expect(json.error).to.eql('Route not found');",
        '});',
      ]
    ),
    item(
      'Malformed JSON Body — 400',
      req('POST', '/machine/insert', rawBody('{amount: 100')),
      [
        "pm.test('Status code is 400', () => pm.response.to.have.status(400));",
        "pm.test('Error message mentions invalid JSON', () => {",
        '  const json = pm.response.json();',
        "  pm.expect(json.error).to.include('Invalid JSON');",
        '});',
      ]
    ),
  ],
};

// ---------------------------------------------------------------------------
// Broken Machine (documentation-only note, no fake endpoint)
// ---------------------------------------------------------------------------

const brokenMachineFolder = {
  name: '9. Broken Machine State (Manual / Long-Running)',
  description:
    'По спецификации у автомата нет debug-эндпоинта для принудительной поломки — температура растёт на 3 каждую минуту автоматически, и natуральный путь к статусу "broken" (>100) от начальной температуры 20 занимает около 27 минут непрерывной работы сервера. Чтобы проверить это поведение быстро вручную: временно поменяйте INITIAL_TEMPERATURE в src/models/machine.js на значение > 100 перед запуском сервера, либо дождитесь реального времени. Эта папка оставлена как документация, а не как автоматизированный тест, чтобы не подделывать функциональность, которой нет в самом API.',
  item: [
    item(
      'GET Machine State (check status field manually)',
      req('GET', '/machine'),
      [
        "pm.test('Status code is 200', () => pm.response.to.have.status(200));",
        "pm.test('Status is one of the three valid values', () => {",
        '  const json = pm.response.json();',
        "  pm.expect(json.status).to.be.oneOf(['operational', 'overheated', 'broken']);",
        '});',
      ]
    ),
  ],
};

// ---------------------------------------------------------------------------
// Assemble collection
// ---------------------------------------------------------------------------

const collection = {
  info: {
    name: 'Smart Vending Machine API',
    description:
      'Postman-коллекция для REST API умного торгового автомата (Express.js, in-memory state).\n\n' +
      'Импортируй вместе с environment-файлом "Vending Machine - Local" (переменная {{baseUrl}} по умолчанию указывает на http://localhost:3000).\n\n' +
      'Папки организованы в порядке, в котором имеет смысл их проходить: от простого чтения состояния до полного сценария покупки и всех веток ошибок. Каждый запрос содержит тесты (pm.test), проверяющие и HTTP-статус, и форму/содержимое тела ответа — коллекцию можно гонять как через Postman GUI, так и headless через Newman (см. README проекта, npm run test:api).',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000', type: 'string' },
    { key: 'restockSlotId', value: '1', type: 'string' },
    { key: 'restockPrice', value: '120', type: 'string' },
    { key: 'revenueBeforeFlow', value: '', type: 'string' },
    { key: 'flowPrice', value: '', type: 'string' },
    { key: 'creditAfterInsert', value: '', type: 'string' },
    { key: 'remainingCreditAfterPurchase', value: '', type: 'string' },
    { key: 'temperatureBeforeMaintenance', value: '', type: 'string' },
  ],
  item: [
    infoFolder,
    stateFolder,
    restockFolder,
    insertFolder,
    purchaseFlowFolder,
    purchaseErrorsFolder,
    maintenanceFolder,
    errorHandlingFolder,
    brokenMachineFolder,
  ],
};

const outPath = path.join(__dirname, 'smart-vending-machine-api.postman_collection.json');
fs.writeFileSync(outPath, JSON.stringify(collection, null, 2));
console.log('Written to', outPath);
