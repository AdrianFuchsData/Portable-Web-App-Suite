/*
 * Password generator of the KeePass editor (crypto.getRandomValues, no modulo bias).
 *   KP.generatePassword({ length: 20, lower: true, upper: true, digits: true, symbols: true, excludeAmbiguous: true })
 */
(function (KP) {
  'use strict';

  const SETS = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digits: '0123456789',
    symbols: '!#$%&()*+,-./:;<=>?@[]^_{|}~',
  };
  const AMBIGUOUS = /[Il1O0o|]/g;

  /** Uniform random integer in [0, max). */
  function randomInt(max) {
    const limit = Math.floor(0x100000000 / max) * max;
    const buf = new Uint32Array(1);
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % max;
  }

  function generatePassword({ length = 20, lower = true, upper = true, digits = true, symbols = true, excludeAmbiguous = false } = {}) {
    const sets = Object.entries({ lower, upper, digits, symbols }).filter(([, on]) => on).map(([k]) => (excludeAmbiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k]));
    if (!sets.length) return '';
    const all = sets.join('');
    const chars = sets.map((s) => s[randomInt(s.length)]); // at least one character of every chosen class
    while (chars.length < length) chars.push(all[randomInt(all.length)]);
    for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    return chars.slice(0, length).join('');
  }

  /** Rough strength estimate in bits (length × log2 of the character pool size). */
  function entropy(password) {
    if (!password) return 0;
    let pool = 0;
    if (/[a-z]/.test(password)) pool += 26;
    if (/[A-Z]/.test(password)) pool += 26;
    if (/\d/.test(password)) pool += 10;
    if (/[^a-zA-Z\d]/.test(password)) pool += 33;
    return Math.round(password.length * Math.log2(pool || 1));
  }

  KP.generatePassword = generatePassword;
  KP.entropy = entropy;
})(window.KP = window.KP || {});
