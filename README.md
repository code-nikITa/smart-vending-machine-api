# Умный торговый автомат REST API

![Tests](https://github.com/code-nikITa/smart-vending-machine-api/actions/workflows/test.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)

REST API для управления одним умным торговым автоматом на Express.js. Автомат хранит товары в слотах, принимает монеты, продаёт товары и требует обслуживания, чтобы не перегреться. Хранение данных — in-memory, без базы данных.

## Стек

- Node.js 18+
- Express.js 4
- Хранение состояния — в памяти процесса (singleton-объект автомата)
- Тестирование: встроенный `node:test` (юнит- и интеграционные тесты), [supertest](https://github.com/ladjs/supertest) для HTTP-слоя, [Postman/Newman](https://www.postman.com/) для end-to-end проверки через реальный API-клиент
- CI: GitHub Actions

## Установка и запуск

```bash
git clone https://github.com/code-nikITa/smart-vending-machine-api
cd smart-vending-machine-api
npm install
npm start
```

Сервер по умолчанию поднимается на порту `3000`. Порт можно переопределить переменной окружения `PORT`:

```bash
PORT=4000 npm start
```

Режим разработки с автоперезапуском при изменении файлов:

```bash
npm run dev
```

Запуск в Docker:

```bash
docker build -t vending-machine .
docker run -p 3000:3000 vending-machine
```

## Тестирование

Проект покрыт тремя независимыми слоями тестов — от бизнес-логики до реального HTTP-клиента.

### 1. Юнит- и интеграционные тесты (`node:test`)

```bash
npm test
```

29 тестов без внешних зависимостей для запуска:
- **юнит-тесты бизнес-логики** (`test/machine.test.js`) — напрямую тестируют класс `VendingMachine`: границы статусов, необратимость поломки, все ветки ошибок при покупке;
- **интеграционные тесты HTTP-слоя** (`test/machine.routes.test.js`, через [supertest](https://github.com/ladjs/supertest)) — реальные запросы к приложению через Express, проверка кодов ответа и структуры JSON для каждого эндпоинта, включая переход автомата в `broken` и обработку невалидного JSON в теле запроса.

### 2. Postman-коллекция (Newman)

Полноценная коллекция из 24 запросов и 46 проверок лежит в [`postman/`](./postman) — все эндпоинты, все документированные ошибки (400/402/404/409) и цепочка полного сценария покупки. Подробности и инструкция по импорту — в [`postman/README.md`](./postman/README.md).

Запуск через CLI (сервер должен быть уже поднят):
```bash
npm start          # в одном терминале
npm run test:api   # в другом
```

Или полностью автоматически — сервер сам стартует, дожидается готовности, гоняет коллекцию и сам себя останавливает:
```bash
npm run test:api:ci
```

### CI

Оба слоя тестов гоняются в GitHub Actions на каждый push и pull request в `main` (см. [`.github/workflows/test.yml`](./.github/workflows/test.yml)):
- `test` — `npm test` на Node.js 18.x и 20.x;
- `api-tests` — Postman-коллекция через Newman против реально поднятого сервера.

## Архитектура проекта

```
.
├── server.js                     # точка входа: поднимает Express и запускает автотик
├── src/
│   ├── app.js                     # сборка приложения, middleware, 404 и обработка ошибок
│   ├── models/
│   │   └── machine.js             # состояние автомата и вся бизнес-логика
│   ├── routes/
│   │   └── machine.js             # REST-эндпоинты /machine/*
│   ├── validators/
│   │   └── machine.js             # валидация тел запросов
│   └── middleware/
│       └── logger.js              # логирование метода, URL, статуса и времени ответа
├── test/
│   ├── machine.test.js            # юнит-тесты бизнес-логики
│   └── machine.routes.test.js     # интеграционные тесты HTTP-слоя (supertest)
├── postman/
│   ├── smart-vending-machine-api.postman_collection.json
│   ├── smart-vending-machine-api.postman_environment.json
│   ├── generate-collection.js     # скрипт, которым генерируется коллекция
│   └── README.md                  # инструкция по коллекции
├── .github/
│   └── workflows/
│       └── test.yml                # CI: node:test + Postman/Newman
├── Dockerfile
├── .dockerignore
├── .gitattributes                  # единообразные переносы строк (LF) вне зависимости от ОС
├── LICENSE                         # MIT
└── package.json
```

Ключевое архитектурное решение: **статус автомата (`operational` / `overheated` / `broken`) нигде не хранится отдельным полем** — он всегда вычисляется на лету по текущей температуре (метод `getStatus()` в `src/models/machine.js`). Это гарантирует, что состояние никогда не может рассинхронизироваться: достаточно доверять одному числу.

Автоматический процесс реализован как `setInterval` внутри самого объекта автомата и раз в минуту вызывает метод `tick()`: температура растёт на 3, свежесть каждого товара падает на 1 (не ниже 0). Если после тика температура превысила 100, таймер сам себя останавливает — поломка необратима, и никакие дальнейшие автоматические изменения больше не происходят. Метод `tick()` вынесен отдельно от таймера специально, чтобы его можно было явно вызывать в тестах без ожидания реального времени.

Автомат — singleton (по условию задания приложение управляет ровно одним автоматом), поэтому для тестов у него есть метод `reset()`, возвращающий состояние к начальному — это не часть публичного API, а внутренний инструмент, вызываемый только в тестах между прогонами.

## Статусы автомата

| Температура     | Статус                |
|------------------|------------------------|
| ≤ 80             | `operational`          |
| > 80 и ≤ 100     | `overheated`           |
| > 100            | `broken` (необратимо)  |

В статусе `broken` доступен только `GET /machine`. Любой изменяющий запрос (`restock`, `insert`, `select`, `maintain`) возвращает `409` с кодом `MACHINE_BROKEN`.

У API намеренно нет debug-эндпоинта для принудительной поломки — это не предусмотрено спецификацией. Реальный переход в `broken` от начальной температуры 20 занимает около 27 минут непрерывной работы сервера (температура растёт на 3 каждую минуту).

## Эндпоинты API

### `GET /machine`

Возвращает текущее состояние автомата.

**Ответ `200`:**
```json
{
  "temperature": 23,
  "credit": 0,
  "revenue": 0,
  "status": "operational",
  "slots": [
    { "id": 1, "product": "Cola", "price": 120, "stock": 10, "freshness": 99 }
  ]
}
```

### `POST /machine/restock`

Создаёт новый слот или полностью заменяет существующий по `id`. При любом restock `freshness` сбрасывается в `100`.

**Тело запроса:**
```json
{ "id": 1, "product": "Cola", "price": 120, "stock": 10 }
```

**Ответ `200`:**
```json
{
  "message": "Slot updated",
  "slot": { "id": 1, "product": "Cola", "price": 120, "stock": 10, "freshness": 100 }
}
```

**Ошибки:** `400` — некорректные/отсутствующие поля; `409 MACHINE_BROKEN` — автомат сломан.

### `POST /machine/insert`

Вносит монеты, увеличивая `credit`.

**Тело запроса:**
```json
{ "amount": 100 }
```

**Ответ `200`:**
```json
{ "message": "Coins inserted", "credit": 100 }
```

**Ошибки:** `400` — `amount` отсутствует, не число или ≤ 0; `409 MACHINE_BROKEN` — автомат сломан.

### `POST /machine/select`

Покупка товара из слота.

**Тело запроса:**
```json
{ "slotId": 1 }
```

**Ответ `200`:**
```json
{
  "message": "Purchase successful",
  "product": "Cola",
  "price": 120,
  "remainingCredit": 0
}
```

**Ошибки:**

| Код HTTP | code                 | Причина                          |
|----------|----------------------|-----------------------------------|
| 400      | —                    | `slotId` отсутствует или не число |
| 404      | `SLOT_NOT_FOUND`     | слот с таким id не найден         |
| 409      | `OUT_OF_STOCK`       | товар закончился                  |
| 409      | `PRODUCT_EXPIRED`    | товар испорчен (`freshness = 0`)  |
| 402      | `INSUFFICIENT_CREDIT`| недостаточно внесённых средств    |
| 409      | `MACHINE_BROKEN`     | автомат сломан                    |

### `POST /machine/maintain`

Техническое обслуживание: снижает температуру на 30 (не ниже 0). Доступно только в статусах `operational` и `overheated`.

**Ответ `200`:**
```json
{ "message": "Maintenance completed", "temperature": 0, "status": "operational" }
```

**Ошибки:** `409 MACHINE_BROKEN` — автомат уже сломан.

## Формат ошибок

Единый формат для доменных ошибок:

```json
{ "error": "Понятное сообщение", "code": "MACHINE_ERROR_CODE" }
```

Ошибки валидации дополнительно содержат список проблемных полей:

```json
{
  "error": "Invalid restock payload",
  "details": [
    { "field": "price", "message": "price must be a non-negative number" }
  ]
}
```

## Примеры запросов (curl)

```bash
# Пополнить слот
curl -X POST http://localhost:3000/machine/restock \
  -H "Content-Type: application/json" \
  -d '{"id": 1, "product": "Cola", "price": 120, "stock": 10}'

# Внести монеты
curl -X POST http://localhost:3000/machine/insert \
  -H "Content-Type: application/json" \
  -d '{"amount": 150}'

# Купить товар
curl -X POST http://localhost:3000/machine/select \
  -H "Content-Type: application/json" \
  -d '{"slotId": 1}'

# Провести обслуживание
curl -X POST http://localhost:3000/machine/maintain

# Посмотреть текущее состояние
curl http://localhost:3000/machine
```

Готовая Postman-коллекция с теми же (и не только) сценариями — в [`postman/`](./postman).

## Автоматические процессы

- Каждую минуту, если автомат не сломан: `temperature += 3`, у каждого слота `freshness -= 1` (не ниже 0).
- После каждого тика проверяется температура: если она превысила `100`, автомат необратимо переходит в `broken`, и дальнейшие автоматические изменения останавливаются.

## Логирование

Middleware `src/middleware/logger.js` логирует в консоль каждую обработанную HTTP-запись: метод, URL, итоговый статус-код и время выполнения запроса в миллисекундах.

## Лицензия

[MIT](./LICENSE)
