'use strict';

const CRITICAL_TEMPERATURE = 100;
const OVERHEAT_TEMPERATURE = 80;
const INITIAL_TEMPERATURE = 20;

const TICK_INTERVAL_MS = 60 * 1000;
const TICK_TEMPERATURE_INCREASE = 3;
const TICK_FRESHNESS_DECREASE = 1;
const MAINTENANCE_TEMPERATURE_DECREASE = 30;

const STATUS = Object.freeze({
  OPERATIONAL: 'operational',
  OVERHEATED: 'overheated',
  BROKEN: 'broken',
});

class VendingMachineError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'VendingMachineError';
    this.status = status;
    this.code = code;
  }
}

class VendingMachine {
  constructor() {
    this.temperature = INITIAL_TEMPERATURE;
    this.credit = 0;
    this.revenue = 0;
    this.slots = [];
    this._tickTimer = null;
  }

  /**
   * Статус не хранится отдельным полем — он всегда вычисляется по
   * текущей температуре. Это исключает рассинхронизацию состояния:
   * достаточно доверять одному числу (temperature).
   */
  getStatus() {
    if (this.temperature > CRITICAL_TEMPERATURE) return STATUS.BROKEN;
    if (this.temperature > OVERHEAT_TEMPERATURE) return STATUS.OVERHEATED;
    return STATUS.OPERATIONAL;
  }

  isBroken() {
    return this.getStatus() === STATUS.BROKEN;
  }

  toJSON() {
    return {
      temperature: this.temperature,
      credit: this.credit,
      revenue: this.revenue,
      status: this.getStatus(),
      slots: this.slots.map((slot) => ({ ...slot })),
    };
  }

  findSlot(id) {
    return this.slots.find((slot) => slot.id === id);
  }

  restock({ id, product, price, stock }) {
    const existingIndex = this.slots.findIndex((slot) => slot.id === id);
    const newSlot = { id, product, price, stock, freshness: 100 };

    if (existingIndex >= 0) {
      this.slots[existingIndex] = newSlot;
    } else {
      this.slots.push(newSlot);
    }

    return { ...newSlot };
  }

  insertCoins(amount) {
    this.credit += amount;
    return this.credit;
  }

  select(slotId) {
    const slot = this.findSlot(slotId);

    if (!slot) {
      throw new VendingMachineError('Slot not found', 404, 'SLOT_NOT_FOUND');
    }
    if (slot.stock <= 0) {
      throw new VendingMachineError('Product is out of stock', 409, 'OUT_OF_STOCK');
    }
    if (slot.freshness <= 0) {
      throw new VendingMachineError('Product has expired', 409, 'PRODUCT_EXPIRED');
    }
    if (this.credit < slot.price) {
      throw new VendingMachineError('Insufficient credit', 402, 'INSUFFICIENT_CREDIT');
    }

    this.credit -= slot.price;
    this.revenue += slot.price;
    slot.stock -= 1;

    return {
      product: slot.product,
      price: slot.price,
      remainingCredit: this.credit,
    };
  }

  maintain() {
    this.temperature = Math.max(0, this.temperature - MAINTENANCE_TEMPERATURE_DECREASE);
    return {
      temperature: this.temperature,
      status: this.getStatus(),
    };
  }

  /**
   * Один "тик" автоматического процесса. Вызывается таймером раз в минуту,
   * но вынесен в отдельный метод, чтобы его можно было дергать напрямую
   * из тестов без ожидания реального времени.
   */
  tick() {
    if (this.isBroken()) {
      this.stopTicking();
      return;
    }

    this.temperature += TICK_TEMPERATURE_INCREASE;
    this.slots.forEach((slot) => {
      slot.freshness = Math.max(0, slot.freshness - TICK_FRESHNESS_DECREASE);
    });

    if (this.temperature > CRITICAL_TEMPERATURE) {
      // Поломка необратима: останавливаем дальнейшие автоматические изменения.
      this.stopTicking();
    }
  }

  startTicking() {
    if (this._tickTimer) return;
    this._tickTimer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    // Не даём таймеру держать процесс живым при завершении работы/тестах.
    if (typeof this._tickTimer.unref === 'function') {
      this._tickTimer.unref();
    }
  }

  stopTicking() {
    if (this._tickTimer) {
      clearInterval(this._tickTimer);
      this._tickTimer = null;
    }
  }
}

// Приложению по условию задачи нужен ровно один автомат — используем singleton.
const machine = new VendingMachine();

module.exports = machine;
module.exports.VendingMachine = VendingMachine;
module.exports.VendingMachineError = VendingMachineError;
module.exports.STATUS = STATUS;
module.exports.CRITICAL_TEMPERATURE = CRITICAL_TEMPERATURE;
module.exports.OVERHEAT_TEMPERATURE = OVERHEAT_TEMPERATURE;
module.exports.INITIAL_TEMPERATURE = INITIAL_TEMPERATURE;
