/*
 * Colour picker of the suite: a dialog with a saturation/brightness area, hue and opacity sliders, hex and RGB(A) fields,
 * recently used and basic colours and – where the browser has one – an eyedropper.
 *
 *   const hex = await Suite.colors.pick({ value: '#66ccff', alpha: false, anchor: element, onInput: (hex) => … });
 *   // '#rrggbb' (or '#rrggbbaa' with alpha and opacity below 100 %), null when cancelled
 *
 * Every <input type="color"> of the suite opens this dialog instead of the browser's (the input gets the value and its
 * input/change events), unless the global setting chooses the browser's own picker (suite.colors.native = "1") or the
 * input is inside [data-native-color]. With the browser's picker, pick() uses a hidden <input type="color"> (no opacity:
 * the original opacity is kept).
 */
(function (Suite) {
  'use strict';

  const KEYS = { native: 'suite.colors.native', recent: 'suite.colors.recent' };
  const RECENT_MAX = 16;
  const BASIC = ['#000000', '#404040', '#808080', '#c0c0c0', '#ffffff', '#ff0000', '#ff8000', '#ffff00', '#80ff00', '#00ff00', '#00ff80', '#00ffff',
    '#0080ff', '#0000ff', '#8000ff', '#ff00ff', '#ff0080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#a0522d'];

  Suite.i18n.register({
    en: {
      'col.title': 'Colour', 'col.area': 'Saturation and brightness', 'col.hue': 'Hue', 'col.alpha': 'Opacity', 'col.hex': 'Hex', 'col.old': 'Previous colour',
      'col.new': 'New colour', 'col.eyedropper': 'Pick a colour from the screen', 'col.recent': 'Recently used', 'col.basic': 'Basic colours',
      'col.ok': 'OK', 'col.cancel': 'Cancel', 'col.setting': 'Colour picker', 'col.own': 'The suite’s own (opacity, recent colours, eyedropper)', 'col.browser': 'The browser’s own',
    },
    de: {
      'col.title': 'Farbe', 'col.area': 'Sättigung und Helligkeit', 'col.hue': 'Farbton', 'col.alpha': 'Deckkraft', 'col.hex': 'Hex', 'col.old': 'Bisherige Farbe',
      'col.new': 'Neue Farbe', 'col.eyedropper': 'Eine Farbe vom Bildschirm aufnehmen', 'col.recent': 'Zuletzt verwendet', 'col.basic': 'Grundfarben',
      'col.ok': 'OK', 'col.cancel': 'Abbrechen', 'col.setting': 'Farbauswahl', 'col.own': 'Die der Suite (Deckkraft, zuletzt verwendete Farben, Pipette)', 'col.browser': 'Die des Browsers',
    },
  });

  const read = (key, fallback = null) => { try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch (e) { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch (e) { /* storage blocked */ } };
  const session = {};
  const settings = { get native() { return 'native' in session ? session.native : read(KEYS.native) === '1'; } };
  function setNative(on) { session.native = !!on; write(KEYS.native, on ? '1' : '0'); }

  // ---- colour maths ------------------------------------------------------------------------------------------------

  /** '#6cf', '#6cff', '#66ccff', '#66ccffff' -> { r, g, b, a } (0–255), or null. */
  function parse(hex) {
    const m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 255 };
  }
  const two = (n) => Math.round(n).toString(16).padStart(2, '0');
  /** { r, g, b, a } -> '#rrggbb' or '#rrggbbaa' (with alpha and a < 255). */
  const format = ({ r, g, b, a }, alpha) => `#${two(r)}${two(g)}${two(b)}${alpha && a < 255 ? two(a) : ''}`;

  function rgbToHsv({ r, g, b }) {
    const R = r / 255, G = g / 255, B = b / 255;
    const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
    let h = 0;
    if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
  }
  function hsvToRgb({ h, s, v }) {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return { r: Math.round(f(5) * 255), g: Math.round(f(3) * 255), b: Math.round(f(1) * 255) };
  }

  const recent = () => { try { const v = JSON.parse(read(KEYS.recent, '[]')); return Array.isArray(v) ? v.filter((c) => parse(c)) : []; } catch (e) { return []; } };
  const remember = (hex) => write(KEYS.recent, JSON.stringify([hex, ...recent().filter((c) => c.toLowerCase() !== hex.toLowerCase())].slice(0, RECENT_MAX)));

  // ---- dialog ------------------------------------------------------------------------------------------------------

  function el(tag, props = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'dataset') Object.assign(e.dataset, v);
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in e && !['role', 'list'].includes(k)) e[k] = v;
      else e.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c != null) e.append(c);
    return e;
  }

  let open = null; // { close(result) } of the dialog that is open

  /** Open the colour dialog. Resolves to the chosen colour or null. */
  function pick({ value = '#000000', alpha = false, anchor = null, title = '', onInput = null } = {}) {
    if (open) open.close(null);
    if (settings.native) return pickNative({ value, alpha, anchor, onInput });
    return new Promise((resolve) => {
      const start = parse(value) || { r: 0, g: 0, b: 0, a: 255 };
      let hsv = rgbToHsv(start);
      let a = start.a;
      const rgba = () => ({ ...hsvToRgb(hsv), a });
      const current = () => format(rgba(), alpha);

      const area = el('div', { className: 'suite-color-area', role: 'slider', tabIndex: 0, 'aria-label': Suite.t('col.area'), dataset: { testid: 'color-area' } },
        [el('div', { className: 'suite-color-area-thumb' })]);
      const hue = el('div', { className: 'suite-color-hue', role: 'slider', tabIndex: 0, 'aria-label': Suite.t('col.hue'), 'aria-valuemin': '0', 'aria-valuemax': '360', dataset: { testid: 'color-hue' } },
        [el('div', { className: 'suite-color-slider-thumb' })]);
      const opacity = alpha ? el('div', { className: 'suite-color-alpha', role: 'slider', tabIndex: 0, 'aria-label': Suite.t('col.alpha'), 'aria-valuemin': '0', 'aria-valuemax': '100', dataset: { testid: 'color-alpha' } },
        [el('div', { className: 'suite-color-alpha-fill' }), el('div', { className: 'suite-color-slider-thumb' })]) : null;
      const oldSwatch = el('span', { className: 'suite-color-old', title: Suite.t('col.old'), style: `--c:${format(start, true)}`, dataset: { testid: 'color-old' }, onClick: () => set(start) });
      const newSwatch = el('span', { className: 'suite-color-new', title: Suite.t('col.new'), dataset: { testid: 'color-new' } });
      const hexInput = el('input', { className: 'suite-color-hex', value: '', spellcheck: false, autocomplete: 'off', 'aria-label': Suite.t('col.hex'), dataset: { testid: 'color-hex' }, 'data-no-symbols': '' });
      const channels = (alpha ? ['r', 'g', 'b', 'a'] : ['r', 'g', 'b']).map((c) => el('input', { type: 'number', min: '0', max: c === 'a' ? '100' : '255', className: 'suite-color-channel',
        'aria-label': c === 'a' ? `${Suite.t('col.alpha')} (%)` : c.toUpperCase(), title: c === 'a' ? `${Suite.t('col.alpha')} (%)` : c.toUpperCase(), dataset: { testid: `color-${c}` } }));
      const eyedropper = 'EyeDropper' in window ? el('button', { type: 'button', className: 'secondary outline suite-color-eyedropper', title: Suite.t('col.eyedropper'), 'aria-label': Suite.t('col.eyedropper'),
        dataset: { testid: 'color-eyedropper' }, onClick: async () => { try { const r = await new window.EyeDropper().open(); set({ ...parse(r.sRGBHex), a }); } catch (e) { /* cancelled */ } } }, '💧') : null;
      const swatch = (hex) => el('button', { type: 'button', className: 'suite-color-swatch', title: hex, 'aria-label': hex, style: `--c:${hex}`, dataset: { testid: 'color-swatch', color: hex },
        onClick: () => set({ ...parse(hex), a: parse(hex).a < 255 ? parse(hex).a : a }), onDblclick: () => finish(true) });
      const ok = el('button', { type: 'button', dataset: { testid: 'color-ok' }, onClick: () => finish(true) }, Suite.t('col.ok'));
      const cancel = el('button', { type: 'button', className: 'secondary', dataset: { testid: 'color-cancel' }, onClick: () => finish(false) }, Suite.t('col.cancel'));
      const recentColors = recent();
      const root = el('div', { className: 'suite-color', role: 'dialog', 'aria-label': title || Suite.t('col.title'), dataset: { testid: 'color-picker' } }, [
        area, hue, opacity,
        el('div', { className: 'suite-color-row' }, [el('span', { className: 'suite-color-compare' }, [oldSwatch, newSwatch]), hexInput, eyedropper]),
        el('div', { className: 'suite-color-row suite-color-channels' }, channels),
        recentColors.length ? el('div', { className: 'suite-color-swatches', role: 'group', 'aria-label': Suite.t('col.recent'), dataset: { testid: 'color-recent' } }, recentColors.map(swatch)) : null,
        el('div', { className: 'suite-color-swatches', role: 'group', 'aria-label': Suite.t('col.basic') }, BASIC.map(swatch)),
        el('div', { className: 'suite-color-buttons' }, [cancel, ok]),
      ]);

      let shown = false; // the first rendering does not report a change
      function render(skip) {
        const c = rgba();
        const hex = current();
        area.style.setProperty('--hue', `hsl(${hsv.h} 100% 50%)`);
        area.firstChild.style.left = `${hsv.s * 100}%`;
        area.firstChild.style.top = `${(1 - hsv.v) * 100}%`;
        area.setAttribute('aria-valuetext', `${Math.round(hsv.s * 100)} %, ${Math.round(hsv.v * 100)} %`);
        hue.firstChild.style.left = `${(hsv.h / 360) * 100}%`;
        hue.setAttribute('aria-valuenow', String(Math.round(hsv.h)));
        if (opacity) {
          opacity.style.setProperty('--solid', format({ ...c, a: 255 }, false));
          opacity.lastChild.style.left = `${(a / 255) * 100}%`;
          opacity.setAttribute('aria-valuenow', String(Math.round((a / 255) * 100)));
        }
        newSwatch.style.setProperty('--c', format(c, true));
        if (skip !== hexInput) hexInput.value = hex;
        channels.forEach((input) => { if (input !== skip) input.value = input.dataset.testid === 'color-a' ? Math.round((a / 255) * 100) : c[input.dataset.testid.slice(-1)]; });
        if (onInput && shown) onInput(hex);
      }
      function set(c, skip) {
        const s = rgbToHsv(c);
        // keep the hue (and saturation) where they are undefined (grey, black)
        hsv = { h: s.s && s.v ? s.h : hsv.h, s: s.v ? s.s : hsv.s, v: s.v };
        if (c.a != null) a = c.a;
        render(skip);
      }

      // pointer and keys on the area and sliders
      const drag = (target, fn) => {
        target.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          target.focus();
          target.setPointerCapture(e.pointerId);
          const move = (ev) => { const r = target.getBoundingClientRect(); fn(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height))); render(); };
          move(e);
          target.onpointermove = move;
          target.onpointerup = () => { target.onpointermove = null; target.onpointerup = null; };
        });
      };
      drag(area, (x, y) => { hsv = { ...hsv, s: x, v: 1 - y }; });
      drag(hue, (x) => { hsv = { ...hsv, h: Math.min(359.9, x * 360) }; });
      if (opacity) drag(opacity, (x) => { a = Math.round(x * 255); });
      const keys = (target, fn) => target.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 10 : 1;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step], PageUp: [0, 10], PageDown: [0, -10] }[e.key];
        if (!d) return;
        e.preventDefault();
        fn(d[0], d[1]);
        render();
      });
      keys(area, (dx, dy) => { hsv = { ...hsv, s: Math.max(0, Math.min(1, hsv.s + dx / 100)), v: Math.max(0, Math.min(1, hsv.v + dy / 100)) }; });
      keys(hue, (dx, dy) => { hsv = { ...hsv, h: (hsv.h + dx + dy + 360) % 360 }; });
      if (opacity) keys(opacity, (dx, dy) => { a = Math.max(0, Math.min(255, Math.round(a + ((dx + dy) * 255) / 100))); });

      hexInput.addEventListener('input', () => { const c = parse(hexInput.value); if (c) set(alpha ? c : { ...c, a }, hexInput); });
      channels.forEach((input) => input.addEventListener('input', () => {
        const v = Math.max(0, Math.min(Number(input.max), Number(input.value) || 0));
        const c = rgba();
        const key = input.dataset.testid.slice(-1);
        if (key === 'a') c.a = Math.round((v / 100) * 255); else c[key] = v;
        set(c, input);
      }));

      root.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
        else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); finish(true); }
      });

      const outside = (e) => { if (!root.contains(e.target)) finish(false); };
      function finish(accept) {
        if (!open || open.root !== root) return;
        open = null;
        document.removeEventListener('pointerdown', outside, true);
        root.remove();
        const hex = current();
        if (accept) remember(hex); else if (onInput) onInput(format(start, alpha));
        if (anchor && anchor.isConnected && anchor.focus) anchor.focus();
        resolve(accept ? hex : null);
      }
      open = { root, close: (r) => finish(r != null) };

      document.body.append(root);
      render();
      shown = true;
      place(root, anchor);
      setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
      area.focus();
    });
  }

  function place(root, anchor) {
    if (window.innerWidth < 600) { root.classList.add('sheet'); return; }
    const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: window.innerWidth / 2 - 130, top: window.innerHeight / 3, bottom: window.innerHeight / 3 };
    const w = root.offsetWidth, h = root.offsetHeight;
    root.style.left = `${Math.min(Math.max(8, r.left), window.innerWidth - w - 8)}px`;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    root.style.top = `${top}px`;
  }

  /** The browser's picker through a hidden <input type="color"> (keeps the opacity of the value). */
  function pickNative({ value, alpha, anchor, onInput }) {
    return new Promise((resolve) => {
      const start = parse(value) || { r: 0, g: 0, b: 0, a: 255 };
      const input = el('input', { type: 'color', className: 'suite-color-native', value: format({ ...start, a: 255 }, false), dataset: { testid: 'color-native' } });
      input.setAttribute('data-native-color', '');
      const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 0, bottom: 0 };
      input.style.cssText = `position:fixed;left:${r.left}px;top:${r.bottom}px;width:1px;height:1px;opacity:0;`;
      document.body.append(input);
      const result = () => format({ ...parse(input.value), a: start.a }, alpha);
      input.addEventListener('input', () => { if (onInput) onInput(result()); });
      input.addEventListener('change', () => { remember(result()); input.remove(); resolve(result()); });
      open = { root: input, close: () => { input.remove(); resolve(null); open = null; } };
      try { input.showPicker(); } catch (e) { input.click(); }
    });
  }

  // ---- every <input type="color"> of the suite -----------------------------------------------------------------------

  document.addEventListener('click', (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'color' || input.disabled || settings.native || input.closest('[data-native-color]')) return;
    e.preventDefault();
    const original = input.value;
    const fire = (type) => input.dispatchEvent(new Event(type, { bubbles: true }));
    pick({ value: original, anchor: input, title: input.getAttribute('aria-label') || input.title || '',
      onInput: (hex) => { if (input.value !== hex) { input.value = hex; fire('input'); } } })
      .then((hex) => {
        if (hex == null) { if (input.value !== original) { input.value = original; fire('input'); } return; }
        input.value = hex;
        fire('input');
        if (hex !== original) fire('change');
      });
  }, true);

  window.addEventListener('storage', (e) => { if (e.key === KEYS.native) delete session.native; });

  Suite.colors = { KEYS, settings, setNative, pick, parse, format, rgbToHsv, hsvToRgb, get isOpen() { return !!open; } };
})(window.Suite = window.Suite || {});
