/*
 * The suite's icons: Lucide icons (vendor/icons/icons.json, ISC licence, tools/vendor_icons.py) drawn as inline SVG in the
 * current text colour, so that they look the same in every browser and system (emoji and many symbol characters do not, and
 * some fonts lack them). Every app embeds the icon data (vendor/icons/icons.json) as a text script element with the id
 * "suite-icons" (build.py inlines it).
 *
 *   html`<button>${Suite.icon('save')} ${t('save')}</button>`      a Preact element (1em, aligned with the text)
 *   Suite.icon('save', { size: 20, label: 'Save', class: 'x' })      a size in px, an accessible name (otherwise aria-hidden)
 *   Suite.icons.svg('save')                                          the same as SVG markup (for code outside Preact)
 *   Suite.icons.has('save'); Suite.icons.names()
 * An unknown name gives an empty icon (and a warning in the console).
 */
(function (Suite) {
  'use strict';

  let data = null;
  function icons() {
    if (data) return data;
    const el = document.getElementById('suite-icons');
    try { data = el && el.textContent.trim() ? JSON.parse(el.textContent) : {}; } catch (e) { data = {}; }
    return data;
  }

  const warned = new Set();
  function inner(name) {
    const d = icons()[name];
    if (d === undefined && !warned.has(name)) { warned.add(name); console.warn(`Suite.icon: no icon "${name}"`); }
    return d || '';
  }

  function attrs(name, { size = null, label = null, cls = '' } = {}) {
    const a = {
      class: `suite-icon suite-icon-${name}${cls ? ` ${cls}` : ''}`, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', focusable: 'false',
    };
    if (size) { a.width = String(size); a.height = String(size); }
    if (label) { a.role = 'img'; a['aria-label'] = label; } else a['aria-hidden'] = 'true';
    return a;
  }

  /** A Preact element of the icon. */
  function icon(name, options = {}) {
    const a = attrs(name, { size: options.size, label: options.label, cls: options.class });
    return htmPreact.h('svg', { ...a, dangerouslySetInnerHTML: { __html: inner(name) } });
  }

  const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  /** The icon as SVG markup. */
  function svg(name, options = {}) {
    const a = attrs(name, { size: options.size, label: options.label, cls: options.class });
    return `<svg ${Object.entries(a).map(([k, v]) => `${k}="${escape(v)}"`).join(' ')}>${inner(name)}</svg>`;
  }

  Suite.icon = icon;
  Suite.icons = { svg, has: (name) => Object.prototype.hasOwnProperty.call(icons(), name), names: () => Object.keys(icons()) };
})(window.Suite = window.Suite || {});
