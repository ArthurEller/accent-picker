jest.mock('uiohook-napi');

const { UiohookKey } = require('uiohook-napi');
const { KeyHookManager } = require('../src/keyHook');

function makeCallbacks() {
  return {
    onShowPicker: jest.fn(),
    onHidePicker: jest.fn(),
    onSelectAccent: jest.fn(),
  };
}

function makeManager(callbacks) {
  return new KeyHookManager(callbacks || makeCallbacks());
}

// Simulate a keydown event
function keydown(manager, keycode) {
  manager._onKeyDown({ keycode });
}

// Simulate a keyup event
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
    keydown(m, 999); // arbitrary unsupported keycode
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
    // Only 'e' picker should fire, not 'a'
    expect(cb.onShowPicker).toHaveBeenCalledTimes(1);
    expect(cb.onShowPicker).toHaveBeenCalledWith('e', expect.arrayContaining(['è', 'é']));
  });

  test('repeat keydown events for the same key do not restart timer', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    keydown(m, UiohookKey.A); // first press
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
// Picker visible — number key selection
// ---------------------------------------------------------------------------

describe('accent selection by number key', () => {
  function showPicker(m) {
    keydown(m, UiohookKey.A);
    jest.advanceTimersByTime(500);
  }

  test('pressing 1 selects index 0', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    showPicker(m);
    keydown(m, UiohookKey['1']);
    expect(cb.onSelectAccent).toHaveBeenCalledWith(0);
    expect(m.isPickerVisible).toBe(false);
  });

  test('pressing 3 selects index 2', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    showPicker(m);
    keydown(m, UiohookKey['3']);
    expect(cb.onSelectAccent).toHaveBeenCalledWith(2);
  });

  test('pressing 9 selects index 8', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    showPicker(m);
    keydown(m, UiohookKey['9']);
    expect(cb.onSelectAccent).toHaveBeenCalledWith(8);
  });
});

// ---------------------------------------------------------------------------
// Picker visible — Escape and other keys dismiss
// ---------------------------------------------------------------------------

describe('picker dismissal', () => {
  function showPicker(m) {
    keydown(m, UiohookKey.A);
    jest.advanceTimersByTime(500);
  }

  test('Escape hides the picker', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    showPicker(m);
    keydown(m, UiohookKey.Escape);
    expect(cb.onHidePicker).toHaveBeenCalledTimes(1);
    expect(m.isPickerVisible).toBe(false);
  });

  test('any unrelated key hides the picker', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    showPicker(m);
    keydown(m, 999); // unknown key
    expect(cb.onHidePicker).toHaveBeenCalledTimes(1);
    expect(m.isPickerVisible).toBe(false);
  });

  test('repeating the same held key while picker is visible is swallowed silently', () => {
    const cb = makeCallbacks();
    const m = makeManager(cb);
    showPicker(m);
    cb.onHidePicker.mockClear();
    keydown(m, UiohookKey.A); // repeat of held key
    expect(cb.onHidePicker).not.toHaveBeenCalled();
    expect(m.isPickerVisible).toBe(true);
  });
});
