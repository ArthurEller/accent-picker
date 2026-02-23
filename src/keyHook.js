/**
 * Global keyboard hook module using uiohook-napi.
 *
 * Listens for key hold events system-wide and triggers the accent picker
 * when a supported key is held for ~400ms.
 *
 * NOTE: On Windows, uiohook-napi may require the app to run with elevated
 * privileges (Run as Administrator) for global hooks to work in all contexts
 * (e.g., over UAC prompts or elevated windows).
 */

const { uIOhook, UiohookKey } = require("uiohook-napi");
const { hasAccents, getAccents } = require("./accents");

// uiohook keycodes to character mapping.
// These map the raw hardware scancodes that uiohook reports back to the
// logical characters they represent on a standard US/international layout.
const KEYCODE_TO_CHAR = {
  [UiohookKey.A]: "a",
  [UiohookKey.E]: "e",
  [UiohookKey.I]: "i",
  [UiohookKey.O]: "o",
  [UiohookKey.U]: "u",
  [UiohookKey.C]: "c",
  [UiohookKey.N]: "n",
  [UiohookKey.S]: "s",
  [UiohookKey.Y]: "y",
  [UiohookKey.Z]: "z",
};

class KeyHookManager {
  /**
   * @param {object} callbacks
   * @param {(char: string, accents: string[]) => void} callbacks.onShowPicker
   * @param {() => void} callbacks.onHidePicker
   */
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.enabled = true;

    // State tracking
    this.holdTimer = null;
    this.heldKeyCode = null;
    this.isPickerVisible = false;
    this.isShiftPressed = false;

    // Bind methods so they can be passed as event handlers
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
  }

  /**
   * Start listening for global keyboard events.
   */
  start() {
    uIOhook.on("keydown", this._onKeyDown);
    uIOhook.on("keyup", this._onKeyUp);
    uIOhook.start();
  }

  /**
   * Stop listening and clean up.
   */
  stop() {
    this._cancelHoldTimer();
    uIOhook.stop();
    uIOhook.removeAllListeners();
  }

  /**
   * Enable or disable the hook (toggle from tray menu).
   * @param {boolean} value
   */
  setEnabled(value) {
    this.enabled = value;
    if (!value) {
      this._cancelHoldTimer();
      if (this.isPickerVisible) {
        this.isPickerVisible = false;
        this.callbacks.onHidePicker();
      }
    }
  }

  /**
   * Called externally when the picker is dismissed (e.g., user clicked away).
   */
  pickerDismissed() {
    this.isPickerVisible = false;
    this.heldKeyCode = null;
    this._cancelHoldTimer();
  }

  // -- Private methods --

  _onKeyDown(event) {
    if (!this.enabled) return;

    const keycode = event.keycode;

    // Track shift state
    if (keycode === UiohookKey.Shift || keycode === UiohookKey.ShiftRight) {
      this.isShiftPressed = true;
      return;
    }

    // While picker is visible, the picker window has focus so the OS naturally
    // stops delivering key repeats to the target app. All key handling
    // (number selection, Escape) is done via DOM keydown events in the renderer.
    if (this.isPickerVisible) {
      return;
    }

    // Check if this is a supported character key
    if (keycode in KEYCODE_TO_CHAR) {
      // Only start the timer on the first keydown (not repeats).
      // If heldKeyCode is already set to this key, this is a repeat event.
      if (this.heldKeyCode === keycode) {
        return; // Repeat event, ignore
      }

      // Cancel any previous timer (e.g., if user switches keys rapidly)
      this._cancelHoldTimer();
      this.heldKeyCode = keycode;

      this.holdTimer = setTimeout(() => {
        this.holdTimer = null;

        let char = KEYCODE_TO_CHAR[keycode];
        if (this.isShiftPressed) {
          char = char.toUpperCase();
        }

        if (hasAccents(char)) {
          const accents = getAccents(char);
          this.isPickerVisible = true;
          this.callbacks.onShowPicker(char, accents);
        }
      }, 400);
    }
  }

  _onKeyUp(event) {
    const keycode = event.keycode;

    // Track shift state
    if (keycode === UiohookKey.Shift || keycode === UiohookKey.ShiftRight) {
      this.isShiftPressed = false;
      return;
    }

    // If the held key is released before timer fires, cancel
    if (keycode === this.heldKeyCode && !this.isPickerVisible) {
      this._cancelHoldTimer();
      this.heldKeyCode = null;
    }
  }

  _cancelHoldTimer() {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }
}

module.exports = { KeyHookManager };
