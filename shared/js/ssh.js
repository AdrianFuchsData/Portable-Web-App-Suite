/* Loads the SSH/SFTP WebAssembly engine (engines/ssh, vendor/wasm/ssh-engine.wasm). */
(function (Suite) {
  'use strict';

  let loading = null;

  /**
   * Start the engine once. Needs vendor/wasm/wasm_exec.js (Go runtime, defines the global Go class)
   * and the engine embedded with id "ssh-engine". Resolves to the SSHEngine API (see engines/ssh/main.go).
   */
  function load(embedId = 'ssh-engine') {
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        window.onSSHEngineReady = (engine) => { delete window.onSSHEngineReady; resolve(engine); };
        const go = new Go();
        Suite.embed.wasm(embedId, go.importObject)
          .then(({ instance }) => go.run(instance))
          .catch(reject);
      });
    }
    return loading;
  }

  const enc = new TextEncoder();

  /** A reader for handshake answers: exact numbers of bytes, or up to a delimiter; the rest stays for the SSH engine. */
  function buffered(transport) {
    let buf = new Uint8Array(0);
    const more = async () => {
      const chunk = await transport.read();
      if (!chunk) throw new Error('the proxy closed the connection');
      const next = new Uint8Array(buf.length + chunk.length);
      next.set(buf); next.set(chunk, buf.length);
      buf = next;
    };
    return {
      async bytes(n) { while (buf.length < n) await more(); const out = buf.slice(0, n); buf = buf.slice(n); return out; },
      async until(text) {
        const needle = enc.encode(text);
        for (;;) {
          for (let i = 0; i + needle.length <= buf.length; i++) {
            if (needle.every((b, j) => buf[i + j] === b)) { const out = buf.slice(0, i + needle.length); buf = buf.slice(i + needle.length); return new TextDecoder().decode(out); }
          }
          await more();
        }
      },
      /** The transport with the bytes read too far put back in front. */
      rest() {
        let pending = buf.length ? buf : null;
        return { send: (b) => transport.send(b), read: async () => { if (pending) { const p = pending; pending = null; return p; } return transport.read(); }, close: () => transport.close() };
      },
    };
  }

  /** Ask a SOCKS5 proxy (RFC 1928, user/password RFC 1929) for a connection to host:port over the transport. */
  async function socks5(transport, { user = '', password = '' }, host, port) {
    const r = buffered(transport);
    transport.send(new Uint8Array(user ? [5, 2, 0, 2] : [5, 1, 0]));
    const [ver, method] = await r.bytes(2);
    if (ver !== 5 || method === 0xff) throw new Error('the SOCKS proxy accepts none of the offered sign-in methods');
    if (method === 2) {
      const u = enc.encode(user), p = enc.encode(password);
      transport.send(new Uint8Array([1, u.length, ...u, p.length, ...p]));
      const [, status] = await r.bytes(2);
      if (status !== 0) throw new Error('the SOCKS proxy refused the user name or password');
    }
    const name = enc.encode(host);
    transport.send(new Uint8Array([5, 1, 0, 3, name.length, ...name, port >> 8, port & 255]));
    const head = await r.bytes(4);
    if (head[1] !== 0) {
      const reasons = { 1: 'general failure', 2: 'not allowed', 3: 'network unreachable', 4: 'host unreachable', 5: 'connection refused', 6: 'TTL expired', 7: 'command not supported', 8: 'address type not supported' };
      throw new Error(`SOCKS proxy: ${reasons[head[1]] || `error ${head[1]}`}`);
    }
    const addr = head[3] === 1 ? 4 : head[3] === 4 ? 16 : (await r.bytes(1))[0];
    await r.bytes(addr + 2);
    return r.rest();
  }

  /** Ask an HTTP proxy for a tunnel with CONNECT host:port (Basic authentication when a user is given). */
  async function httpConnect(transport, { user = '', password = '' }, host, port) {
    const r = buffered(transport);
    const target = `${host.includes(':') ? `[${host}]` : host}:${port}`;
    const auth = user ? `Proxy-Authorization: Basic ${btoa(String.fromCharCode(...enc.encode(`${user}:${password}`)))}\r\n` : '';
    transport.send(enc.encode(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${auth}\r\n`));
    const answer = await r.until('\r\n\r\n');
    const status = /^HTTP\/\d(?:\.\d)?\s+(\d{3})\s*([^\r\n]*)/.exec(answer);
    if (!status || status[1] !== '200') throw new Error(`HTTP proxy: ${status ? `${status[1]} ${status[2]}` : 'invalid answer'}`);
    return r.rest();
  }

  /**
   * Open an SSH connection. options: {host, port, user, password, privateKey, passphrase, hostKey, proxy, via}.
   *   proxy: { type: 'socks5' | 'http', host, port, user, password } – reached through the relay, asked for host:port
   *   via:   a connected client (jump host): the connection is a direct-tcpip channel of that client
   * Without both, the relay connects to host:port directly.
   */
  async function connect(relay, options) {
    const engine = await load();
    const port = Number(options.port) || 22;
    let transport;
    if (options.via) transport = await options.via.dial(options.host, port);
    else if (options.proxy && options.proxy.type && options.proxy.host) {
      const p = options.proxy;
      const raw = await Suite.relay.connect(relay, { host: p.host, port: Number(p.port) || (p.type === 'http' ? 8080 : 1080) });
      try {
        transport = p.type === 'http' ? await httpConnect(raw, p, options.host, port) : await socks5(raw, p, options.host, port);
      } catch (e) { raw.close(); throw e; }
    } else transport = await Suite.relay.connect(relay, { host: options.host, port });
    try {
      return await engine.connect(transport, options);
    } catch (e) {
      transport.close();
      throw e;
    }
  }

  Suite.ssh = { load, connect, socks5, httpConnect };
})(window.Suite = window.Suite || {});
