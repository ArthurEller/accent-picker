/**
 * Accent Picker - Main Process
 *
 * Background system tray app that provides macOS-style accent character
 * picking on Windows. Uses uiohook-napi for global keyboard hooks and
 * Electron's clipboard API for inserting selected characters.
 */

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  screen,
  clipboard,
  nativeImage,
} = require('electron');
const path = require('path');
const { KeyHookManager } = require('./src/keyHook');
const { uIOhook, UiohookKey } = require('uiohook-napi');

// Enforce single instance - only one copy of the app should run
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

// -- Globals --
let tray = null;
let pickerWindow = null;
let keyHookManager = null;
let isEnabled = true;

// Win32 APIs for focus tracking.
// The picker window steals focus to suppress key repeats; we must restore
// focus to the target app before pasting the accent character.
let winApi = null;
let previousFocusHandle = null;

if (process.platform === 'win32') {
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    winApi = {
      GetForegroundWindow: user32.func('void* GetForegroundWindow()'),
      SetForegroundWindow: user32.func('int SetForegroundWindow(void* hWnd)'),
    };
  } catch (e) {
    console.warn('Win32 focus APIs unavailable — accent insertion may not work:', e.message);
  }
}

// ============================================================
// Tray icon generation (programmatic - no external assets)
// ============================================================

/**
 * Creates a small 16x16 NativeImage for the system tray icon.
 * Draws a simple "A" with an accent mark to represent the app.
 */
function createTrayIcon() {
  // 16x16 RGBA raw pixel buffer: draw a simple accent icon
  // We'll use a data URL approach with a canvas-rendered image via nativeImage
  // Since we can't use canvas in main process easily, we'll create from a
  // tiny inline PNG encoded as base64.
  //
  // This is a 16x16 icon showing "a" with an accent mark.
  // Generated as a minimal valid PNG.
  //
  // Alternatively, we can create it from raw RGBA data.
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4, 0); // RGBA, all transparent

  // Helper to set a pixel
  const setPixel = (x, y, r, g, b, a = 255) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const offset = (y * size + x) * 4;
    buffer[offset] = r;
    buffer[offset + 1] = g;
    buffer[offset + 2] = b;
    buffer[offset + 3] = a;
  };

  // Draw an accent mark (acute) at top center
  const white = [255, 255, 255];
  setPixel(9, 1, ...white);
  setPixel(8, 2, ...white);
  setPixel(7, 3, ...white);

  // Draw a simple lowercase 'a' shape (5x7 in the lower part)
  // Top arc of 'a'
  const aPixels = [
    // Row 5: top of 'a' bowl
    [6, 5], [7, 5], [8, 5], [9, 5],
    // Row 6
    [5, 6], [10, 6],
    // Row 7: close top, start stem
    [6, 7], [7, 7], [8, 7], [9, 7], [10, 7],
    // Row 8: only right stem
    [10, 8],
    // Row 9: bottom bowl
    [5, 9], [10, 9],
    // Row 10
    [5, 10], [10, 10],
    // Row 11: bottom close + tail
    [6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [11, 11],
    // Right stem continuous
    [10, 5], [10, 6], [10, 7], [10, 8], [10, 9], [10, 10],
  ];

  for (const [x, y] of aPixels) {
    setPixel(x, y, ...white);
  }

  return nativeImage.createFromBuffer(buffer, {
    width: size,
    height: size,
  });
}

// ============================================================
// Picker window
// ============================================================

function createPickerWindow() {
  pickerWindow = new BrowserWindow({
    width: 400,
    height: 80,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  pickerWindow.loadFile(path.join(__dirname, 'renderer', 'picker.html'));

  // Prevent the window from being closed; just hide it
  pickerWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      pickerWindow.hide();
    }
  });

  // If the user clicks somewhere else, just hide the picker.
  // Do NOT restore focus here — the user intentionally moved to another window.
  pickerWindow.on('blur', () => {
    if (pickerWindow.isVisible()) {
      pickerWindow.webContents.send('hide-picker');
      pickerWindow.hide();
      previousFocusHandle = null;
      keyHookManager.pickerDismissed();
    }
  });
}

// ============================================================
// Show / Hide picker
// ============================================================

function showPicker(baseChar, accents) {
  if (!pickerWindow) return;

  // Calculate the required width based on number of accents
  const boxWidth = 44; // Each accent box width + gap
  const padding = 24; // Left + right padding
  const totalWidth = Math.max(accents.length * boxWidth + padding, 120);
  const totalHeight = 76;

  // Position the picker near the cursor
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const displayBounds = display.workArea;

  // Center horizontally on cursor, place above cursor by default
  let x = Math.round(cursorPoint.x - totalWidth / 2);
  let y = cursorPoint.y - totalHeight - 10; // 10px gap above cursor

  // If too close to top, place below cursor instead
  if (y < displayBounds.y) {
    y = cursorPoint.y + 20; // Below cursor
  }

  // Clamp to screen bounds horizontally
  if (x < displayBounds.x) {
    x = displayBounds.x;
  } else if (x + totalWidth > displayBounds.x + displayBounds.width) {
    x = displayBounds.x + displayBounds.width - totalWidth;
  }

  pickerWindow.setBounds({
    x,
    y,
    width: totalWidth,
    height: totalHeight,
  });

  // Save which window has focus BEFORE we steal it.
  if (winApi) {
    previousFocusHandle = winApi.GetForegroundWindow();
  }

  pickerWindow.webContents.send('show-picker', { baseChar, accents });
  pickerWindow.show(); // Steals focus → key repeats stop going to target app
}

function hidePicker() {
  if (!pickerWindow) return;
  pickerWindow.webContents.send('hide-picker');

  // Restore focus to the target app while we still have SetForegroundWindow
  // rights (i.e. before our window is hidden and we lose those rights).
  const hwnd = previousFocusHandle;
  previousFocusHandle = null;
  if (winApi && hwnd) {
    winApi.SetForegroundWindow(hwnd);
  }

  pickerWindow.hide();
  keyHookManager.pickerDismissed();
}

// ============================================================
// Character insertion via clipboard + simulated Ctrl+V
// ============================================================

/**
 * Inserts an accent character into the previously focused application:
 * 1. Restores focus to the target app (while we still have SetForegroundWindow rights)
 * 2. Hides the picker
 * 3. Sends Backspace to remove the character typed during the hold
 * 4. Pastes the accent via clipboard + Ctrl+V
 * 5. Restores the original clipboard content
 */
function insertCharacter(char) {
  pickerWindow.webContents.send('hide-picker');

  const previousClipboard = clipboard.readText();
  clipboard.writeText(char);

  // Restore focus BEFORE hiding — we still have SetForegroundWindow rights here.
  const hwnd = previousFocusHandle;
  previousFocusHandle = null;
  if (winApi && hwnd) {
    winApi.SetForegroundWindow(hwnd);
  }

  pickerWindow.hide();

  // Allow focus transfer to complete, then backspace the held character and paste.
  setTimeout(() => {
    try {
      uIOhook.keyTap(UiohookKey.Backspace); // remove the initially typed char
      setTimeout(() => {
        uIOhook.keyToggle(UiohookKey.Ctrl, 'down');
        uIOhook.keyTap(UiohookKey.V);
        uIOhook.keyToggle(UiohookKey.Ctrl, 'up');
        setTimeout(() => clipboard.writeText(previousClipboard), 150);
      }, 30);
    } catch (err) {
      console.error('Failed to insert character:', err);
    }
  }, 80);
}

// ============================================================
// System tray
// ============================================================

function createTray() {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Accent Picker');

  updateTrayMenu();

  // Left-click could also show a menu on Windows
  tray.on('click', () => {
    tray.popUpContextMenu();
  });
}

function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isEnabled ? 'Disable' : 'Enable',
      click: () => {
        isEnabled = !isEnabled;
        keyHookManager.setEnabled(isEnabled);
        updateTrayMenu();
        tray.setToolTip(
          isEnabled ? 'Accent Picker (Active)' : 'Accent Picker (Disabled)'
        );
      },
    },
    {
      label: 'Settings',
      enabled: false, // Placeholder for future settings window
      click: () => {
        // Future: open settings window
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        keyHookManager.stop();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// ============================================================
// IPC handlers
// ============================================================

function setupIPC() {
  // Renderer signals that user clicked an accent option
  ipcMain.on('accent-selected', (_event, char) => {
    keyHookManager.pickerDismissed();
    insertCharacter(char);
  });

  // Renderer signals picker should be dismissed (Escape pressed, clicked outside)
  ipcMain.on('dismiss-picker', () => {
    hidePicker();
  });
}

// ============================================================
// App lifecycle
// ============================================================

app.on('ready', () => {
  // Hide dock icon on macOS (no-op on Windows, but harmless)
  if (app.dock) {
    app.dock.hide();
  }

  // Set app user model ID for Windows taskbar grouping
  app.setAppUserModelId('com.accentpicker.app');

  createPickerWindow();
  createTray();
  setupIPC();

  // Initialize the global keyboard hook
  keyHookManager = new KeyHookManager({
    onShowPicker: (char, accents) => {
      showPicker(char, accents);
    },
    onHidePicker: () => {
      hidePicker();
    },
  });

  keyHookManager.start();

  console.log('Accent Picker is running in the system tray.');
});

app.on('window-all-closed', (event) => {
  // Do not quit when all windows are closed - we live in the tray
  event.preventDefault();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (keyHookManager) {
    keyHookManager.stop();
  }
});

// Handle second instance launch: just show a notification or ignore
app.on('second-instance', () => {
  // App is already running, do nothing
});
