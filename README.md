# Умный торговый автомат REST API

![Tests](https://github.com/code-nikITa/smart-vending-machine-api/actions/workflows/test.yml/badge.svg)

REST API для управления одним умным торговым автоматом на Express.js. Автомат хранит товары в слотах, принимает монеты, продаёт товары и требует обслуживания, чтобы не перегреться. Хранение данных — in-memory, без базы данных.

## Стек

- Node.js 18+
- Express.js 4
- Хранение состояния — в памяти процесса (singleton-объект автомата)

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

Запуск юнит-тестов бизнес-логики (встроенный `node:test`, без внешних зависимостей):

```bash
npm test
```

Запуск в Docker:

```bash
docker build -t vending-machine .
docker run -p 3000:3000 vending-machine
```

## Архитектура проекта

```
.
├── server.js                # точка входа: поднимает Express и запускает автотик
├── src/
│   ├── app.js                # сборка приложения, middleware, 404 и обработка ошибок
│   ├── models/
│   │   └── machine.js        # состояние автомата и вся бизнес-логика
│   ├── routes/
│   │   └── machine.js        # REST-эндпоинты /machine/*
│   ├── validators/
│   │   └── machine.js        # валидация тел запросов
│   └── middleware/
│       └── logger.js         # логирование метода, URL, статуса и времени ответа
├── test/
│   └── machine.test.js       # юнит-тесты бизнес-логики
├── Dockerfile
├── .dockerignore
└── package.json
```

Ключевое архитектурное решение: **статус автомата (`operational` / `overheated` / `broken`) нигде не хранится отдельным полем** — он всегда вычисляется на лету по текущей температуре (метод `getStatus()` в `src/models/machine.js`). Это гарантирует, что состояние никогда не может рассинхронизироваться: достаточно доверять одному числу.

Автоматический процесс реализован как `setInterval` внутри самого объекта автомата и раз в минуту вызывает метод `tick()`: температура растёт на 3, свежесть каждого товара падает на 1 (не ниже 0). Если после тика температура превысила 100, таймер сам себя останавливает — поломка необратима, и никакие дальнейшие автоматические изменения больше не происходят. Метод `tick()` вынесен отдельно от таймера специально, чтобы его можно было явно вызывать в тестах без ожидания реального времени.

## Статусы автомата

| Температура     | Статус                |
|------------------|------------------------|
| ≤ 80             | `operational`          |
| > 80 и ≤ 100     | `overheated`           |
| > 100            | `broken` (необратимо)  |

В статусе `broken` доступен только `GET /machine`. Любой изменяющий запрос (`restock`, `insert`, `select`, `maintain`) возвращает `409` с кодом `MACHINE_BROKEN`.

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

## Автоматические процессы

- Каждую минуту, если автомат не сломан: `temperature += 3`, у каждого слота `freshness -= 1` (не ниже 0).
- После каждого тика проверяется температура: если она превысила `100`, автомат необратимо переходит в `broken`, и дальнейшие автоматические изменения останавливаются.

## Логирование

Middleware `src/middleware/logger.js` логирует в консоль каждую обработанную HTTP-запись: метод, URL, итоговый статус-код и время выполнения запроса в миллисекундах.
