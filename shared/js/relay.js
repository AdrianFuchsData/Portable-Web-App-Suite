/*
 * Client for the optional relay (relay/): TCP connections over WebSocket and an HTTP proxy.
 *
 * The relay runs on the local machine (default http://127.0.0.1:8765, token) or on another machine / behind a reverse
 * proxy (https://relay.example.org/relay, user name and password, or a client certificate checked by the proxy).
 * With a user name, the client logs in (POST /auth) and uses the session token like the relay token; an expired
 * session is renewed once automatically. Credentials are only sent over https or to the local machine, unless the
 * user allowed an unencrypted connection (allowInsecure).
 */
(function (Suite) {
  'use strict';

  const fail = (key, arg, text) => (Suite.LocalizedError ? new Suite.LocalizedError(key, arg) : new Error(text));
  if (Suite.i18n) Suite.i18n.register({
    en: {
      'relay.insecure': 'The relay at {0} is not encrypted (http). Use https, or allow unencrypted connections in the relay settings (trusted networks only).',
      'relay.loginFailed': 'Relay login failed: {0}',
    },
    de: {
      'relay.insecure': 'Das Relay unter {0} ist nicht verschlüsselt (http). Verwenden Sie https oder erlauben Sie unverschlüsselte Verbindungen in den Relay-Einstellungen (nur in vertrauenswürdigen Netzen).',
      'relay.loginFailed': 'Anmeldung am Relay fehlgeschlagen: {0}',
    },
  });

  /** Relay settings: { url, token, user, password, allowInsecure }. Without user, the token is used. */
  function config(url, token = '', { user = '', password = '', allowInsecure = false } = {}) {
    return { url: url.replace(/\/+$/, ''), token, user, password, allowInsecure };
  }

  const isLocal = (url) => {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '::1' || /^127\./.test(host);
  };

  /** Throws unless credentials may be sent to the relay (https, local machine, or explicitly allowed). */
  function checkTransport(relay) {
    const url = new URL(relay.url);
    if (url.protocol === 'http:' && !isLocal(relay.url) && !relay.allowInsecure) throw fail('relay.insecure', url.host, `the relay at ${url.host} is not encrypted (http)`);
  }

  /** Check that a relay is reachable. Resolves to its /info object ({ version, auth: [...], tls }) or rejects. */
  async function info(relay) {
    const response = await fetch(`${relay.url}/info`);
    if (!response.ok) throw new Error(`relay answered ${response.status}`);
    return response.json();
  }

  // sessions per relay and credentials (changed credentials log in again)
  const sessions = new Map(); // key -> { token, expires, lifetime }
  const sessionKey = (relay) => JSON.stringify([relay.url, relay.user, relay.password]);

  /** Log in with user name and password; resolves to { token, user, expires }. */
  async function login(relay) {
    checkTransport(relay);
    const response = await fetch(`${relay.url}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: relay.user, password: relay.password }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw fail('relay.loginFailed', body.error || `HTTP ${response.status}`, `relay login failed: ${body.error || response.status}`);
    const lifetime = Math.max(0, body.expires * 1000 - Date.now());
    sessions.set(sessionKey(relay), { token: body.token, expires: Date.now() + lifetime, lifetime });
    return body;
  }

  /** End the session of a relay (if any). */
  async function logout(relay) {
    const s = sessions.get(sessionKey(relay));
    sessions.delete(sessionKey(relay));
    if (s) await fetch(`${relay.url}/auth/logout`, { method: 'POST', headers: { 'X-Relay-Token': s.token } }).catch(() => {});
  }

  /** The token to send: the relay token, or the session token (logging in when needed). */
  async function credential(relay, renew = false) {
    checkTransport(relay);
    if (!relay.user) return relay.token || '';
    const s = sessions.get(sessionKey(relay));
    if (!renew && s && s.expires > Date.now() + 5000) {
      s.expires = Date.now() + s.lifetime; // the relay extends sessions on use
      return s.token;
    }
    return (await login(relay)).token;
  }

  const authError = (message) => /invalid token|session expired/.test(message || '');

  /**
   * Open a TCP connection through the relay.
   * options: { host, port, tls = false, insecure = false }
   * Resolves to a connection { send(bytes), read(), startTls(insecure), close(), closed }.
   * read() resolves to all data received since the last read (Uint8Array), or null when the connection is closed.
   */
  async function connect(relay, options) {
    const token = await credential(relay);
    try {
      return await openTunnel(relay, token, options);
    } catch (e) {
      if (!relay.user || !authError(e.message)) throw e;
      return openTunnel(relay, await credential(relay, true), options);
    }
  }

  function openTunnel(relay, token, { host, port, tls = false, insecure = false }) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${relay.url.replace(/^http/, 'ws')}/tcp`);
      ws.binaryType = 'arraybuffer';
      const chunks = [];
      const readers = [];
      const controlWaiters = [];
      let opened = false;
      let closed = false;

      const deliver = (chunk) => {
        if (readers.length) readers.shift()(chunk);
        else chunks.push(chunk);
      };

      ws.onopen = () => ws.send(JSON.stringify({ token, host, port, tls, insecure }));
      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          const msg = JSON.parse(event.data);
          if (!opened) {
            if (!msg.ok) { reject(new Error(msg.error || 'relay refused the connection')); ws.close(); return; }
            opened = true;
            resolve(connection);
          } else if (controlWaiters.length) {
            controlWaiters.shift()(msg);
          }
          return;
        }
        deliver(new Uint8Array(event.data));
      };
      ws.onclose = () => {
        closed = true;
        connection.closed = true;
        if (!opened) reject(new Error('relay connection failed'));
        while (readers.length) readers.shift()(null);
        while (controlWaiters.length) controlWaiters.shift()({ ok: false, error: 'connection closed' });
      };

      const connection = {
        closed: false,
        send(data) {
          if (closed) throw new Error('connection closed');
          ws.send(typeof data === 'string' ? new TextEncoder().encode(data) : data);
        },
        read() {
          if (chunks.length === 1) return Promise.resolve(chunks.shift());
          if (chunks.length > 1) {
            // hand over everything received so far in one piece (fewer promise round trips)
            const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
            let offset = 0;
            for (const c of chunks.splice(0)) { all.set(c, offset); offset += c.length; }
            return Promise.resolve(all);
          }
          if (closed) return Promise.resolve(null);
          return new Promise((r) => readers.push(r));
        },
        /** Upgrade to TLS (STARTTLS, Postgres SSLRequest). Send nothing until it resolves. */
        startTls(insecureTls = false) {
          return new Promise((res, rej) => {
            controlWaiters.push((msg) => (msg.ok ? res() : rej(new Error(msg.error || 'STARTTLS failed'))));
            ws.send(JSON.stringify({ op: 'starttls', insecure: insecureTls }));
          });
        },
        close() { if (!closed) ws.close(); },
      };
    });
  }

  function toBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function fromBase64(text) {
    const s = atob(text);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }

  /**
   * Send an HTTP request through the relay (no CORS restrictions, all headers visible).
   * request: { method, url, headers: [[name, value]], body: Uint8Array|string, insecure, followRedirects, timeout }
   * Resolves to { status, reason, url, httpVersion, headers: [[name, value]], body: Uint8Array, timeMs }.
   */
  async function http(relay, request) {
    const body = typeof request.body === 'string' ? new TextEncoder().encode(request.body) : request.body;
    const payload = JSON.stringify({ ...request, body: body ? toBase64(body) : undefined });
    const send = async (token) => fetch(`${relay.url}/http`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Relay-Token': token }, body: payload });
    let response = await send(await credential(relay));
    let result = await response.json();
    if (response.status === 401 && relay.user && authError(result.error)) {
      response = await send(await credential(relay, true));
      result = await response.json();
    }
    if (result.error) throw new Error(result.error);
    return { ...result, body: fromBase64(result.body) };
  }

  Suite.relay = { config, info, login, logout, connect, http, checkTransport };
})(window.Suite = window.Suite || {});
