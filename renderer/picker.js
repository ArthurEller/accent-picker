/**
 * Accent Picker - Renderer Process
 *
 * Handles rendering the accent options and communicating selections
 * back to the main process via the preload-exposed API.
 */

(function () {
  'use strict';

  const container = document.getElementById('picker-container');
  const optionsEl = document.getElementById('accent-options');

  // Current accents being displayed
  let currentAccents = [];

  /**
   * Renders the accent options into the picker UI.
   * @param {string[]} accents - Array of accent characters
   */
  function renderAccents(accents) {
    currentAccents = accents;
    optionsEl.innerHTML = '';

    accents.forEach((char, index) => {
      const option = document.createElement('div');
      option.className = 'accent-option';
      option.setAttribute('data-index', index.toString());

      const charEl = document.createElement('span');
      charEl.className = 'accent-char';
      charEl.textContent = char;

      const numberEl = document.createElement('span');
      numberEl.className = 'accent-number';
      numberEl.textContent = (index + 1).toString();

      option.appendChild(charEl);
      option.appendChild(numberEl);

      // Click to select
      option.addEventListener('click', () => {
        selectAccent(index);
      });

      // Hover highlight
      option.addEventListener('mouseenter', () => {
        clearHighlights();
        option.classList.add('highlighted');
      });

      option.addEventListener('mouseleave', () => {
        option.classList.remove('highlighted');
      });

      optionsEl.appendChild(option);
    });
  }

  /**
   * Selects an accent by index and sends it to the main process.
   * @param {number} index - 0-based index into currentAccents
   */
  function selectAccent(index) {
    if (index < 0 || index >= currentAccents.length) return;

    const char = currentAccents[index];
    hide();
    window.accentPicker.selectAccent(char);
  }

  /**
   * Shows the picker with the given accents.
   * @param {{ baseChar: string, accents: string[] }} data
   */
  function show(data) {
    renderAccents(data.accents);
    container.classList.remove('hidden');
  }

  /**
   * Hides the picker.
   */
  function hide() {
    container.classList.add('hidden');
    currentAccents = [];
  }

  /**
   * Removes highlight class from all options.
   */
  function clearHighlights() {
    const options = optionsEl.querySelectorAll('.accent-option');
    options.forEach((opt) => opt.classList.remove('highlighted'));
  }

  // -- IPC event listeners --

  window.accentPicker.onShowPicker((data) => {
    show(data);
  });

  window.accentPicker.onHidePicker(() => {
    hide();
  });

  // Main process detected a number key press while picker was visible
  window.accentPicker.onSelectByIndex((index) => {
    selectAccent(index);
  });

  // Start hidden
  container.classList.add('hidden');
})();
