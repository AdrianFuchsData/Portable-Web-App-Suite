/*
 * Accessibility check of the web inspector with axe-core (vendor/axe, embedded as text). The page's HTML – without its own
 * scripts and event handlers, with its resources as in the preview – is rendered in a hidden iframe with
 * sandbox="allow-scripts" (an opaque origin: no access to the inspector or its storage), together with axe-core and a small
 * runner; the runner posts the results back.
 *
 * Rule titles and descriptions come from axe's German locale when lang is 'de'.
 *   await checkAccessibility(html, { lang: 'de' | 'en', width, height, timeout }) ->
 *     { violations: [{ id, impact, help, description, helpUrl, tags, nodes: [{ target, html, summary }] }], incomplete, passes: n, inapplicable: n, version }
 */

const IMPACT = ['critical', 'serious', 'moderate', 'minor'];

/** The page without scripts, inline event handlers and javascript: URLs (only the HTML and CSS are checked). */
export function staticHtml(source) {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  for (const el of doc.querySelectorAll('script, noscript[data-wi-ignore]')) el.remove();
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      else if (/^(href|src|action|formaction)$/i.test(attr.name) && /^\s*javascript:/i.test(attr.value)) el.setAttribute(attr.name, '#');
    }
  }
  for (const m of doc.querySelectorAll('meta[http-equiv]')) if (/refresh|content-security-policy/i.test(m.getAttribute('http-equiv'))) m.remove();
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

const inline = (code) => code.replace(/<\/script/gi, '<\\/script');

export function checkAccessibility(source, { lang = 'en', width = 1280, height = 800, timeout = 60000 } = {}) {
  const axe = document.getElementById('axe-core').textContent;
  const locale = lang === 'de' ? document.getElementById('axe-de').textContent : null;
  const runner = `(async () => {
    try {
      const r = await axe.run(document, { resultTypes: ['violations', 'incomplete'], reporter: 'v2' });
      const slim = (list) => list.map((x) => ({ id: x.id, impact: x.impact, help: x.help, description: x.description, helpUrl: x.helpUrl, tags: x.tags,
        nodes: x.nodes.map((n) => ({ target: n.target, html: n.html, summary: n.failureSummary || '' })) }));
      parent.postMessage({ axeResult: { violations: slim(r.violations), incomplete: slim(r.incomplete), passes: r.passes.length, inapplicable: r.inapplicable.length, version: axe.version } }, '*');
    } catch (e) { parent.postMessage({ axeError: String(e && e.message || e) }, '*'); }
  })();`;
  const page = staticHtml(source);
  const doc = page.replace(/<\/body>(?![\s\S]*<\/body>)/i, `<script>${inline(axe)}</script><script>${inline(runner)}</script></body>`);
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = `position:fixed;left:-${width + 100}px;top:0;width:${width}px;height:${height}px;border:0;visibility:hidden`;
    const done = (fn, value) => { clearTimeout(timer); window.removeEventListener('message', onMessage); frame.remove(); fn(value); };
    const onMessage = (e) => {
      if (e.source !== frame.contentWindow || !e.data) return;
      if (e.data.axeResult) {
        const r = e.data.axeResult;
        r.violations.sort((a, b) => IMPACT.indexOf(a.impact) - IMPACT.indexOf(b.impact));
        // translated titles and descriptions of the rules (axe.configure({ locale }) compiles templates with Function(), which the
        // CSP does not allow; the per-element hints stay in English)
        if (locale) {
          const rules = JSON.parse(locale).rules || {};
          for (const x of [...r.violations, ...r.incomplete]) if (rules[x.id]) Object.assign(x, { help: rules[x.id].help || x.help, description: rules[x.id].description || x.description });
        }
        done(resolve, r);
      } else if (e.data.axeError) done(reject, new Error(e.data.axeError));
    };
    const timer = setTimeout(() => done(reject, new Error('the accessibility check did not finish')), timeout);
    window.addEventListener('message', onMessage);
    frame.srcdoc = doc;
    document.body.append(frame);
  });
}

export { IMPACT };
