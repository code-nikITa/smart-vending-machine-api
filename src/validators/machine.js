'use strict';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function validateRestockPayload(body) {
  if (!isPlainObject(body)) {
    return [{ field: 'body', message: 'Request body must be a JSON object' }];
  }

  const { id, product, price, stock } = body;
  const errors = [];

  if (!isFiniteNumber(id) || !Number.isInteger(id)) {
    errors.push({ field: 'id', message: 'id must be an integer' });
  }
  if (!isNonEmptyString(product)) {
    errors.push({ field: 'product', message: 'product must be a non-empty string' });
  }
  if (!isFiniteNumber(price) || price < 0) {
    errors.push({ field: 'price', message: 'price must be a non-negative number' });
  }
  if (!isNonNegativeInteger(stock)) {
    errors.push({ field: 'stock', message: 'stock must be a non-negative integer' });
  }

  return errors;
}

function validateInsertPayload(body) {
  if (!isPlainObject(body)) {
    return [{ field: 'body', message: 'Request body must be a JSON object' }];
  }

  const { amount } = body;
  const errors = [];

  if (!isFiniteNumber(amount) || amount <= 0) {
    errors.push({ field: 'amount', message: 'amount must be a positive number' });
  }

  return errors;
}

function validateSelectPayload(body) {
  if (!isPlainObject(body)) {
    return [{ field: 'body', message: 'Request body must be a JSON object' }];
  }

  const { slotId } = body;
  const errors = [];

  if (!isFiniteNumber(slotId) || !Number.isInteger(slotId)) {
    errors.push({ field: 'slotId', message: 'slotId must be an integer' });
  }

  return errors;
}

module.exports = {
  validateRestockPayload,
  validateInsertPayload,
  validateSelectPayload,
};
