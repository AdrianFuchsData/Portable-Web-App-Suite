/*
 * Inspector bookmarklet: a small developer-tools panel inside any page (console with log capture and evaluation, element
 * picker, resources, storage, page info). Rules for this file, because it is turned into a javascript: URL: statements end
 * with semicolons, no line comments inside the code, no multi-line template strings (main.js collapses the whitespace).
 */
(function () {
  var W = window, D = document, KEY = '__suiteInspector';
  if (W[KEY]) { W[KEY].toggle(); return; }
  var host = D.createElement('div');
  host.setAttribute('data-suite-inspector', '');
  host.style.cssText = 'all:initial;position:fixed;left:0;right:0;bottom:0;height:45vh;z-index:2147483647;';
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>' +
    '*{box-sizing:border-box}:host{font:12px/1.4 system-ui,sans-serif}' +
    '.p{position:absolute;inset:0;display:flex;flex-direction:column;background:#fff;color:#222;border-top:2px solid #1565c0;box-shadow:0 -2px 12px rgba(0,0,0,.3)}' +
    '.t{display:flex;gap:2px;background:#eceff1;padding:3px;overflow-x:auto}.t button{border:0;background:none;padding:4px 9px;border-radius:4px;font:inherit;cursor:pointer;white-space:nowrap}' +
    '.t button.a{background:#1565c0;color:#fff}.t .x{margin-left:auto}' +
    '.b{flex:1;overflow:auto;padding:4px 6px}.r{border-bottom:1px solid #eee;padding:2px 0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,monospace}' +
    '.warn{background:#fff8e1}.error{background:#ffebee;color:#b71c1c}.in{color:#1565c0}' +
    '.f{display:flex;border-top:1px solid #ddd}.f input{flex:1;border:0;padding:6px;font:12px ui-monospace,monospace;outline:none}' +
    'table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #eee;padding:2px 4px;text-align:left;vertical-align:top;word-break:break-all}th{background:#fafafa}' +
    'button.s{border:1px solid #ccc;background:#fff;border-radius:4px;padding:2px 8px;margin:2px;font:inherit;cursor:pointer}' +
    '</style><div class="p"><div class="t"></div><div class="b"></div><div class="f"><input placeholder="JavaScript" spellcheck="false"></div></div>';
  var tabsEl = root.querySelector('.t'), body = root.querySelector('.b'), form = root.querySelector('.f'), input = form.querySelector('input');
  var logs = [], current = 'console', picked = null, box = null;
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var fmt = function (v, depth) {
    depth = depth || 0;
    try {
      if (v === null) return 'null';
      if (v === undefined) return 'undefined';
      if (typeof v === 'string') return depth ? JSON.stringify(v) : v;
      if (typeof v === 'function') return 'ƒ ' + (v.name || '') + '()';
      if (v instanceof Error) return v.name + ': ' + v.message + (v.stack ? '\n' + v.stack : '');
      if (v instanceof Element) return '<' + v.tagName.toLowerCase() + (v.id ? '#' + v.id : '') + (v.className && typeof v.className === 'string' ? '.' + v.className.trim().split(/\s+/).join('.') : '') + '>';
      if (typeof v !== 'object') return String(v);
      if (depth > 2) return Array.isArray(v) ? '[…]' : '{…}';
      if (Array.isArray(v)) return '[' + v.slice(0, 50).map(function (x) { return fmt(x, depth + 1); }).join(', ') + (v.length > 50 ? ', …' : '') + ']';
      var keys = Object.keys(v).slice(0, 50);
      return '{' + keys.map(function (k) { return k + ': ' + fmt(v[k], depth + 1); }).join(', ') + (Object.keys(v).length > 50 ? ', …' : '') + '}';
    } catch (e) { return String(v); }
  };
  var add = function (kind, args) {
    logs.push({ kind: kind, text: Array.prototype.map.call(args, function (a) { return fmt(a); }).join(' ') });
    if (logs.length > 500) logs.shift();
    if (current === 'console' && api.open) show('console');
  };
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (k) {
    var orig = console[k];
    console[k] = function () { add(k, arguments); return orig.apply(console, arguments); };
  });
  W.addEventListener('error', function (e) { add('error', [e.message + ' (' + (e.filename || '') + ':' + (e.lineno || '') + ')']); });
  W.addEventListener('unhandledrejection', function (e) { add('error', ['Unhandled rejection: ' + fmt(e.reason)]); });
  input.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !input.value.trim()) return;
    var code = input.value;
    input.value = '';
    logs.push({ kind: 'in', text: '› ' + code });
    try { add('log', [(0, eval)(code)]); } catch (err) { add('error', [err]); }
    show('console');
  });
  var table = function (rows, head) {
    return '<table>' + (head ? '<tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr>' : '') +
      rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
  };
  var selector = function (el) {
    var parts = [];
    for (; el && el.nodeType === 1 && parts.length < 6; el = el.parentElement) {
      var s = el.tagName.toLowerCase();
      if (el.id) { parts.unshift(s + '#' + el.id); break; }
      var p = el.parentElement;
      if (p) { var same = Array.prototype.filter.call(p.children, function (c) { return c.tagName === el.tagName; }); if (same.length > 1) s += ':nth-of-type(' + (same.indexOf(el) + 1) + ')'; }
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  var highlight = function (el) {
    if (!box) { box = D.createElement('div'); box.style.cssText = 'all:initial;position:fixed;z-index:2147483646;pointer-events:none;background:rgba(21,101,192,.25);outline:2px solid #1565c0;'; D.documentElement.appendChild(box); }
    if (!el) { box.style.display = 'none'; return; }
    var r = el.getBoundingClientRect();
    box.style.display = 'block'; box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
  };
  var pick = function () {
    var over = function (e) { if (!host.contains(e.target)) highlight(e.target); };
    var click = function (e) {
      if (host.contains(e.target)) return;
      e.preventDefault(); e.stopPropagation();
      D.removeEventListener('mouseover', over, true); D.removeEventListener('click', click, true);
      picked = e.target; host.style.display = ''; show('elements');
    };
    D.addEventListener('mouseover', over, true); D.addEventListener('click', click, true);
    host.style.display = 'none';
  };
  var views = {
    console: function () {
      return logs.map(function (l) { return '<div class="r ' + l.kind + '">' + esc(l.text) + '</div>'; }).join('') + '<div class="r" style="color:#888">' + esc('console.* and errors since the inspector was opened') + '</div>';
    },
    elements: function () {
      var h = '<button class="s" data-a="pick">Pick element</button><button class="s" data-a="parent">Parent</button>';
      if (!picked) return h + '<p>Click "Pick element", then an element of the page.</p>';
      highlight(picked);
      var r = picked.getBoundingClientRect(), cs = getComputedStyle(picked);
      var attrs = Array.prototype.map.call(picked.attributes, function (a) { return [a.name, a.value]; });
      var props = ['display', 'position', 'width', 'height', 'margin', 'padding', 'border', 'font-family', 'font-size', 'color', 'background-color', 'z-index', 'overflow'].map(function (k) { return [k, cs.getPropertyValue(k)]; });
      return h + '<p><b>' + esc(selector(picked)) + '</b><br>' + Math.round(r.width) + ' × ' + Math.round(r.height) + ' at ' + Math.round(r.left) + ', ' + Math.round(r.top) + '</p>' +
        '<h4>Attributes</h4>' + table(attrs) + '<h4>Computed style</h4>' + table(props) +
        '<h4>HTML</h4><div class="r">' + esc(picked.outerHTML.slice(0, 3000)) + (picked.outerHTML.length > 3000 ? '…' : '') + '</div>';
    },
    network: function () {
      var list = performance.getEntriesByType('navigation').concat(performance.getEntriesByType('resource'));
      return '<button class="s" data-a="refresh">Refresh</button>' + table(list.map(function (e) {
        return [e.name, e.initiatorType || e.entryType, e.transferSize != null ? e.transferSize + ' B' : '', Math.round(e.duration) + ' ms'];
      }), ['URL', 'Type', 'Transferred', 'Time']);
    },
    storage: function () {
      var store = function (s) { var out = []; try { for (var i = 0; i < s.length; i++) { var k = s.key(i); out.push([k, String(s.getItem(k)).slice(0, 500)]); } } catch (e) { out.push(['(blocked)', String(e)]); } return out; };
      var cookies = D.cookie ? D.cookie.split(/;\s*/).map(function (c) { var i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }) : [];
      return '<h4>Cookies</h4>' + table(cookies, ['Name', 'Value']) + '<h4>localStorage</h4>' + table(store(W.localStorage), ['Key', 'Value']) + '<h4>sessionStorage</h4>' + table(store(W.sessionStorage), ['Key', 'Value']);
    },
    info: function () {
      var metas = Array.prototype.map.call(D.querySelectorAll('meta'), function (m) { return [m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('http-equiv') || (m.getAttribute('charset') ? 'charset' : ''), m.getAttribute('content') || m.getAttribute('charset') || '']; });
      return table([['URL', location.href], ['Title', D.title], ['User agent', navigator.userAgent], ['Viewport', innerWidth + ' × ' + innerHeight + ' (DPR ' + devicePixelRatio + ')'], ['Language', navigator.language], ['Mode', D.compatMode], ['Elements', String(D.getElementsByTagName('*').length)], ['Scripts', String(D.scripts.length)], ['Ready state', D.readyState]]) +
        '<h4>Meta</h4>' + table(metas, ['Name', 'Content']);
    },
  };
  var show = function (name) {
    current = name;
    Array.prototype.forEach.call(tabsEl.querySelectorAll('button[data-t]'), function (b) { b.className = b.getAttribute('data-t') === name ? 'a' : ''; });
    body.innerHTML = views[name]();
    form.style.display = name === 'console' ? '' : 'none';
    if (name === 'console') body.scrollTop = body.scrollHeight;
    if (name !== 'elements') highlight(null);
  };
  tabsEl.innerHTML = Object.keys(views).map(function (k) { return '<button data-t="' + k + '">' + k[0].toUpperCase() + k.slice(1) + '</button>'; }).join('') + '<button class="x" data-a="close">✕</button>';
  root.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var a = b.getAttribute('data-a'), tab = b.getAttribute('data-t');
    if (tab) show(tab);
    if (a === 'close') api.toggle();
    if (a === 'pick') pick();
    if (a === 'parent' && picked && picked.parentElement) { picked = picked.parentElement; show('elements'); }
    if (a === 'refresh') show('network');
  });
  var api = W[KEY] = {
    open: true,
    toggle: function () { api.open = !api.open; host.style.display = api.open ? '' : 'none'; if (!api.open) highlight(null); else show(current); },
  };
  D.documentElement.appendChild(host);
  show('console');
})();
