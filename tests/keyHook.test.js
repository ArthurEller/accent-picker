jest.mock('uiohook-napi');

const { UiohookKey } = require('uiohook-napi');
const { KeyHookManager } = require('../src/keyHook');

function makeCallbacks() {
  return {
    onShowPicker: jest.fn(),
    onHidePicker: jest.fn(),
  };
}

function makeManager(callbacks) {
  return new KeyHookManager(callbacks || makeCallbacks());
}

function keydown(manager, keycode) {
  manager._onKeyDown({ keycode });
}

function keyup(manager, keycode) {
  manager._onKeyUp({ keycode });
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  test('starts enabled with picker hidden', () => {
    const m = makeManager();
    expect(m.enabled).toBe(true);
    expect(m.isPickerVisible).toBe(false);
    expect(m.holdTimer).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setEnabled()
// ---------------------------------------------------------------------------

describe('setEnabled()', () => {
  test('disabling while idle does nothing to callbacks', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    m.setEnabled(false);
    expect(cb.onHidePicker).not.toHaveBeenCalled();
  });

  test('disabling while picker is visible hides it', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    m.isPickerVisible = true;
    m.setEnabled(false);
    expect(cb.onHidePicker).toHaveBeenCalledTimes(1);
    expect(m.isPickerVisible).toBe(false);
  });

  test('disabling cancels an active hold timer', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    keydown(m, UiohookKey.A);
    expect(m.holdTimer).not.toBeNull();
    m.setEnabled(false);
    expect(m.holdTimer).toBeNull();
    jest.advanceTimersByTime(600);
    expect(cb.onShowPicker).not.toHaveBeenCalled();
  });

  test('disabled manager ignores keydown events', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    m.setEnabled(false);
    keydown(m, UiohookKey.A);
    jest.advanceTimersByTime(600);
    expect(cb.onShowPicker).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// pickerDismissed()
// ---------------------------------------------------------------------------

describe('pickerDismissed()', () => {
  test('resets picker state and cancels timer', () => {
    const m = makeManager();
    keydown(m, UiohookKey.A);
    m.isPickerVisible = true;
    m.pickerDismissed();
    expect(m.isPickerVisible).toBe(false);
    expect(m.heldKeyCode).toBeNull();
    expect(m.holdTimer).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Hold timer — show picker
// ---------------------------------------------------------------------------

describe('hold timer', () => {
  test('starts a timer when a supported key is pressed', () => {
    const m = makeManager();
    keydown(m, UiohookKey.A);
    expect(m.holdTimer).not.toBeNull();
  });

  test('does not start a timer for unsupported keys', () => {
    const m = makeManager();
    keydown(m, 999);
    expect(m.holdTimer).toBeNull();
  });

  test('shows picker with correct char and accents after 500ms', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    keydown(m, UiohookKey.A);
    jest.advanceTimersByTime(500);
    expect(cb.onShowPicker).toHaveBeenCalledWith('a', expect.arrayContaining(['à', 'á']));
    expect(m.isPickerVisible).toBe(true);
  });

  test('cancels timer when key is released before 500ms', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    keydown(m, UiohookKey.A);
    jest.advanceTimersByTime(200);
    keyup(m, UiohookKey.A);
    jest.advanceTimersByTime(400);
    expect(cb.onShowPicker).not.toHaveBeenCalled();
  });

  test('cancels previous timer when a different key is pressed quickly', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    keydown(m, UiohookKey.A);
    jest.advanceTimersByTime(200);
    keydown(m, UiohookKey.E);
    jest.advanceTimersByTime(500);
    expect(cb.onShowPicker).toHaveBeenCalledTimes(1);
    expect(cb.onShowPicker).toHaveBeenCalledWith('e', expect.arrayContaining(['è', 'é']));
  });

  test('OS repeat keydown events for the same key do not restart timer', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    keydown(m, UiohookKey.A);
    keydown(m, UiohookKey.A); // OS repeat
    keydown(m, UiohookKey.A); // OS repeat
    jest.advanceTimersByTime(600);
    expect(cb.onShowPicker).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Shift — uppercase accent variants
// ---------------------------------------------------------------------------

describe('shift key handling', () => {
  test('shows uppercase accents when Shift is held', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    keydown(m, UiohookKey.Shift);
    keydown(m, UiohookKey.A);
    jest.advanceTimersByTime(500);
    expect(cb.onShowPicker).toHaveBeenCalledWith('A', expect.arrayContaining(['À', 'Á']));
  });

  test('shows lowercase accents after Shift is released', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    keydown(m, UiohookKey.Shift);
    keyup(m, UiohookKey.Shift);
    keydown(m, UiohookKey.A);
    jest.advanceTimersByTime(500);
    expect(cb.onShowPicker).toHaveBeenCalledWith('a', expect.arrayContaining(['à', 'á']));
  });

  test('right Shift is also tracked', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    keydown(m, UiohookKey.ShiftRight);
    expect(m.isShiftPressed).toBe(true);
    keyup(m, UiohookKey.ShiftRight);
    expect(m.isShiftPressed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bug fix: key repeat suppression
//
// Previously, keyHook tried to block repeats by handling keys while the picker
// was visible — but uiohook-napi cannot suppress OS key events (its handler
// return value is unused by the native lib). Key repeats kept reaching the
// target app.
//
// Fix: the picker window now takes focus (focusable: true, show() not showInactive()).
// The OS naturally stops sending key repeats to the target app. All picker
// interaction (number selection, Escape) is handled via DOM events in the
// renderer. keyHook simply ignores ALL events while the picker is visible.
// ---------------------------------------------------------------------------

describe('key repeat suppression — picker visible', () => {
  function showPicker(m) {
    keydown(m, UiohookKey.A);
    jest.advanceTimersByTime(500);
  }

  test('number keys are ignored by keyHook (renderer handles them via DOM events)', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    showPicker(m);
    cb.onShowPicker.mockClear();
    keydown(m, UiohookKey['1']);
    keydown(m, UiohookKey['5']);
    keydown(m, UiohookKey['9']);
    // keyHook does not call any callbacks — renderer owns this interaction
    expect(cb.onHidePicker).not.toHaveBeenCalled();
    expect(m.isPickerVisible).toBe(true);
  });

  test('Escape is ignored by keyHook (renderer handles it via DOM events)', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    showPicker(m);
    keydown(m, UiohookKey.Escape);
    expect(cb.onHidePicker).not.toHaveBeenCalled();
    expect(m.isPickerVisible).toBe(true);
  });

  test('unrelated keys are ignored by keyHook while picker is visible', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    showPicker(m);
    keydown(m, 999);
    keydown(m, 888);
    expect(cb.onHidePicker).not.toHaveBeenCalled();
    expect(m.isPickerVisible).toBe(true);
  });

  test('repeated presses of the held key are ignored and do not retrigger picker', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    showPicker(m);
    cb.onShowPicker.mockClear();
    // Simulate OS key-repeat events for 'a' — these must be swallowed
    keydown(m, UiohookKey.A);
    keydown(m, UiohookKey.A);
    keydown(m, UiohookKey.A);
    expect(cb.onShowPicker).not.toHaveBeenCalled();
    expect(cb.onHidePicker).not.toHaveBeenCalled();
    expect(m.isPickerVisible).toBe(true);
  });
});
