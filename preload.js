/**
 * Preload script - bridges main process IPC to the renderer securely
 * using contextBridge.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('accentPicker', {
  /**
   * Called by the renderer when the user clicks an accent option.
   * @param {string} char - The selected accent character
   */
  selectAccent: (char) => {
    ipcRenderer.send('accent-selected', char);
  },

  /**
   * Called by the renderer to dismiss the picker without selection.
   */
  dismissPicker: () => {
    ipcRenderer.send('dismiss-picker');
  },

  /**
   * Register a callback for when the main process wants to show the picker.
   * @param {(data: { baseChar: string, accents: string[] }) => void} callback
   */
  onShowPicker: (callback) => {
    ipcRenderer.on('show-picker', (_event, data) => {
      callback(data);
    });
  },

  /**
   * Register a callback for when the main process wants to hide the picker.
   * @param {() => void} callback
   */
  onHidePicker: (callback) => {
    ipcRenderer.on('hide-picker', (_event) => {
      callback();
    });
  },

  /**
   * Register a callback for when the main process wants to select an accent
   * by its index (triggered by number key press detected in the hook).
   * @param {(index: number) => void} callback
   */
  onSelectByIndex: (callback) => {
    ipcRenderer.on('select-accent-by-index', (_event, index) => {
      callback(index);
    });
  },
});
