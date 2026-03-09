/**
 * Accento - Main Process
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
 * Creates a 16x16 NativeImage for the system tray icon.
 * Renders a clean "á" (a with acute accent) letterform in white on transparent.
 */
function createTrayIcon() {
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4, 0); // RGBA, all transparent

  const setPixel = (x, y, r, g, b, a = 255) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const offset = (y * size + x) * 4;
    buffer[offset] = r;
    buffer[offset + 1] = g;
    buffer[offset + 2] = b;
    buffer[offset + 3] = a;
  };

  const w = [255, 255, 255]; // white

  // Acute accent mark (´) — two pixels rising right-to-left
  setPixel(8, 0, ...w);
  setPixel(7, 1, ...w);

  // Lowercase 'a' body (rows 3-13), centred at x=4..9
  //   row 3-4 : top arc        ··####·
  //   row 5   : open top       #····#
  //   row 6-8 : mid bar + stem ######  (right stem only on 8)
  //   row 9-11: bottom bowl    #····#
  //   row 12  : bottom close   ·#####
  const aPixels = [
    // top arc
    [5,3],[6,3],[7,3],[8,3],
    [4,4],[9,4],
    // open interior
    [4,5],[9,5],
    // mid bar — 'a' style: fills across then continues right stem
    [4,6],[5,6],[6,6],[7,6],[8,6],[9,6],
    // right stem only
    [9,7],
    // bottom bowl
    [4,8],[9,8],
    [4,9],[9,9],
    // bottom close + serif tail
    [5,10],[6,10],[7,10],[8,10],[9,10],[10,10],
  ];

  for (const [x, y] of aPixels) {
    setPixel(x, y, ...w);
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
  tray.setToolTip('Accento');

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
          isEnabled ? 'Accento (Active)' : 'Accento (Disabled)'
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
  app.setAppUserModelId('com.accento.app');

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

  console.log('Accento is running in the system tray.');
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
