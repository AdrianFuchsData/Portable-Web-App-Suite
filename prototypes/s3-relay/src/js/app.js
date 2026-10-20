/* Manual test page for the relay client (shared/js/relay.js). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const log = (text) => { $('log').textContent += text + '\n'; };
  const relay = () => Suite.relay.config($('relay-url').value, $('relay-token').value);
  let conn = null;

  async function readLoop(c) {
    for (let chunk = await c.read(); chunk; chunk = await c.read()) log('< ' + new TextDecoder().decode(chunk));
    log('* connection closed');
  }

  const run = (fn) => async () => { try { await fn(); } catch (e) { log('! ' + e.message); } };
  $('info').onclick = run(async () => log(JSON.stringify(await Suite.relay.info(relay()))));
  $('connect').onclick = run(async () => {
    conn = await Suite.relay.connect(relay(), { host: $('host').value, port: +$('port').value, tls: $('tls').checked });
    log('* connected');
    readLoop(conn);
  });
  $('send').onclick = run(async () => { conn.send($('line').value + '\r\n'); log('> ' + $('line').value); });
  $('starttls').onclick = run(async () => { await conn.startTls(); log('* TLS active'); });
  $('get').onclick = run(async () => {
    const r = await Suite.relay.http(relay(), { method: 'GET', url: $('url').value });
    log(`${r.httpVersion} ${r.status} ${r.reason} (${r.timeMs} ms)`);
    r.headers.forEach(([k, v]) => log(`${k}: ${v}`));
    log('\n' + new TextDecoder().decode(r.body).slice(0, 2000));
  });
  document.body.dataset.ready = 'true';
})();
