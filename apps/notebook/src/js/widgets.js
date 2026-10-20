/*
 * Widgets of the notebook (the page side of shared/js/python-widgets.py): keeps the widget models the kernel sends
 * ({ op: open|update|close, id, model, state }), draws them as controls and sends changes back (kernel.widget).
 *
 *   const widgets = createWidgets({ kernel, render, appendOutput });
 *   kernel option onComm: widgets.onComm      widgets.running(outputs)  // outputs of the cell that runs (owner of new widgets)
 *   html`<${widgets.View} id=${modelId} />`   widgets.setOutputView(Output)
 *   widgets.toMetadata(cells) / widgets.fromMetadata(nb.metadata)      // saved state (application/vnd.jupyter.widget-state+json)
 *   widgets.stop()                                                     // kernel restarted: the controls stay but are inactive
 *
 * Saved and stopped widgets are shown disabled. Outputs of callbacks (print outside an Output widget, errors) go to the
 * cell that created the widget.
 */
const { html } = Suite.shell;
const t = Suite.t;
export const VIEW_MIME = 'application/vnd.jupyter.widget-view+json';
const STATE_MIME = 'application/vnd.jupyter.widget-state+json';

Suite.i18n.register({
  en: { 'w.inactive': 'Run the cell again to use this widget.', 'w.play': 'Play', 'w.pause': 'Pause', 'w.unknown': 'Widget {0} (not supported here)' },
  de: { 'w.inactive': 'Führen Sie die Zelle erneut aus, um dieses Widget zu verwenden.', 'w.play': 'Abspielen', 'w.pause': 'Pause', 'w.unknown': 'Widget {0} (hier nicht unterstützt)' },
});

const ref = (v) => (typeof v === 'string' && v.startsWith('IPY_MODEL_') ? v.slice(10) : v);
const modelName = (m) => String(m || '').replace(/Model$/, '');

export function createWidgets({ kernel, render, appendOutput }) {
  const models = new Map(); // id -> { model, state, live }
  const owners = new Map(); // id -> outputs list of the creating cell
  let current = null; // outputs of the running cell or widget event
  let OutputView = () => null;
  const timers = new Map(); // Play widgets

  function onComm(msg) {
    if (msg.op === 'open') {
      models.set(msg.id, { model: msg.model, state: msg.state, live: true });
      if (current) owners.set(msg.id, current);
    } else if (msg.op === 'update') {
      const m = models.get(msg.id);
      if (m) m.state = { ...m.state, ...msg.state };
    } else if (msg.op === 'close') models.delete(msg.id);
    render();
  }

  // changes are sent one after another; while one is processed, only the latest value per widget waits
  const waiting = new Map();
  let sending = false;
  async function pump() {
    if (sending) return;
    sending = true;
    while (waiting.size) {
      const [key, ev] = waiting.entries().next().value;
      waiting.delete(key);
      const outputs = owners.get(ev.id) || null;
      const before = current;
      current = outputs;
      try {
        await kernel.widget(ev.id, ev.data, (o) => { if (outputs) appendOutput(outputs, o); });
      } catch (e) { console.warn(e); }
      current = before;
    }
    sending = false;
  }

  function send(id, data, local = data) {
    const m = models.get(id);
    if (!m || !m.live) return;
    m.state = { ...m.state, ...local }; // shown at once
    render();
    waiting.set(data.click || data.submit ? `${id}:${Math.random()}` : `${id}:${Object.keys(data).join()}`, { id, data });
    pump();
  }

  // ---- views ------------------------------------------------------------------------------------------------------

  const fmt = (v, f) => {
    if (typeof v !== 'number') return String(v ?? '');
    const m = /\.(\d+)f/.exec(f || '');
    return m ? v.toFixed(Number(m[1])) : String(Math.round(v * 1e6) / 1e6);
  };

  function Labelled({ s, children, id }) {
    return html`<div class="nb-w-row" title=${s.tooltip || null}>${s.description ? html`<label class="nb-w-desc" for=${`nbw-${id}`}>${s.description}</label>` : null}${children}</div>`;
  }

  function style(s) {
    const l = s.layout || {};
    const out = {};
    for (const k of ['width', 'height', 'max_width', 'min_width', 'margin', 'padding']) if (l[k]) out[k.replace('_', '-')] = l[k];
    return out;
  }

  function View({ id }) {
    const m = models.get(ref(id));
    if (!m) return null;
    const s = m.state;
    const off = !m.live || !!s.disabled;
    const name = modelName(m.model);
    const key = ref(id);
    const common = { id: `nbw-${key}`, disabled: off, 'aria-label': s.description || null };
    const value = (v) => send(key, { value: v });
    const body = (() => {
      switch (name) {
        case 'IntSlider': case 'FloatSlider': case 'FloatLogSlider': {
          const log = name === 'FloatLogSlider';
          const pos = log ? Math.log(s.value) / Math.log(s.base || 10) : s.value;
          const conv = (x) => (log ? (s.base || 10) ** x : name === 'IntSlider' ? parseInt(x, 10) : parseFloat(x));
          return html`<${Labelled} s=${s} id=${key}><input type="range" class="nb-w-slider" ...${common} min=${s.min} max=${s.max} step=${s.step} value=${pos}
            data-testid="widget-slider" onInput=${(e) => { if (s.continuous_update !== false) value(conv(e.target.value)); }} onChange=${(e) => value(conv(e.target.value))} />
            ${s.readout !== false ? html`<output class="nb-w-readout">${fmt(s.value, s.readout_format)}</output>` : null}</${Labelled}>`;
        }
        case 'IntRangeSlider': case 'FloatRangeSlider': {
          const [lo, hi] = s.value || [s.min, s.max];
          const conv = (x) => (name === 'IntRangeSlider' ? parseInt(x, 10) : parseFloat(x));
          return html`<${Labelled} s=${s} id=${key}><span class="nb-w-range">
            <input type="range" ...${common} min=${s.min} max=${s.max} step=${s.step} value=${lo} data-testid="widget-range-low" onInput=${(e) => value([conv(e.target.value), hi].sort((a, b) => a - b))} />
            <input type="range" disabled=${off} aria-label=${s.description || null} min=${s.min} max=${s.max} step=${s.step} value=${hi} data-testid="widget-range-high" onInput=${(e) => value([lo, conv(e.target.value)].sort((a, b) => a - b))} /></span>
            <output class="nb-w-readout">${fmt(lo)} – ${fmt(hi)}</output></${Labelled}>`;
        }
        case 'IntText': case 'FloatText': case 'BoundedIntText': case 'BoundedFloatText':
          return html`<${Labelled} s=${s} id=${key}><input type="number" class="nb-w-input" ...${common} min=${s.min ?? null} max=${s.max ?? null} step=${s.step ?? 'any'} value=${s.value}
            data-testid="widget-number" onChange=${(e) => value(name.includes('Int') ? parseInt(e.target.value, 10) || 0 : parseFloat(e.target.value) || 0)} /></${Labelled}>`;
        case 'Text': case 'Password':
          return html`<${Labelled} s=${s} id=${key}><input type=${name === 'Password' ? 'password' : 'text'} class="nb-w-input" ...${common} placeholder=${s.placeholder || ''} value=${s.value}
            data-testid="widget-text" onInput=${(e) => { if (s.continuous_update !== false) value(e.target.value); }} onChange=${(e) => value(e.target.value)}
            onKeyDown=${(e) => { if (e.key === 'Enter') send(key, { value: e.target.value, submit: true }, { value: e.target.value }); }} /></${Labelled}>`;
        case 'Textarea':
          return html`<${Labelled} s=${s} id=${key}><textarea class="nb-w-input" ...${common} rows=${s.rows || 3} placeholder=${s.placeholder || ''} value=${s.value}
            data-testid="widget-textarea" onInput=${(e) => { if (s.continuous_update !== false) value(e.target.value); }} onChange=${(e) => value(e.target.value)}></textarea></${Labelled}>`;
        case 'Checkbox':
          return html`<label class="nb-w-check"><input type="checkbox" ...${common} checked=${!!s.value} data-testid="widget-checkbox" onChange=${(e) => value(e.target.checked)} /> ${s.description}</label>`;
        case 'ToggleButton':
          return html`<button class=${`nb-w-button ${s.value ? '' : 'outline'} ${s.button_style || ''}`} ...${common} aria-pressed=${s.value ? 'true' : 'false'} data-testid="widget-toggle"
            onClick=${() => value(!s.value)}>${s.description}</button>`;
        case 'Button':
          return html`<button class=${`nb-w-button ${s.button_style || ''}`} ...${common} aria-label=${null} title=${s.tooltip || null} data-testid="widget-button"
            onClick=${() => send(key, { click: true }, {})}>${s.description || ' '}</button>`;
        case 'Dropdown': case 'Select':
          return html`<${Labelled} s=${s} id=${key}><select class="nb-w-input" ...${common} size=${name === 'Select' ? s.rows || 5 : null} data-testid="widget-dropdown"
            onChange=${(e) => send(key, { index: Number(e.target.value) }, { index: Number(e.target.value) })}>
            ${s.index == null ? html`<option value="" selected></option>` : null}
            ${(s._options_labels || []).map((l, i) => html`<option value=${i} selected=${i === s.index}>${l}</option>`)}</select></${Labelled}>`;
        case 'SelectMultiple':
          return html`<${Labelled} s=${s} id=${key}><select multiple class="nb-w-input" ...${common} size=${s.rows || 5} data-testid="widget-multi"
            onChange=${(e) => { const index = [...e.target.selectedOptions].map((o) => Number(o.value)); send(key, { index }, { index }); }}>
            ${(s._options_labels || []).map((l, i) => html`<option value=${i} selected=${(s.index || []).includes(i)}>${l}</option>`)}</select></${Labelled}>`;
        case 'RadioButtons':
          return html`<fieldset class="nb-w-radios" disabled=${off} data-testid="widget-radios">${s.description ? html`<legend>${s.description}</legend>` : null}
            ${(s._options_labels || []).map((l, i) => html`<label><input type="radio" name=${`nbw-${key}`} checked=${i === s.index} onChange=${() => send(key, { index: i }, { index: i })} /> ${l}</label>`)}</fieldset>`;
        case 'ToggleButtons':
          return html`<${Labelled} s=${s} id=${key}><span class="nb-w-toggles" role="group" aria-label=${s.description || null} data-testid="widget-toggles">
            ${(s._options_labels || []).map((l, i) => html`<button class=${i === s.index ? 'nb-w-button' : 'nb-w-button outline'} disabled=${off} aria-pressed=${i === s.index ? 'true' : 'false'}
              onClick=${() => send(key, { index: i }, { index: i })}>${l}</button>`)}</span></${Labelled}>`;
        case 'SelectionSlider': {
          const labels = s._options_labels || [];
          return html`<${Labelled} s=${s} id=${key}><input type="range" class="nb-w-slider" ...${common} min="0" max=${Math.max(0, labels.length - 1)} step="1" value=${s.index ?? 0}
            data-testid="widget-selection-slider" onInput=${(e) => send(key, { index: Number(e.target.value) }, { index: Number(e.target.value) })} />
            <output class="nb-w-readout">${labels[s.index] ?? ''}</output></${Labelled}>`;
        }
        case 'ColorPicker':
          return html`<${Labelled} s=${s} id=${key}><input type="color" ...${common} value=${/^#[0-9a-f]{6}$/i.test(s.value) ? s.value : '#000000'} data-testid="widget-color" onInput=${(e) => value(e.target.value)} /></${Labelled}>`;
        case 'DatePicker':
          return html`<${Labelled} s=${s} id=${key}><input type="date" class="nb-w-input" ...${common} value=${s.value || ''} data-testid="widget-date" onChange=${(e) => value(e.target.value || null)} /></${Labelled}>`;
        case 'IntProgress': case 'FloatProgress':
          return html`<${Labelled} s=${s} id=${key}><progress class=${`nb-w-progress ${s.bar_style || ''}`} id=${`nbw-${key}`} aria-label=${s.description || null} max=${s.max - s.min} value=${s.value - s.min} data-testid="widget-progress"></progress></${Labelled}>`;
        case 'Label':
          return html`<span class="nb-w-label" data-testid="widget-label">${s.description ? `${s.description} ` : ''}${s.value}</span>`;
        case 'HTML': case 'HTMLMath':
          return html`<${Labelled} s=${s} id=${key}><div class="nb-w-html nb-html" data-testid="widget-html" dangerouslySetInnerHTML=${{ __html: Suite.notebookClean ? Suite.notebookClean(String(s.value || '')) : '' }}></div></${Labelled}>`;
        case 'Play': {
          const playing = timers.has(key);
          const toggle = () => {
            if (playing) { clearInterval(timers.get(key)); timers.delete(key); render(); return; }
            timers.set(key, setInterval(() => {
              const cur = models.get(key);
              if (!cur || !cur.live) { clearInterval(timers.get(key)); timers.delete(key); render(); return; }
              let next = cur.state.value + cur.state.step;
              if (next > cur.state.max) { if (cur.state.repeat) next = cur.state.min; else { clearInterval(timers.get(key)); timers.delete(key); render(); return; } }
              send(key, { value: next });
            }, Math.max(20, s.interval || 100)));
            render();
          };
          return html`<${Labelled} s=${s} id=${key}><button class="nb-w-button outline" ...${common} aria-label=${t(playing ? 'w.pause' : 'w.play')} title=${t(playing ? 'w.pause' : 'w.play')} data-testid="widget-play" onClick=${toggle}>${playing ? '⏸' : '▶'}</button>
            <output class="nb-w-readout">${s.value}</output></${Labelled}>`;
        }
        case 'Box': case 'HBox': case 'VBox': case 'GridBox':
          return html`<div class=${`nb-w-${name.toLowerCase()}`} data-testid="widget-box">${(s.children || []).map((c) => html`<${View} id=${c} key=${c} />`)}</div>`;
        case 'Tab': case 'Accordion': {
          const children = s.children || [];
          const titles = s.titles || [];
          if (name === 'Accordion') {
            return html`<div class="nb-w-accordion" data-testid="widget-accordion">${children.map((c, i) => html`<details open=${s.selected_index === i} key=${c}
              onToggle=${(e) => { if (e.target.open && s.selected_index !== i) send(key, { selected_index: i }); }}><summary>${titles[i] || `${i + 1}`}</summary><${View} id=${c} /></details>`)}</div>`;
          }
          const sel = s.selected_index ?? 0;
          return html`<div class="nb-w-tab" data-testid="widget-tab"><div role="tablist" class="nb-w-tabs">${children.map((c, i) => html`<button role="tab" key=${c} aria-selected=${i === sel ? 'true' : 'false'}
              class=${i === sel ? 'nb-w-button' : 'nb-w-button outline'} onClick=${() => { if (m.live) send(key, { selected_index: i }); else { m.state = { ...s, selected_index: i }; render(); } }}>${titles[i] || `${i + 1}`}</button>`)}</div>
            ${children[sel] ? html`<div role="tabpanel"><${View} id=${children[sel]} /></div>` : null}</div>`;
        }
        case 'Output':
          return html`<div class="nb-w-output" data-testid="widget-output">${(s.outputs || []).map((o) => html`<${OutputView} o=${o} />`)}</div>`;
        default:
          return html`<span class="nb-w-unknown">${t('w.unknown', name)}</span>`;
      }
    })();
    return html`<div class="nb-w" style=${style(s)} data-model=${name} title=${m.live ? null : t('w.inactive')}>${body}</div>`;
  }

  // ---- saving ------------------------------------------------------------------------------------------------------

  /** The state of the widgets shown in these outputs (and their children), for notebook metadata. */
  function toMetadata(outputLists) {
    const state = {};
    const visit = (id) => {
      id = ref(id);
      const m = models.get(id);
      if (!m || state[id]) return;
      state[id] = { model_name: `${modelName(m.model)}Model`, model_module: '@jupyter-widgets/controls', model_module_version: '2.0.0', state: m.state };
      for (const c of m.state.children || []) visit(c);
      for (const o of m.state.outputs || []) visitOutput(o);
    };
    const visitOutput = (o) => { const v = o && o.data && o.data[VIEW_MIME]; if (v) visit(v.model_id); };
    for (const list of outputLists) for (const o of list) visitOutput(o);
    return Object.keys(state).length ? { [STATE_MIME]: { version_major: 2, version_minor: 0, state } } : null;
  }

  function fromMetadata(metadata) {
    const saved = metadata && metadata.widgets && metadata.widgets[STATE_MIME];
    for (const [id, entry] of Object.entries((saved && saved.state) || {})) {
      if (entry && entry.state) models.set(id, { model: modelName(entry.model_name), state: entry.state, live: false });
    }
  }

  function stop() {
    for (const m of models.values()) m.live = false;
    for (const timer of timers.values()) clearInterval(timer);
    timers.clear();
    render();
  }

  return {
    onComm, View, toMetadata, fromMetadata, stop, send,
    has: (id) => models.has(ref(id)),
    running(outputs) { current = outputs; },
    setOutputView(view) { OutputView = view; },
    models,
  };
}
