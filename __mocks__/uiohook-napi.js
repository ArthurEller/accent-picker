/**
 * Manual Jest mock for uiohook-napi.
 * Provides the same shape as the real module so KeyHookManager
 * can be tested without a native keyboard hook.
 */

const UiohookKey = {
  A: 30,
  E: 18,
  I: 23,
  O: 24,
  U: 22,
  C: 46,
  N: 49,
  S: 31,
  Y: 21,
  Z: 44,
  Shift: 42,
  ShiftRight: 54,
  Escape: 1,
  Ctrl: 29,
  V: 47,
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 6,
  6: 7,
  7: 8,
  8: 9,
  9: 10,
};

const uIOhook = {
  on: jest.fn(),
  off: jest.fn(),
  removeAllListeners: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  keyToggle: jest.fn(),
  keyTap: jest.fn(),
};

module.exports = { uIOhook, UiohookKey };
