# Accent Picker

A Windows background app that replicates macOS's accent character picker. Hold down a key for 400ms and a popup appears letting you select an accented variant — press a number or click to insert it.


---

## How it works

1. Hold any supported key for **~400ms**
2. A popup appears near your cursor with accent options numbered 1–9
3. Press the corresponding number **or** click an option to insert it
4. Press **Escape** or any other key to dismiss without changing anything

The app lives in the **system tray** — no taskbar entry, no window on startup.

---

## Supported characters

| Key | Variants      |
| --- | ------------- |
| `a` | à á â ã ä å æ |
| `e` | è é ê ë       |
| `i` | ì í î ï       |
| `o` | ò ó ô õ ö ø   |
| `u` | ù ú û ü       |
| `c` | ç             |
| `n` | ñ             |
| `s` | ß š           |
| `y` | ý ÿ           |
| `z` | ž             |

Hold **Shift** while holding the key to get the uppercase variant (e.g., `Shift + A` → À Á Â …).

---

## Requirements

- **Windows 10/11** (x64)
- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- **npm** (comes with Node.js)
- Run commands as **Administrator** (required for the global keyboard hook)

---

## Run in development

Open a terminal **as Administrator** inside the project folder:

```powershell
npm install
npm start
```

The app starts silently in the system tray (look for the icon near the clock).

---

## Build a .exe

Run these commands on a **Windows machine**, as Administrator:

```powershell
npm install
npm run build:win
```

When it finishes, open the `dist/` folder. You'll find two files:

| File                            | Description                                                       |
| ------------------------------- | ----------------------------------------------------------------- |
| `Accent Picker Setup 1.0.0.exe` | Installer — adds the app to the Start Menu and can run on startup |
| `Accent Picker 1.0.0.exe`       | Portable — run directly, no installation needed                   |

> **Why must the build run on Windows?**
> The app uses `uiohook-napi`, a native C++ module that hooks into the Windows keyboard API. It must be compiled on Windows and cannot be cross-compiled from macOS or Linux.

---

## System tray menu

Right-click the tray icon to access:

- **Disable / Enable** — pause or resume accent detection
- **Quit** — exit the app completely

---

## Run tests

Tests use Jest and mock the native keyboard hook, so they run on any platform:

```bash
npm test
```

```
Tests: 31 passed, 31 total
```

---

## Project structure

```
accent-picker/
├── main.js              # Electron main process (tray, windows, IPC)
├── preload.js           # Secure context bridge between main and renderer
├── src/
│   ├── accents.js       # Accent map and lookup functions
│   └── keyHook.js       # Global keyboard hook (uiohook-napi)
├── renderer/
│   ├── picker.html      # Popup UI shell
│   ├── picker.css       # macOS-style dark popup styles
│   └── picker.js        # Renderer logic (render options, handle clicks)
├── tests/
│   ├── accents.test.js  # Unit tests for accent map
│   └── keyHook.test.js  # Unit tests for keyboard hook logic
└── __mocks__/
    └── uiohook-napi.js  # Jest mock for the native module
```

---

## Troubleshooting

**The picker never appears**

- Make sure you're running as Administrator. The global keyboard hook requires elevated privileges on Windows.

**The accent character isn't inserted**

- The app uses clipboard paste (Ctrl+V simulation). Make sure the target app accepts paste. Some password fields block it by design.

**The popup appears in the wrong position**

- This can happen on high-DPI displays. The app reads the cursor position from the OS, so display scaling settings can affect placement.
