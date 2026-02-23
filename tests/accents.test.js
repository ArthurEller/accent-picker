const { getAccents, hasAccents, ACCENT_MAP } = require('../src/accents');

describe('getAccents()', () => {
  test('returns correct variants for lowercase vowels', () => {
    expect(getAccents('a')).toEqual(['à', 'á', 'â', 'ã', 'ä', 'å', 'æ']);
    expect(getAccents('e')).toEqual(['è', 'é', 'ê', 'ë']);
    expect(getAccents('i')).toEqual(['ì', 'í', 'î', 'ï']);
    expect(getAccents('o')).toEqual(['ò', 'ó', 'ô', 'õ', 'ö', 'ø']);
    expect(getAccents('u')).toEqual(['ù', 'ú', 'û', 'ü']);
  });

  test('returns correct variants for uppercase vowels', () => {
    expect(getAccents('A')).toEqual(['À', 'Á', 'Â', 'Ã', 'Ä', 'Å', 'Æ']);
    expect(getAccents('E')).toEqual(['È', 'É', 'Ê', 'Ë']);
    expect(getAccents('I')).toEqual(['Ì', 'Í', 'Î', 'Ï']);
    expect(getAccents('O')).toEqual(['Ò', 'Ó', 'Ô', 'Õ', 'Ö', 'Ø']);
    expect(getAccents('U')).toEqual(['Ù', 'Ú', 'Û', 'Ü']);
  });

  test('returns correct variants for special consonants', () => {
    expect(getAccents('c')).toEqual(['ç']);
    expect(getAccents('C')).toEqual(['Ç']);
    expect(getAccents('n')).toEqual(['ñ']);
    expect(getAccents('N')).toEqual(['Ñ']);
    expect(getAccents('s')).toEqual(['ß', 'š']);
    expect(getAccents('S')).toEqual(['Š']);
    expect(getAccents('y')).toEqual(['ý', 'ÿ']);
    expect(getAccents('z')).toEqual(['ž']);
  });

  test('returns null for unsupported characters', () => {
    expect(getAccents('b')).toBeNull();
    expect(getAccents('x')).toBeNull();
    expect(getAccents('1')).toBeNull();
    expect(getAccents(' ')).toBeNull();
    expect(getAccents('')).toBeNull();
  });
});

describe('hasAccents()', () => {
  test('returns true for supported characters', () => {
    ['a', 'A', 'e', 'E', 'i', 'I', 'o', 'O', 'u', 'U', 'c', 'C', 'n', 'N', 's', 'S', 'y', 'Y', 'z', 'Z'].forEach((char) => {
      expect(hasAccents(char)).toBe(true);
    });
  });

  test('returns false for unsupported characters', () => {
    ['b', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'p', 'q', 'r', 't', 'v', 'w', 'x', '1', ' '].forEach((char) => {
      expect(hasAccents(char)).toBe(false);
    });
  });
});

describe('ACCENT_MAP structure', () => {
  test('every entry has at least one accent variant', () => {
    Object.entries(ACCENT_MAP).forEach(([char, accents]) => {
      expect(accents.length).toBeGreaterThan(0);
    });
  });

  test('every accent variant is a single character', () => {
    Object.entries(ACCENT_MAP).forEach(([char, accents]) => {
      accents.forEach((accent) => {
        expect(typeof accent).toBe('string');
        expect(accent.length).toBe(1);
      });
    });
  });

  test('every lowercase key has a corresponding uppercase key', () => {
    ['a', 'e', 'i', 'o', 'u', 'c', 'n', 's', 'y', 'z'].forEach((key) => {
      expect(ACCENT_MAP).toHaveProperty(key);
      expect(ACCENT_MAP).toHaveProperty(key.toUpperCase());
    });
  });

  test('accent variants contain no duplicates per key', () => {
    Object.entries(ACCENT_MAP).forEach(([char, accents]) => {
      const unique = new Set(accents);
      expect(unique.size).toBe(accents.length);
    });
  });
});
