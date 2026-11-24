/*
 * CSV import and export of the KeePass editor.
 *   KP.csv.parse / stringify: Suite.csv (shared/js/csv.js)
 *   KP.csv.columns(header) -> [{ index, name, field }]: which column becomes which entry field; the headers of KeePassXC, KeePass,
 *     Bitwarden, Chrome/Edge, Firefox, Safari, LastPass, 1Password, Dashlane, Proton Pass and others are recognised, other columns
 *     become additional fields
 *   KP.csv.records(rows) -> { columns, records: [{ group, fields: { Title, UserName, … }, tags, otp }] }
 *   KP.csv.EXPORT_HEADER: the columns of the export (the KeePassXC layout plus tags)
 */
(function (KP) {
  'use strict';

  const { parse, stringify } = Suite.csv;

  // normalised header (lower case, letters and digits only) -> field
  const NAMES = {
    Title: ['title', 'name', 'account', 'accountname', 'item', 'itemname', 'entry', 'description', 'site', 'sitename', 'titel', 'bezeichnung'],
    UserName: ['username', 'loginname', 'login', 'user', 'loginusername', 'userid', 'username1', 'email', 'emailaddress', 'loginemail', 'benutzername', 'benutzer', 'anmeldename'],
    Password: ['password', 'loginpassword', 'pass', 'pwd', 'passwort', 'kennwort'],
    URL: ['url', 'website', 'websiteaddress', 'loginuri', 'uri', 'urls', 'link', 'webaddress', 'domain', 'origin', 'hostname', 'adresse'],
    Notes: ['notes', 'note', 'comments', 'comment', 'extra', 'notizen', 'notiz', 'bemerkung', 'memo'],
    group: ['group', 'folder', 'grouping', 'category', 'path', 'vault', 'groupe', 'gruppe', 'ordner', 'kategorie'],
    otp: ['totp', 'otp', 'otpauth', 'logintotp', 'onetimepassword', 'otpsecret', 'totpsecret', 'authenticatorkey', 'twofactorsecret', 'otpurl'],
    tags: ['tags', 'tag', 'labels', 'label'],
  };
  // columns without meaning for KeePass
  const IGNORE = new Set(['httprealm', 'formactionorigin', 'guid', 'timecreated', 'timelastused', 'timepasswordchanged', 'favorite', 'fav', 'reprompt', 'type',
    'icon', 'lastmodified', 'created', 'archived', 'modified', 'createdat', 'updatedat', 'lastused', 'passwordchanged', 'uuid', 'id', 'itemid', 'vaultid', 'shared']);
  const norm = (h) => String(h).toLowerCase().replace(/[^a-z0-9äöü]/g, '');

  /** Which column becomes which field (the first column for a field wins; later ones become additional fields). */
  function columns(header) {
    const taken = new Set();
    return header.map((name, index) => {
      const n = norm(name);
      let field = Object.keys(NAMES).find((f) => NAMES[f].includes(n) && !taken.has(f)) || null;
      if (field) taken.add(field);
      else if (IGNORE.has(n) || !n) field = '';
      else field = `custom:${String(name).trim()}`;
      return { index, name: String(name).trim(), field };
    });
  }

  const looksLikeHeader = (row) => row.some((c) => Object.values(NAMES).some((list) => list.includes(norm(c))));
  const hostOf = (url) => { try { return new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };

  /** An otpauth:// URI for a CSV OTP value (a URI already, or a Base32 secret). */
  function otpUri(value, title, user) {
    const v = String(value || '').trim();
    if (!v) return '';
    if (/^otpauth:\/\//i.test(v)) return v;
    const secret = v.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z2-7]+=*$/.test(secret)) return '';
    const label = encodeURIComponent(`${title || 'Entry'}${user ? `:${user}` : ''}`);
    return `otpauth://totp/${label}?secret=${secret}${title ? `&issuer=${encodeURIComponent(title)}` : ''}`;
  }

  /** Rows (the first one the header) as entries. Rows without any value are skipped. */
  function records(rows) {
    if (!rows.length) return { columns: [], records: [] };
    const header = looksLikeHeader(rows[0]) ? rows[0] : ['Title', 'UserName', 'Password', 'URL', 'Notes'].slice(0, rows[0].length);
    const cols = columns(header);
    const body = header === rows[0] ? rows.slice(1) : rows;
    const out = [];
    for (const row of body) {
      if (!row.some((c) => c && c.trim())) continue;
      const fields = { Title: '', UserName: '', Password: '', URL: '', Notes: '' };
      let group = '', tags = [], otp = '';
      for (const c of cols) {
        const v = row[c.index] ?? '';
        if (!c.field || v === '') continue;
        if (c.field === 'group') group = v.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        else if (c.field === 'tags') tags = v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
        else if (c.field === 'otp') otp = v;
        else if (c.field.startsWith('custom:')) fields[c.field.slice(7)] = v;
        else fields[c.field] = v;
      }
      if (!fields.Title) fields.Title = hostOf(fields.URL) || fields.UserName || '';
      out.push({ group, fields, tags, otp: otpUri(otp, fields.Title, fields.UserName) });
    }
    return { columns: cols, records: out };
  }

  const EXPORT_HEADER = ['Group', 'Title', 'Username', 'Password', 'URL', 'Notes', 'TOTP', 'Tags', 'Last Modified', 'Created'];

  KP.csv = { parse, stringify, columns, records, otpUri, EXPORT_HEADER };
})(window.KP = window.KP || {});
