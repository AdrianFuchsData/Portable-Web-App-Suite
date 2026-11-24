/*
 * One-time passwords (TOTP, HOTP, Steam) for the suite: the token model, otpauth:// links, imports (Google Authenticator
 * export, Aegis JSON, lists of links) and how tokens are stored in KeePass entries (the "otp" field of KeePassXC & co. plus the
 * TimeOtp-* / HmacOtp-* fields of KeePass 2.47+; older KeePassXC "TOTP Seed"/"TOTP Settings" and KeeOtp are read).
 * Adapted from the Web Authenticator (EUPL-1.2). Needs vendor/otpauth.umd.min.js (OTPAuth) and, for the KeePass part, kdbxweb.
 *
 *   Suite.otp.parseUri(uri) / toUri(token) / createToken(props) / generate(token, now) -> { code, next, remaining, progress }
 *   Suite.otp.readToken(entry) / writeToken(entry, token) / removeTokenFields(entry) / hasOtpData(entry) / isOtpField(key)
 *   Suite.otp.parseImportText(text) -> { tokens, errors }, parseMigrationUri(uri)
 */
(function (Suite) {
  'use strict';

  Suite.i18n.register({
    en: {
      'otp.err.uri': 'not an otpauth:// link', 'otp.err.type': 'unsupported type “{0}”', 'otp.err.secret': 'missing or invalid secret key',
      'otp.err.algorithm': 'unsupported algorithm “{0}”', 'otp.err.digits': 'invalid number of digits', 'otp.err.period': 'invalid period',
      'otp.err.counter': 'invalid counter', 'otp.err.migration': 'invalid Google Authenticator export', 'otp.err.json': 'unrecognized JSON format',
      'otp.err.encrypted': 'encrypted exports are not supported, please export unencrypted', 'otp.lineError': 'Line {0}: {1}',
    },
    de: {
      'otp.err.uri': 'kein otpauth://-Link', 'otp.err.type': 'nicht unterstützter Typ „{0}“', 'otp.err.secret': 'fehlender oder ungültiger geheimer Schlüssel',
      'otp.err.algorithm': 'nicht unterstützter Algorithmus „{0}“', 'otp.err.digits': 'ungültige Stellenanzahl', 'otp.err.period': 'ungültiges Intervall',
      'otp.err.counter': 'ungültiger Zähler', 'otp.err.migration': 'ungültiger Google-Authenticator-Export', 'otp.err.json': 'unbekanntes JSON-Format',
      'otp.err.encrypted': 'verschlüsselte Exporte werden nicht unterstützt, bitte unverschlüsselt exportieren', 'otp.lineError': 'Zeile {0}: {1}',
    },
  });

  const ALGORITHMS = ['SHA1', 'SHA256', 'SHA512'];
  const TYPES = ['totp', 'hotp', 'steam'];
  const STEAM_CHARS = '23456789BCDFGHJKMNPQRTVWXY';
  const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const err = (key, ...args) => new Suite.LocalizedError(key, ...args);

  // ---------------------------------------------------------------- encodings

  function normalizeSecret(secret) {
    return String(secret || '').replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  }

  function isValidBase32(secret) {
    // lengths 1, 3 and 6 (mod 8) cannot be produced by any byte sequence
    return /^[A-Z2-7]+$/.test(secret) && ![1, 3, 6].includes(secret.length % 8);
  }

  function base32ToBytes(secret) {
    const s = normalizeSecret(secret);
    if (!isValidBase32(s)) throw err('otp.err.secret');
    const out = [];
    let bits = 0, value = 0;
    for (const c of s) {
      value = (value << 5) | BASE32_CHARS.indexOf(c);
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return new Uint8Array(out);
  }

  function bytesToBase32(bytes) {
    let out = '', bits = 0, value = 0;
    for (const b of bytes) {
      value = (value << 8) | b;
      bits += 8;
      while (bits >= 5) {
        out += BASE32_CHARS[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += BASE32_CHARS[(value << (5 - bits)) & 31];
    return out;
  }

  function hexToBytes(hex) {
    const h = String(hex).replace(/\s/g, '');
    if (!/^([0-9a-fA-F]{2})+$/.test(h)) throw err('otp.err.secret');
    return new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
  }

  function base64ToBytes(b64) {
    try {
      const bin = atob(String(b64).replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/'));
      return Uint8Array.from(bin, (c) => c.charCodeAt(0));
    } catch (e) {
      throw err('otp.err.secret');
    }
  }

  function randomSecret(byteLength = 20) {
    return bytesToBase32(crypto.getRandomValues(new Uint8Array(byteLength)));
  }

  // ---------------------------------------------------------------- token model

  function normalizeAlgorithm(alg) {
    const a = String(alg || 'SHA1').toUpperCase().replace(/^HMAC-?/, '').replace(/-/g, '');
    if (!ALGORITHMS.includes(a)) throw err('otp.err.algorithm', alg);
    return a;
  }

  function toInt(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const s = String(value).trim();
    return /^\d+$/.test(s) ? parseInt(s, 10) : NaN;
  }

  /**
   * Create a validated token object:
   * { type, secret, algorithm, digits, period, counter, issuer, account }
   */
  function createToken(props) {
    const type = String(props.type || 'totp').toLowerCase();
    if (!TYPES.includes(type)) throw err('otp.err.type', props.type);
    const secret = normalizeSecret(props.secret);
    if (!isValidBase32(secret)) throw err('otp.err.secret');
    const token = {
      type,
      secret,
      algorithm: type === 'steam' ? 'SHA1' : normalizeAlgorithm(props.algorithm),
      digits: type === 'steam' ? 5 : toInt(props.digits, 6),
      period: type === 'hotp' ? 30 : toInt(props.period, 30),
      counter: type === 'hotp' ? toInt(props.counter, 0) : 0,
      issuer: String(props.issuer || '').trim(),
      account: String(props.account || '').trim(),
    };
    if (!(token.digits >= 4 && token.digits <= 10)) throw err('otp.err.digits');
    if (!(token.period >= 1 && token.period <= 86400)) throw err('otp.err.period');
    if (!(token.counter >= 0 && Number.isSafeInteger(token.counter))) throw err('otp.err.counter');
    return token;
  }

  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  /** Parse an otpauth://totp|hotp|steam/LABEL?secret=... URI. */
  function parseUri(uri) {
    const text = String(uri || '').trim();
    const m = /^otpauth:\/\/([^/?#]+)\/?([^?#]*)\??([^#]*)/i.exec(text);
    if (!m) throw err('otp.err.uri');
    let type = m[1].toLowerCase();
    const label = safeDecode(m[2]);
    const params = new URLSearchParams(m[3]);
    const get = (k) => {
      for (const [key, value] of params) if (key.toLowerCase() === k) return value;
      return null;
    };
    let labelIssuer = null, account = label;
    const issuerParam = get('issuer');
    const colon = label.indexOf(':');
    if (issuerParam && label.startsWith(issuerParam + ':')) {
      labelIssuer = issuerParam;
      account = label.slice(issuerParam.length + 1);
    } else if (colon >= 0) {
      labelIssuer = label.slice(0, colon).trim();
      account = label.slice(colon + 1);
    }
    if ((get('encoder') || '').toLowerCase() === 'steam') type = 'steam';
    return createToken({
      type,
      secret: get('secret'),
      algorithm: get('algorithm') || 'SHA1',
      digits: type === 'steam' ? 5 : get('digits'),
      period: get('period'),
      counter: get('counter'),
      issuer: get('issuer') !== null ? get('issuer') : labelIssuer,
      account,
    });
  }

  /** Parse the KeeOtp plugin format "key=BASE32&step=30&size=6&type=Totp&otpHashMode=Sha256". */
  function parseKeeOtp(text) {
    const params = new URLSearchParams(String(text).trim());
    const get = (k) => {
      for (const [key, value] of params) if (key.toLowerCase() === k) return value;
      return null;
    };
    return createToken({
      type: (get('type') || 'totp').toLowerCase(),
      secret: get('key'),
      algorithm: get('otphashmode') || 'SHA1',
      digits: get('size'),
      period: get('step'),
      counter: get('counter'),
    });
  }

  const enc = (s) => encodeURIComponent(s);

  /** Serialize a token to an otpauth:// URI (KeePassXC compatible). */
  function toUri(token) {
    const label = token.issuer ? `${enc(token.issuer)}:${enc(token.account)}` : enc(token.account);
    const parts = [`secret=${token.secret}`];
    if (token.issuer) parts.push(`issuer=${enc(token.issuer)}`);
    if (token.type === 'hotp') {
      parts.push(`counter=${token.counter}`);
    } else {
      parts.push(`period=${token.period}`);
    }
    parts.push(`digits=${token.digits}`, `algorithm=${token.algorithm}`);
    if (token.type === 'steam') parts.push('encoder=steam');
    return `otpauth://${token.type === 'hotp' ? 'hotp' : 'totp'}/${label}?${parts.join('&')}`;
  }

  // ---------------------------------------------------------------- code generation

  const secretCache = new Map();
  function secretObject(base32) {
    let s = secretCache.get(base32);
    if (!s) {
      s = OTPAuth.Secret.fromBase32(base32);
      secretCache.set(base32, s);
    }
    return s;
  }

  function hotpCode(token, counter) {
    const secret = secretObject(token.secret);
    if (token.type === 'steam') {
      // 10 decimal digits hold the complete 31 bit truncated HMAC value
      let value = parseInt(OTPAuth.HOTP.generate({ secret, algorithm: 'SHA1', digits: 10, counter }), 10);
      let code = '';
      for (let i = 0; i < 5; i++) {
        code += STEAM_CHARS[value % STEAM_CHARS.length];
        value = Math.floor(value / STEAM_CHARS.length);
      }
      return code;
    }
    return OTPAuth.HOTP.generate({ secret, algorithm: token.algorithm, digits: token.digits, counter });
  }

  /**
   * Codes of a token at the given time (default: the adjustable app clock).
   * Returns { code, previous, next, remaining (seconds), progress (0..1 elapsed) };
   * for HOTP previous/remaining/progress are null and next is the code of counter + 1.
   */
  function generate(token, now = Date.now()) {
    if (token.type === 'hotp') {
      return {
        code: hotpCode(token, token.counter),
        previous: null,
        next: hotpCode(token, token.counter + 1),
        remaining: null,
        progress: null,
      };
    }
    const seconds = now / 1000;
    const counter = Math.floor(seconds / token.period);
    const elapsed = seconds - counter * token.period;
    return {
      code: hotpCode(token, counter),
      previous: counter > 0 ? hotpCode(token, counter - 1) : null,
      next: hotpCode(token, counter + 1),
      remaining: Math.ceil(token.period - elapsed),
      progress: elapsed / token.period,
    };
  }

  /** Group digits for readability: 123456 -> "123 456", 12345678 -> "1234 5678". */
  function formatCode(code) {
    if (!/^\d+$/.test(code) || code.length < 6) return code;
    const half = Math.floor(code.length / 2);
    return code.slice(0, half) + ' ' + code.slice(half);
  }


  // ---------------------------------------------------------------- imports


  // ---------------------------------------------------------------- minimal protobuf reader

  function readVarint(buf, pos) {
    let result = 0, shift = 0, b;
    do {
      if (pos.i >= buf.length) throw err('otp.err.migration');
      b = buf[pos.i++];
      result += (b & 0x7f) * 2 ** shift; // avoid 32 bit overflow of <<
      shift += 7;
    } while (b & 0x80);
    return result;
  }

  /** Decode a protobuf message into { fieldNumber: [values] } (varints as numbers, bytes as Uint8Array). */
  function decodeMessage(buf) {
    const fields = {};
    const pos = { i: 0 };
    while (pos.i < buf.length) {
      const key = readVarint(buf, pos);
      const field = Math.floor(key / 8), wire = key & 7;
      let value;
      if (wire === 0) value = readVarint(buf, pos);
      else if (wire === 2) {
        const len = readVarint(buf, pos);
        if (pos.i + len > buf.length) throw err('otp.err.migration');
        value = buf.subarray(pos.i, pos.i + len);
        pos.i += len;
      } else if (wire === 1) pos.i += 8;
      else if (wire === 5) pos.i += 4;
      else throw err('otp.err.migration');
      if (value !== undefined) (fields[field] = fields[field] || []).push(value);
    }
    return fields;
  }

  const utf8 = (bytes) => new TextDecoder().decode(bytes);

  /** Parse otpauth-migration://offline?data=... (Google Authenticator "Transfer accounts"). */
  function parseMigrationUri(uri) {
    const m = /^otpauth-migration:\/\/[^?]*\?(.*)$/i.exec(String(uri).trim());
    if (!m) throw err('otp.err.migration');
    const data = new URLSearchParams(m[1]).get('data');
    if (!data) throw err('otp.err.migration');
    // a literal "+" (not percent-encoded) is turned into a space by URLSearchParams
    const payload = decodeMessage(base64ToBytes(data.replace(/ /g, '+')));
    const algorithms = { 0: 'SHA1', 1: 'SHA1', 2: 'SHA256', 3: 'SHA512' };
    return (payload[1] || []).map((raw) => {
      const p = decodeMessage(raw);
      const issuer = p[3] ? utf8(p[3][0]) : '';
      let name = p[2] ? utf8(p[2][0]) : '';
      if (issuer && name.startsWith(issuer + ':')) name = name.slice(issuer.length + 1);
      const alg = p[4] ? p[4][0] : 1;
      if (!(alg in algorithms)) throw err('otp.err.algorithm', 'MD5');
      return createToken({
        type: p[6] && p[6][0] === 1 ? 'hotp' : 'totp',
        secret: bytesToBase32(p[1] ? p[1][0] : new Uint8Array()),
        algorithm: algorithms[alg],
        digits: p[5] && p[5][0] === 2 ? 8 : 6,
        counter: p[7] ? p[7][0] : 0,
        issuer,
        account: name.trim(),
      });
    });
  }

  /** Parse an unencrypted Aegis JSON export. */
  function parseAegisJson(json) {
    if (!json || typeof json !== 'object' || !('db' in json)) throw err('otp.err.json');
    if (typeof json.db === 'string') throw err('otp.err.encrypted');
    const tokens = [], errors = [];
    for (const e of json.db.entries || []) {
      try {
        if (!['totp', 'hotp', 'steam'].includes(e.type)) throw err('otp.err.type', e.type);
        const info = e.info || {};
        tokens.push(createToken({
          type: e.type, secret: info.secret, algorithm: info.algo, digits: info.digits,
          period: info.period, counter: info.counter, issuer: e.issuer, account: e.name,
        }));
      } catch (ex) {
        errors.push(`${e.issuer || e.name || '?'}: ${ex.localized ? ex.localized() : ex.message}`);
      }
    }
    return { tokens, errors };
  }

  /**
   * Parse arbitrary import text: Aegis JSON or lines of otpauth:// / otpauth-migration:// links.
   * Returns { tokens: [...], errors: [message, ...] }.
   */
  function parseImportText(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return { tokens: [], errors: [] };
    if (trimmed.startsWith('{')) {
      let json;
      try { json = JSON.parse(trimmed); } catch (e) { return { tokens: [], errors: [Suite.t('otp.err.json')] }; }
      try { return parseAegisJson(json); } catch (e) { return { tokens: [], errors: [e.localized ? e.localized() : e.message] }; }
    }
    const tokens = [], errors = [];
    trimmed.split(/\r?\n/).forEach((line, i) => {
      const l = line.trim();
      if (!l || l.startsWith('#')) return;
      try {
        if (/^otpauth-migration:/i.test(l)) tokens.push(...parseMigrationUri(l));
        else tokens.push(parseUri(l));
      } catch (e) {
        errors.push(Suite.t('otp.lineError', i + 1, e.localized ? e.localized() : e.message));
      }
    });
    return { tokens, errors };
  }


  // ---------------------------------------------------------------- KeePass entries
  const KEEPASS_ALGORITHMS = { SHA1: 'HMAC-SHA-1', SHA256: 'HMAC-SHA-256', SHA512: 'HMAC-SHA-512' };
  const SECRET_SUFFIXES = ['-Secret-Base32', '-Secret-Hex', '-Secret-Base64', '-Secret'];
  const isOtpField = (key) => key === 'otp' || /^(TimeOtp|HmacOtp)-/.test(key);
  const LEGACY_SEED = 'TOTP Seed', LEGACY_SETTINGS = 'TOTP Settings';
  function fieldText(entry, key) {
    const v = entry.fields.get(key);
    if (v === undefined || v === null) return '';
    return v instanceof kdbxweb.ProtectedValue ? v.getText() : String(v);
  }

  function readSecret(entry, prefix) {
    for (const suffix of SECRET_SUFFIXES) {
      const value = fieldText(entry, prefix + suffix);
      if (!value) continue;
      if (suffix === '-Secret-Base32') return normalizeSecret(value);
      if (suffix === '-Secret-Hex') return bytesToBase32(hexToBytes(value));
      if (suffix === '-Secret-Base64') return bytesToBase32(base64ToBytes(value));
      return bytesToBase32(new TextEncoder().encode(value));
    }
    return null;
  }

  /**
   * Read the OTP configuration of a KeePass entry.
   * Supported (in this order): "otp" field with otpauth:// URI (KeePassXC, KeeWeb, KeePassDX, Strongbox)
   * or KeeOtp format, KeePass 2.47+ TimeOtp-* / HmacOtp-* fields, legacy KeePassXC "TOTP Seed"/"TOTP Settings".
   * Returns a token or null; throws if OTP data is present but invalid.
   */
  function readToken(entry) {
    const uri = fieldText(entry, 'otp').trim();
    if (uri) {
      if (/^otpauth:/i.test(uri)) return parseUri(uri);
      if (/(^|&)key=/i.test(uri)) return parseKeeOtp(uri);
      return createToken({ secret: uri }); // plain Base32 secret
    }
    const totpSecret = readSecret(entry, 'TimeOtp');
    if (totpSecret) {
      return createToken({
        type: 'totp',
        secret: totpSecret,
        digits: fieldText(entry, 'TimeOtp-Length') || 6,
        period: fieldText(entry, 'TimeOtp-Period') || 30,
        algorithm: fieldText(entry, 'TimeOtp-Algorithm') || 'SHA1',
      });
    }
    const hotpSecret = readSecret(entry, 'HmacOtp');
    if (hotpSecret) {
      return createToken({ type: 'hotp', secret: hotpSecret, counter: fieldText(entry, 'HmacOtp-Counter') || 0 });
    }
    const seed = fieldText(entry, LEGACY_SEED).trim();
    if (seed) {
      if (/^otpauth:/i.test(seed)) return parseUri(seed);
      const [period, digits] = (fieldText(entry, LEGACY_SETTINGS) || '30;6').split(';');
      const steam = digits === 'S';
      return createToken({ type: steam ? 'steam' : 'totp', secret: seed, period, digits: steam ? 5 : digits });
    }
    return null;
  }

  const hasOtpData = (entry) =>
    [...entry.fields.keys()].some((k) => isOtpField(k) || k === LEGACY_SEED);

  /**
   * Write a token to a KeePass entry in a way all common KeePass clients understand:
   * the "otp" URI field and, where KeePass 2 supports the settings, the TimeOtp-* / HmacOtp-* fields.
   */
  function writeToken(entry, token) {
    const hadLegacy = entry.fields.has(LEGACY_SEED);
    for (const key of [...entry.fields.keys()]) {
      if (isOtpField(key) || key === LEGACY_SEED || key === LEGACY_SETTINGS) entry.fields.delete(key);
    }
    const protect = (s) => kdbxweb.ProtectedValue.fromString(s);
    entry.fields.set('otp', protect(toUri(token)));
    if (token.type === 'totp' && token.digits >= 6 && token.digits <= 8) {
      entry.fields.set('TimeOtp-Secret-Base32', protect(token.secret));
      entry.fields.set('TimeOtp-Length', String(token.digits));
      entry.fields.set('TimeOtp-Period', String(token.period));
      entry.fields.set('TimeOtp-Algorithm', KEEPASS_ALGORITHMS[token.algorithm]);
    } else if (token.type === 'hotp' && token.digits === 6 && token.algorithm === 'SHA1') {
      entry.fields.set('HmacOtp-Secret-Base32', protect(token.secret));
      entry.fields.set('HmacOtp-Counter', String(token.counter));
    }
    if (hadLegacy && token.type !== 'hotp') {
      entry.fields.set(LEGACY_SEED, protect(token.secret));
      entry.fields.set(LEGACY_SETTINGS, `${token.period};${token.type === 'steam' ? 'S' : token.digits}`);
    }
  }

  function removeTokenFields(entry) {
    for (const key of [...entry.fields.keys()]) {
      if (isOtpField(key) || key === LEGACY_SEED || key === LEGACY_SETTINGS) entry.fields.delete(key);
    }
  }


  Suite.otp = {
    ALGORITHMS, TYPES,
    normalizeSecret, isValidBase32, base32ToBytes, bytesToBase32, hexToBytes, base64ToBytes, randomSecret,
    createToken, parseUri, parseKeeOtp, toUri, generate, formatCode,
    parseMigrationUri, parseAegisJson, parseImportText,
    readToken, writeToken, removeTokenFields, hasOtpData, isOtpField: (key) => isOtpField(key) || key === LEGACY_SEED || key === LEGACY_SETTINGS,
  };
})(window.Suite = window.Suite || {});
