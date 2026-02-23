/**
 * Accent map: maps base characters to their accented variants.
 * Supports both lowercase and uppercase letters.
 */
const ACCENT_MAP = {
  a: ['\u00e0', '\u00e1', '\u00e2', '\u00e3', '\u00e4', '\u00e5', '\u00e6'],
  A: ['\u00c0', '\u00c1', '\u00c2', '\u00c3', '\u00c4', '\u00c5', '\u00c6'],
  e: ['\u00e8', '\u00e9', '\u00ea', '\u00eb'],
  E: ['\u00c8', '\u00c9', '\u00ca', '\u00cb'],
  i: ['\u00ec', '\u00ed', '\u00ee', '\u00ef'],
  I: ['\u00cc', '\u00cd', '\u00ce', '\u00cf'],
  o: ['\u00f2', '\u00f3', '\u00f4', '\u00f5', '\u00f6', '\u00f8'],
  O: ['\u00d2', '\u00d3', '\u00d4', '\u00d5', '\u00d6', '\u00d8'],
  u: ['\u00f9', '\u00fa', '\u00fb', '\u00fc'],
  U: ['\u00d9', '\u00da', '\u00db', '\u00dc'],
  c: ['\u00e7'],
  C: ['\u00c7'],
  n: ['\u00f1'],
  N: ['\u00d1'],
  s: ['\u00df', '\u0161'],
  S: ['\u0160'],
  y: ['\u00fd', '\u00ff'],
  Y: ['\u00dd', '\u0178'],
  z: ['\u017e'],
  Z: ['\u017d'],
};

/**
 * Returns the accent variants for a given character, or null if none exist.
 * @param {string} char - The base character
 * @returns {string[] | null}
 */
function getAccents(char) {
  return ACCENT_MAP[char] || null;
}

/**
 * Checks whether a character has accent variants.
 * @param {string} char
 * @returns {boolean}
 */
function hasAccents(char) {
  return char in ACCENT_MAP;
}

module.exports = { ACCENT_MAP, getAccents, hasAccents };
