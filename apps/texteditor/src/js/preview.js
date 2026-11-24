/*
 * Markdown preview of the text editor: the document rendered with marked, cleaned by DOMPurify, into a sandboxed frame (no
 * scripts run; links do not leave it), updated while typing and scrolled along with the editor. Also "Save as HTML".
 */
import { marked } from "marked";
import DOMPurify from "dompurify";

const STYLE = `
:root { color-scheme: light dark; }
body { font: 15px/1.6 system-ui, "Segoe UI", Roboto, sans-serif; max-width: 52rem; margin: 0 auto; padding: 1rem 1.5rem 3rem; color: #1d2433; background: #fff; overflow-wrap: break-word; }
body.dark { color: #dfe3ea; background: #1b1f26; }
h1, h2 { border-bottom: 1px solid #d0d7de; padding-bottom: .25em; } body.dark h1, body.dark h2 { border-color: #3a4150; }
a { color: #0b62c4; } body.dark a { color: #6cb4ff; }
code { font: .9em ui-monospace, "Cascadia Code", Consolas, monospace; background: rgba(127,127,127,.15); padding: .1em .3em; border-radius: 4px; }
pre { background: rgba(127,127,127,.12); padding: .8em 1em; overflow: auto; border-radius: 6px; } pre code { background: none; padding: 0; }
blockquote { margin: 0; padding: 0 1em; border-left: 4px solid #c3cad3; color: #59636e; } body.dark blockquote { color: #9aa4b2; border-color: #4a5160; }
table { border-collapse: collapse; } th, td { border: 1px solid #c3cad3; padding: .3em .7em; } body.dark th, body.dark td { border-color: #4a5160; }
img { max-width: 100%; } hr { border: 0; border-top: 1px solid #c3cad3; }
input[type=checkbox] { margin-right: .4em; }
`;

function localImages(node) {
  if (node.nodeName !== "IMG") return;
  const src = node.getAttribute("src") || "";
  if (/^(data|blob):/i.test(src)) return;
  node.removeAttribute("src");
  node.removeAttribute("srcset");
  node.setAttribute("alt", `🖼 ${node.getAttribute("alt") || src}`);
  node.setAttribute("title", src);
}

/** The Markdown as a complete HTML page (GitHub-flavoured: tables, task lists, strikethrough). */
export function toHtml(markdown, { title = "", dark = false } = {}) {
  // (scripts, event handlers and frames are removed – the sandboxed frame would not run them anyway; pictures from files or the
  // web cannot be loaded offline: they show their description instead)
  DOMPurify.addHook("afterSanitizeAttributes", localImages);
  let body;
  try { body = DOMPurify.sanitize(marked.parse(markdown, { gfm: true, breaks: false, async: false }), { FORBID_TAGS: ["style", "iframe", "object", "embed", "form"] }); } finally { DOMPurify.removeHook("afterSanitizeAttributes"); }
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body class="${dark ? "dark" : ""}">${body}</body></html>`;
}

/**
 * The preview pane: { host (element), update(markdown, dark), scrollTo(fraction), destroy() }. Updates keep the reader's
 * position (the frame allows same-origin access but no scripts, so its content cannot run anything).
 */
export function createPreview() {
  const host = document.createElement("div");
  host.className = "te-split-pane te-preview";
  host.dataset.testid = "preview";
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.dataset.testid = "preview-frame";
  frame.title = "Preview";
  host.appendChild(frame);
  let last = null, pending = null, fraction = 0;
  const scrollEl = () => { try { return frame.contentDocument && frame.contentDocument.scrollingElement; } catch (e) { return null; } };
  const applyScroll = () => { const el = scrollEl(); if (el) el.scrollTop = fraction * Math.max(0, el.scrollHeight - el.clientHeight); };
  frame.addEventListener("load", applyScroll);
  return {
    host,
    frame,
    update(markdown, dark, title) {
      clearTimeout(pending);
      pending = setTimeout(() => {
        const html = toHtml(markdown, { dark, title });
        if (html === last) return;
        last = html;
        const el = scrollEl();
        if (el && el.scrollHeight > el.clientHeight) fraction = el.scrollTop / (el.scrollHeight - el.clientHeight);
        frame.srcdoc = html;
      }, last === null ? 0 : 150);
    },
    scrollTo(f) { fraction = Math.max(0, Math.min(1, f)); applyScroll(); },
    destroy() { clearTimeout(pending); host.remove(); },
  };
}
