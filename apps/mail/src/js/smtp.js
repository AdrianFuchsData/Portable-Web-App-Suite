/*
 * SMTP submission client (RFC 5321, 3207, 4954) over a relay TCP connection: TLS or STARTTLS, AUTH PLAIN/LOGIN,
 * one message per connection.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

export class SmtpError extends Error {
  constructor(message, code = 0) { super(message); this.name = 'SmtpError'; this.code = code; }
}

const b64 = (s) => btoa(String.fromCharCode(...enc.encode(s)));

/** Dot-stuffing and CRLF line ends for DATA (the message must be ASCII or UTF-8 text). */
export function dataBlock(message) {
  const text = (typeof message === 'string' ? message : dec.decode(message)).replace(/\r?\n/g, '\r\n').replace(/\r\n$/, '');
  return `${text.replace(/^\./gm, '..')}\r\n.\r\n`;
}

/**
 * Send one message. options: { relay, host, port, security: 'tls'|'starttls'|'none', insecure, user, password,
 * from (address), recipients ([address]), message (text or bytes), helo }.
 */
export async function sendMail({ relay, host, port, security = 'starttls', insecure = false, user = '', password = '', from, recipients, message, helo = 'localhost' }) {
  const conn = await Suite.relay.connect(relay, { host, port: Number(port) || (security === 'tls' ? 465 : 587), tls: security === 'tls', insecure });
  let buffer = '';
  const reply = async () => {
    const lines = [];
    for (;;) {
      const nl = buffer.indexOf('\r\n');
      if (nl >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        lines.push(line);
        if (/^\d{3}(?: |$)/.test(line)) return { code: Number(line.slice(0, 3)), lines: lines.map((l) => l.slice(4)) };
        continue;
      }
      const chunk = await conn.read();
      if (!chunk) throw new SmtpError('SMTP: the server closed the connection');
      buffer += dec.decode(chunk);
    }
  };
  const expect = async (r, ok) => {
    const res = await r;
    if (!ok.includes(Math.floor(res.code / 100) * 100) && !ok.includes(res.code)) throw new SmtpError(`SMTP ${res.code}: ${res.lines.join(' ')}`, res.code);
    return res;
  };
  const cmd = (line, ok = [200]) => { conn.send(`${line}\r\n`); return expect(reply(), ok); };

  try {
    await expect(reply(), [200]);
    let ehlo = await cmd(`EHLO ${helo}`).catch(() => cmd(`HELO ${helo}`));
    let ext = ehlo.lines.slice(1).map((l) => l.toUpperCase());
    if (security === 'starttls') {
      if (!ext.some((l) => l.startsWith('STARTTLS'))) throw new SmtpError('SMTP: the server does not offer STARTTLS');
      await cmd('STARTTLS');
      await conn.startTls(insecure);
      ehlo = await cmd(`EHLO ${helo}`);
      ext = ehlo.lines.slice(1).map((l) => l.toUpperCase());
    }
    if (user) {
      const auth = (ext.find((l) => /^AUTH[ =]/.test(l)) || '').split(/[ =]/).slice(1);
      if (auth.includes('PLAIN') || !auth.includes('LOGIN')) {
        await cmd(`AUTH PLAIN ${b64(`\0${user}\0${password}`)}`, [235]);
      } else {
        await cmd('AUTH LOGIN', [334]);
        await cmd(b64(user), [334]);
        await cmd(b64(password), [235]);
      }
    }
    const utf8 = /[^\x00-\x7f]/.test(from + recipients.join(''));
    await cmd(`MAIL FROM:<${from}>${utf8 && ext.includes('SMTPUTF8') ? ' SMTPUTF8' : ''}`);
    const refused = [];
    for (const r of recipients) {
      try { await cmd(`RCPT TO:<${r}>`, [250, 251]); } catch (e) { refused.push(`${r}: ${e.message}`); }
    }
    if (refused.length === recipients.length) throw new SmtpError(refused.join('; '));
    await cmd('DATA', [354]);
    conn.send(enc.encode(dataBlock(message)));
    const done = await expect(reply(), [250]);
    conn.send('QUIT\r\n');
    return { refused, response: done.lines.join(' ') };
  } finally {
    setTimeout(() => conn.close(), 200);
  }
}
