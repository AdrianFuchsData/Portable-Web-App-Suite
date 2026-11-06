/*
 * The notebook's Terminal tab: xterm.js with a line editor for the shell of shared/js/python-shell.py (suite.shell), which
 * runs in the Python worker on the Pyodide file system. The page edits the line (cursor keys, Home/End, history with ↑/↓,
 * Tab completion, Ctrl+C, Ctrl+L, Ctrl+U, Ctrl+A/E), sends it to Python and writes the output; the interactive programs
 * less and nano run here on the alternate screen, with the text handed over by the shell.
 *
 *   const term = createTerminal({ kernel, onFilesChanged });
 *   term.attach(element);   term.fit();   term.focus();
 */
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

const MIME = 'application/vnd.suite.terminal+json';
const ESC = '\x1b';
const CSI = `${ESC}[`;
const crlf = (s) => s.replace(/\r?\n/g, '\r\n');

/** Width of a line on the screen with tabs expanded to the next multiple of 4. */
function expand(line, upto = line.length) {
  let col = 0;
  for (let i = 0; i < upto; i++) col = line[i] === '\t' ? col + 4 - (col % 4) : col + 1;
  return col;
}
const expandText = (line) => line.replace(/[^\t]*\t/g, (m) => m.slice(0, -1) + ' '.repeat(4 - ((expand(m.slice(0, -1))) % 4)));

export function createTerminal({ kernel, onFilesChanged = () => {}, t = (k) => k }) {
  const term = new Terminal({ convertEol: false, cursorBlink: true, fontSize: 14, scrollback: 5000, theme: {} });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const host = document.createElement('div');
  host.className = 'nb-terminal';
  host.dataset.testid = 'terminal';
  let opened = false;
  let cwd = '/home/pyodide';
  let line = '';
  let cursor = 0;
  const history = [];
  let historyIndex = -1;
  let busy = false;
  let mode = null; // an interactive program: { onData(data) }
  let pendingInput = [];

  const prompt = () => `\x1b[32mpyodide\x1b[0m:\x1b[34m${cwd.replace(/^\/home\/pyodide/, '~')}\x1b[0m$ `;

  function redraw() {
    term.write(`\r${CSI}K${prompt()}${line}`);
    const back = line.length - cursor;
    if (back > 0) term.write(`${CSI}${back}D`);
  }

  /** Run Python code; stream outputs; the terminal answer (MIME) is returned. */
  async function python(code, { echo = true } = {}) {
    let answer = null;
    await kernel.ready;
    await kernel.run(code, 0, (o) => {
      if (o.output_type === 'stream') { if (echo) term.write(crlf(o.text).replace(/\x1b\[2J\x1b\[H/, '\x1b[2J\x1b[H')); }
      else if (o.output_type === 'error') { if (echo) term.write(`\x1b[31m${crlf((o.traceback || []).join('') || `${o.ename}: ${o.evalue}`)}\x1b[0m`); }
      else if (o.data && o.data[MIME]) answer = o.data[MIME];
    });
    return answer;
  }

  async function execute(text) {
    term.write('\r\n');
    if (text.trim()) { history.push(text); historyIndex = -1; }
    busy = true;
    try {
      const answer = await python(`import suite.shell as _suite_shell\nawait _suite_shell._terminal(${JSON.stringify(text)})`);
      if (answer) {
        cwd = answer.cwd || cwd;
        if (answer.interactive) await interactive(answer.interactive);
      }
    } catch (e) {
      term.write(`\x1b[31m${crlf(String(e.message || e))}\x1b[0m\r\n`);
    } finally {
      busy = false;
      onFilesChanged();
      line = '';
      cursor = 0;
      term.write(prompt());
      const queued = pendingInput;
      pendingInput = [];
      for (const d of queued) onData(d);
    }
  }

  async function complete() {
    const before = line.slice(0, cursor);
    const answer = await python(`import suite.shell as _suite_shell\n_suite_shell._complete(${JSON.stringify(before)})`, { echo: false });
    if (!answer || !answer.candidates.length) { term.write('\x07'); return; }
    const { word, candidates } = answer;
    let common = candidates[0];
    for (const c of candidates) { let i = 0; while (i < common.length && c[i] === common[i]) i++; common = common.slice(0, i); }
    if (candidates.length === 1 || common.length > word.length) {
      const add = (candidates.length === 1 ? candidates[0] : common).slice(word.length);
      line = line.slice(0, cursor) + add + line.slice(cursor);
      cursor += add.length;
      redraw();
    } else {
      term.write(`\r\n${candidates.map((c) => c.trimEnd()).join('  ')}\r\n`);
      redraw();
    }
  }

  function onData(data) {
    if (mode) { mode.onData(data); return; }
    if (busy) {
      if (data === '\x03') { if (kernel.canInterrupt) kernel.interrupt(); term.write('^C'); return; }
      pendingInput.push(data);
      return;
    }
    // escape sequences
    const keys = { [`${CSI}A`]: 'up', [`${CSI}B`]: 'down', [`${CSI}C`]: 'right', [`${CSI}D`]: 'left', [`${CSI}H`]: 'home', [`${CSI}F`]: 'end',
      [`${ESC}OH`]: 'home', [`${ESC}OF`]: 'end', [`${CSI}1~`]: 'home', [`${CSI}4~`]: 'end', [`${CSI}3~`]: 'delete' };
    const key = keys[data];
    if (key === 'left') { if (cursor > 0) { cursor--; term.write(data); } return; }
    if (key === 'right') { if (cursor < line.length) { cursor++; term.write(data); } return; }
    if (key === 'home') { cursor = 0; redraw(); return; }
    if (key === 'end') { cursor = line.length; redraw(); return; }
    if (key === 'delete') { if (cursor < line.length) { line = line.slice(0, cursor) + line.slice(cursor + 1); redraw(); } return; }
    if (key === 'up' || key === 'down') {
      if (!history.length) return;
      if (key === 'up') historyIndex = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
      else historyIndex = historyIndex < 0 ? -1 : historyIndex + 1 >= history.length ? -1 : historyIndex + 1;
      line = historyIndex < 0 ? '' : history[historyIndex];
      cursor = line.length;
      redraw();
      return;
    }
    if (data.startsWith(ESC)) return;
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      if (ch === '\r') {
        const text = line;
        const rest = data.slice(i + 1).replace(/^\n/, '');
        if (rest) pendingInput.push(rest);
        execute(text);
        return;
      }
      if (ch === '\n') continue;
      if (ch === '\x7f' || ch === '\b') { if (cursor > 0) { line = line.slice(0, cursor - 1) + line.slice(cursor); cursor--; redraw(); } continue; }
      if (ch === '\t') { complete(); continue; }
      if (ch === '\x03') { term.write('^C\r\n'); line = ''; cursor = 0; term.write(prompt()); continue; }
      if (ch === '\x0c') { term.write(`${CSI}2J${CSI}H`); redraw(); continue; }
      if (ch === '\x15') { line = line.slice(cursor); cursor = 0; redraw(); continue; }
      if (ch === '\x01') { cursor = 0; redraw(); continue; }
      if (ch === '\x05') { cursor = line.length; redraw(); continue; }
      if (ch < ' ') continue;
      line = line.slice(0, cursor) + ch + line.slice(cursor);
      cursor++;
      if (cursor === line.length) term.write(ch); else redraw();
    }
  }

  // ---- less --------------------------------------------------------------------------------------------------------

  function less({ title, text }) {
    return new Promise((resolve) => {
      const lines = [];
      const width = () => Math.max(10, term.cols);
      const wrap = () => {
        lines.length = 0;
        for (const raw of text.replace(/\n$/, '').split('\n')) {
          const l = expandText(raw);
          if (!l.length) lines.push('');
          for (let i = 0; i < l.length; i += width()) lines.push(l.slice(i, i + width()));
        }
      };
      wrap();
      let top = 0;
      let search = null;
      let message = '';
      let input = null; // the search being typed
      const rows = () => Math.max(1, term.rows - 1);
      const draw = () => {
        let s = `${CSI}H${CSI}2J`;
        for (let r = 0; r < rows(); r++) {
          const l = lines[top + r];
          if (l === undefined) { s += `\x1b[2m~\x1b[0m\r\n`; continue; }
          s += (search ? l.replace(search, (m) => `\x1b[7m${m}\x1b[0m`) : l) + '\r\n';
        }
        const end = top + rows() >= lines.length;
        const info = `${message || `${title} ${end ? '(END)' : `${Math.round(((top + rows()) / Math.max(1, lines.length)) * 100)}%`}`} — q: ${t('nb.termQuit')}`;
        s += input !== null ? `/${input}`.slice(0, term.cols - 1) : `\x1b[7m${info.slice(0, term.cols - 1)}\x1b[0m`;
        term.write(s);
        message = '';
      };
      const find = (from, dir) => {
        if (!search) return;
        for (let i = from; i >= 0 && i < lines.length; i += dir) {
          search.lastIndex = 0;
          if (search.test(lines[i])) { top = Math.min(i, Math.max(0, lines.length - rows())); return; }
        }
        message = t('nb.termNotFound');
      };
      const scroll = (n) => { top = Math.max(0, Math.min(Math.max(0, lines.length - rows()), top + n)); };
      mode = {
        onData(data) {
          // (pasted text: one key after the other)
          if (data.length > 1 && !data.startsWith(ESC)) { for (const ch of data) this.onData(ch); return; }
          if (input !== null) {
            if (data === '\r') {
              try { search = input ? new RegExp(input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : search; } catch (e) { search = null; }
              input = null;
              find(top + 1, 1);
            } else if (data === '\x7f') input = input.slice(0, -1);
            else if (data === ESC || data === '\x03') input = null;
            else if (data >= ' ') input += data;
            draw();
            return;
          }
          const k = { [`${CSI}A`]: 'up', [`${CSI}B`]: 'down', [`${CSI}5~`]: 'pgup', [`${CSI}6~`]: 'pgdn', [`${CSI}H`]: 'home', [`${CSI}F`]: 'end' }[data] || data;
          if (k === 'q' || k === 'Q' || k === '\x03') {
            mode = null;
            term.write(`${CSI}?1049l`);
            resolve();
            return;
          }
          if (k === 'down' || k === 'j' || k === '\r' || k === 'e') scroll(1);
          else if (k === 'up' || k === 'k' || k === 'y') scroll(-1);
          else if (k === ' ' || k === 'pgdn' || k === 'f' || k === '\x06') scroll(rows());
          else if (k === 'pgup' || k === 'b' || k === '\x02') scroll(-rows());
          else if (k === 'd') scroll(Math.floor(rows() / 2));
          else if (k === 'u') scroll(-Math.floor(rows() / 2));
          else if (k === 'g' || k === '<' || k === 'home') top = 0;
          else if (k === 'G' || k === '>' || k === 'end') scroll(lines.length);
          else if (k === '/') input = '';
          else if (k === 'n') find(top + 1, 1);
          else if (k === 'N') find(top - 1, -1);
          draw();
        },
      };
      term.write(`${CSI}?1049h`);
      draw();
    });
  }

  // ---- nano --------------------------------------------------------------------------------------------------------

  function nano({ path, text }) {
    return new Promise((resolve) => {
      const lines = text.replace(/\n$/, '').split('\n');
      let row = 0;
      let col = 0;
      let top = 0;
      let left = 0;
      let modified = false;
      let cut = [];
      let lastCut = false;
      let status = t('nb.termNanoHelp');
      let ask = null; // { label, value, done(value) }
      const name = path.split('/').pop();
      const rows = () => Math.max(1, term.rows - 3);
      const clamp = () => {
        row = Math.max(0, Math.min(lines.length - 1, row));
        col = Math.max(0, Math.min(lines[row].length, col));
        if (row < top) top = row;
        if (row >= top + rows()) top = row - rows() + 1;
        const x = expand(lines[row], col);
        if (x < left) left = Math.max(0, x - 8);
        if (x >= left + term.cols) left = x - term.cols + 8;
      };
      const draw = () => {
        clamp();
        const cols = term.cols;
        const header = `  nano  ${name}${modified ? '  ' + t('nb.termModified') : ''}`;
        let s = `${CSI}H${CSI}2J\x1b[7m${header.padEnd(cols).slice(0, cols)}\x1b[0m\r\n`;
        for (let r = 0; r < rows(); r++) {
          const l = lines[top + r];
          s += l === undefined ? '\r\n' : `${expandText(l).slice(left, left + cols)}\r\n`;
        }
        // (status and help are cut to the width: a wrapped line would scroll the screen, e.g. on phones)
        s += ask ? `\x1b[7m${ask.label}\x1b[0m ${ask.value}`.slice(0, cols + 8) : `\x1b[7m${status.slice(0, cols)}\x1b[0m`;
        const help = `^O ${t('nb.termSave')}  ^X ${t('nb.termExit')}  ^W ${t('nb.termSearch')}  ^K ${t('nb.termCut')}  ^U ${t('nb.termPaste')}`;
        s += `\r\n\x1b[2m${help.slice(0, cols - 1)}\x1b[0m`;
        if (ask) s += `${CSI}${term.rows - 1};${ask.label.length + ask.value.length + 2}H`;
        else s += `${CSI}${row - top + 2};${expand(lines[row], col) - left + 1}H`;
        term.write(s);
      };
      const save = async () => {
        const content = lines.join('\n') + '\n';
        try {
          await kernel.writeFile(path, new TextEncoder().encode(content));
          modified = false;
          status = t('nb.termWrote', lines.length);
          onFilesChanged();
        } catch (e) { status = String(e.message || e); }
        draw();
      };
      const exit = () => {
        mode = null;
        term.write(`${CSI}?1049l`);
        resolve();
      };
      const prompt = (label, value, done) => { ask = { label, value, done }; draw(); };
      mode = {
        onData(data) {
          if (ask && data.length > 1 && !data.startsWith(ESC)) { for (const ch of data) this.onData(ch); return; } // (pasted)
          if (ask) {
            if (data === '\r') { const a = ask; ask = null; a.done(a.value); return; }
            if (data === '\x03' || data === ESC) { ask = null; status = t('nb.termCancelled'); draw(); return; }
            if (data === '\x7f') ask.value = ask.value.slice(0, -1);
            else if (data >= ' ' && !data.startsWith(ESC)) ask.value += data;
            draw();
            return;
          }
          const k = { [`${CSI}A`]: 'up', [`${CSI}B`]: 'down', [`${CSI}C`]: 'right', [`${CSI}D`]: 'left', [`${CSI}H`]: 'home', [`${CSI}F`]: 'end',
            [`${ESC}OH`]: 'home', [`${ESC}OF`]: 'end', [`${CSI}5~`]: 'pgup', [`${CSI}6~`]: 'pgdn', [`${CSI}3~`]: 'delete' }[data] || data;
          const wasCut = lastCut;
          lastCut = false;
          if (k === 'up') row--;
          else if (k === 'down') row++;
          else if (k === 'left') { if (col > 0) col--; else if (row > 0) { row--; col = lines[row].length; } }
          else if (k === 'right') { if (col < lines[row].length) col++; else if (row < lines.length - 1) { row++; col = 0; } }
          else if (k === 'home' || k === '\x01') col = 0;
          else if (k === 'end' || k === '\x05') col = lines[row].length;
          else if (k === 'pgup' || k === '\x19') row -= rows();
          else if (k === 'pgdn' || k === '\x16') row += rows();
          else if (k === '\x0f' || k === '\x13') { // ^O, ^S
            prompt(`${t('nb.termFileName')}:`, path, (value) => { path = value; save(); });
            return;
          } else if (k === '\x18') { // ^X
            if (!modified) { exit(); return; }
            prompt(t('nb.termSaveChanges'), '', (value) => { if (/^[yYjJ]/.test(value)) save().then(exit); else if (/^[nN]/.test(value)) exit(); else { status = t('nb.termCancelled'); draw(); } });
            return;
          } else if (k === '\x17') { // ^W
            prompt(`${t('nb.termSearch')}:`, '', (value) => {
              if (value) {
                for (let i = 0; i < lines.length; i++) {
                  const r = (row + i + (i === 0 ? 0 : 0)) % lines.length;
                  const from = r === row ? col + 1 : 0;
                  const at = lines[r].toLowerCase().indexOf(value.toLowerCase(), from);
                  if (at >= 0) { row = r; col = at; status = ''; draw(); return; }
                }
                status = t('nb.termNotFound');
              }
              draw();
            });
            return;
          } else if (k === '\x0b') { // ^K
            cut = wasCut ? cut.concat(lines.splice(row, 1)) : lines.splice(row, 1);
            if (!lines.length) lines.push('');
            modified = true;
            lastCut = true;
            col = 0;
          } else if (k === '\x15') { // ^U
            if (cut.length) { lines.splice(row, 0, ...cut); row += cut.length; col = 0; modified = true; }
          } else if (k === '\r') {
            const l = lines[row];
            lines.splice(row, 1, l.slice(0, col), l.slice(col));
            row++;
            col = 0;
            modified = true;
          } else if (k === '\x7f' || k === '\b') {
            if (col > 0) { lines[row] = lines[row].slice(0, col - 1) + lines[row].slice(col); col--; modified = true; }
            else if (row > 0) { col = lines[row - 1].length; lines[row - 1] += lines[row]; lines.splice(row, 1); row--; modified = true; }
          } else if (k === 'delete' || k === '\x04') {
            if (col < lines[row].length) { lines[row] = lines[row].slice(0, col) + lines[row].slice(col + 1); modified = true; }
            else if (row < lines.length - 1) { lines[row] += lines[row + 1]; lines.splice(row + 1, 1); modified = true; }
          } else if (!k.startsWith(ESC)) {
            const text = k.replace(/\r\n?/g, '\n');
            for (const ch of text) {
              if (ch === '\n') { const l = lines[row]; lines.splice(row, 1, l.slice(0, col), l.slice(col)); row++; col = 0; }
              else if (ch === '\t' || ch >= ' ') { lines[row] = lines[row].slice(0, col) + ch + lines[row].slice(col); col++; }
            }
            modified = true;
          }
          status = status === t('nb.termNanoHelp') || !modified ? status : '';
          draw();
        },
      };
      term.write(`${CSI}?1049h`);
      draw();
    });
  }

  function interactive(request) {
    if (request.action === 'less') return less(request);
    if (request.action === 'nano') return nano(request);
    return Promise.resolve();
  }

  term.onData((d) => onData(d));

  return {
    element: host,
    attach(el) {
      if (host.parentElement !== el) el.replaceChildren(host);
      if (!opened) {
        term.open(host);
        opened = true;
        term.write(`${t('nb.termWelcome')}\r\n${prompt()}`);
      }
      requestAnimationFrame(() => { try { fit.fit(); } catch (e) { /* hidden */ } term.focus(); });
    },
    fit() { try { fit.fit(); } catch (e) { /* hidden */ } },
    focus() { term.focus(); },
    /** For tests: type text as if from the keyboard. */
    input(data) { onData(data); },
    get busy() { return busy; },
    get mode() { return mode ? 'interactive' : null; },
    term,
  };
}
