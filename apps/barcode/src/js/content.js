/*
 * Contents of barcodes: recognise what a decoded text is (link, Wi-Fi access, contact, e-mail, phone number, SMS,
 * location, one-time password setup, calendar event) and build such texts for the generator.
 *
 *   parse('WIFI:T:WPA;S:Home;P:secret;;')  -> { type: 'wifi', fields: { ssid: 'Home', security: 'WPA', password: 'secret', hidden: false } }
 *   build('wifi', { ssid, security, password, hidden }) -> 'WIFI:T:WPA;S:Home;P:secret;;'
 */

/** Escape a value for WIFI: and MECARD: (backslash before \ ; , : "). */
const esc = (s) => String(s || '').replace(/([\\;,:"])/g, '\\$1');

/** Split "K:v;K:v;;" with backslash escapes into [[key, value], ...]. */
function fieldsOf(body) {
  const out = [];
  let key = '', value = '', inValue = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\' && i + 1 < body.length) { (inValue ? (value += body[++i]) : (key += body[++i])); continue; }
    if (!inValue && c === ':') { inValue = true; continue; }
    if (c === ';') { if (key) out.push([key, value]); key = ''; value = ''; inValue = false; continue; }
    if (inValue) value += c; else key += c;
  }
  if (key) out.push([key, value]);
  return out;
}

const vEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const vUnesc = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/** Unfolded content lines of a vCard/iCalendar text: [{ name, params, value }]. */
function contentLines(text) {
  return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/).filter(Boolean).map((line) => {
    const i = line.indexOf(':');
    const head = i < 0 ? line : line.slice(0, i);
    const [name, ...params] = head.split(';');
    return { name: name.toUpperCase().replace(/^ITEM\d+\./, ''), params: params.join(';'), value: i < 0 ? '' : line.slice(i + 1) };
  });
}

export function parse(text) {
  const t = String(text || '');
  const trimmed = t.trim();
  if (/^https?:\/\/\S+$/i.test(trimmed)) return { type: 'url', fields: { url: trimmed } };
  if (/^WIFI:/i.test(trimmed)) {
    const f = Object.fromEntries(fieldsOf(trimmed.slice(5)).map(([k, v]) => [k.toUpperCase(), v]));
    return { type: 'wifi', fields: { ssid: f.S || '', security: (f.T || 'nopass').toUpperCase() === 'NOPASS' ? 'nopass' : (f.T || '').toUpperCase(), password: f.P || '', hidden: /^true$/i.test(f.H || '') } };
  }
  if (/^BEGIN:VCARD/i.test(trimmed)) {
    const lines = contentLines(trimmed);
    const get = (n) => { const l = lines.find((x) => x.name === n); return l ? vUnesc(l.value) : ''; };
    const [last = '', first = ''] = (lines.find((x) => x.name === 'N') || { value: '' }).value.split(';').map(vUnesc);
    const adr = (lines.find((x) => x.name === 'ADR') || { value: '' }).value.split(';').map(vUnesc);
    return {
      type: 'contact',
      fields: { name: get('FN') || [first, last].filter(Boolean).join(' '), first, last, org: get('ORG').replace(/;/g, ' '), title: get('TITLE'), phone: get('TEL'), email: get('EMAIL'), url: get('URL'), street: adr[2] || '', city: adr[3] || '', zip: adr[5] || '', country: adr[6] || '', note: get('NOTE') },
    };
  }
  if (/^MECARD:/i.test(trimmed)) {
    const f = {};
    for (const [k, v] of fieldsOf(trimmed.slice(7))) if (!(k.toUpperCase() in f)) f[k.toUpperCase()] = v;
    const [last = '', first = ''] = (f.N || '').split(',');
    return { type: 'contact', fields: { name: [first, last].filter(Boolean).join(' ').trim(), first, last, org: f.ORG || '', title: '', phone: f.TEL || '', email: f.EMAIL || '', url: f.URL || '', street: f.ADR || '', city: '', zip: '', country: '', note: f.NOTE || '' } };
  }
  if (/^BEGIN:VEVENT|^BEGIN:VCALENDAR/i.test(trimmed)) {
    const lines = contentLines(trimmed);
    const get = (n) => { const l = lines.find((x) => x.name === n); return l ? vUnesc(l.value) : ''; };
    return { type: 'event', fields: { summary: get('SUMMARY'), start: get('DTSTART'), end: get('DTEND'), location: get('LOCATION'), description: get('DESCRIPTION') } };
  }
  let m;
  if ((m = /^mailto:([^?]*)(?:\?(.*))?$/i.exec(trimmed))) {
    const q = new URLSearchParams(m[2] || '');
    return { type: 'email', fields: { to: decodeURIComponent(m[1]), subject: q.get('subject') || '', body: q.get('body') || '' } };
  }
  if ((m = /^MATMSG:(.*)$/i.exec(trimmed))) {
    const f = Object.fromEntries(fieldsOf(m[1]).map(([k, v]) => [k.toUpperCase(), v]));
    return { type: 'email', fields: { to: f.TO || '', subject: f.SUB || '', body: f.BODY || '' } };
  }
  if ((m = /^tel:(.+)$/i.exec(trimmed))) return { type: 'phone', fields: { number: m[1] } };
  if ((m = /^(?:SMSTO|sms):([^:?]*)(?:[:?](?:body=)?(.*))?$/i.exec(trimmed))) return { type: 'sms', fields: { number: m[1], message: decodeURIComponent(m[2] || '') } };
  if ((m = /^geo:(-?[\d.]+),(-?[\d.]+)/i.exec(trimmed))) return { type: 'geo', fields: { lat: m[1], lon: m[2] } };
  if (/^otpauth:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const label = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
      return { type: 'otp', fields: { kind: u.host, label, issuer: u.searchParams.get('issuer') || label.split(':')[0], secret: u.searchParams.get('secret') || '' } };
    } catch (e) { /* plain text */ }
  }
  return { type: 'text', fields: { text: t } };
}

/** Text of a barcode from a content type and its fields (the inverse of parse()). */
export function build(type, f) {
  switch (type) {
    case 'url': return f.url || '';
    case 'wifi': return `WIFI:T:${f.security === 'nopass' ? 'nopass' : f.security || 'WPA'};S:${esc(f.ssid)};${f.security === 'nopass' ? '' : `P:${esc(f.password)};`}${f.hidden ? 'H:true;' : ''};`;
    case 'contact': {
      const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vEsc(f.last)};${vEsc(f.first)};;;`, `FN:${vEsc(f.name || [f.first, f.last].filter(Boolean).join(' '))}`];
      if (f.org) lines.push(`ORG:${vEsc(f.org)}`);
      if (f.title) lines.push(`TITLE:${vEsc(f.title)}`);
      if (f.phone) lines.push(`TEL;TYPE=CELL:${vEsc(f.phone)}`);
      if (f.email) lines.push(`EMAIL:${vEsc(f.email)}`);
      if (f.url) lines.push(`URL:${vEsc(f.url)}`);
      if (f.street || f.city || f.zip || f.country) lines.push(`ADR:;;${vEsc(f.street)};${vEsc(f.city)};;${vEsc(f.zip)};${vEsc(f.country)}`);
      if (f.note) lines.push(`NOTE:${vEsc(f.note)}`);
      lines.push('END:VCARD');
      return lines.join('\n');
    }
    case 'email': {
      const q = [];
      if (f.subject) q.push(`subject=${encodeURIComponent(f.subject)}`);
      if (f.body) q.push(`body=${encodeURIComponent(f.body)}`);
      return `mailto:${f.to || ''}${q.length ? `?${q.join('&')}` : ''}`;
    }
    case 'phone': return `tel:${(f.number || '').replace(/\s+/g, '')}`;
    case 'sms': return `SMSTO:${(f.number || '').replace(/\s+/g, '')}:${f.message || ''}`;
    case 'geo': return `geo:${f.lat || 0},${f.lon || 0}`;
    default: return f.text || '';
  }
}

/** Fields of the generator forms per content type (key, input type). */
export const FORMS = {
  text: [['text', 'textarea']],
  url: [['url', 'url']],
  wifi: [['ssid', 'text'], ['security', ['WPA', 'WEP', 'nopass']], ['password', 'text'], ['hidden', 'checkbox']],
  contact: [['first', 'text'], ['last', 'text'], ['org', 'text'], ['title', 'text'], ['phone', 'tel'], ['email', 'email'], ['url', 'url'], ['street', 'text'], ['zip', 'text'], ['city', 'text'], ['country', 'text'], ['note', 'textarea']],
  email: [['to', 'email'], ['subject', 'text'], ['body', 'textarea']],
  phone: [['number', 'tel']],
  sms: [['number', 'tel'], ['message', 'textarea']],
  geo: [['lat', 'number'], ['lon', 'number']],
};
