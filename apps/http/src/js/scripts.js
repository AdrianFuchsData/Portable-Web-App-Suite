/*
 * Pre-request scripts and tests (a subset of Postman's `pm` API). Scripts may come from imported collections, so they
 * run in a Worker created from a data: URL: it has an opaque origin (no access to the suite's storage), its own thread
 * (an endless loop is ended after the timeout) and only the request, response and variables it is given.
 *
 *   await runScript(code, { kind: 'prerequest' | 'test', request, response, environment, collection, variables })
 *     -> { tests: [{ name, passed, error }], logs: [{ level, text }], error, environment, collection, variables, request }
 *
 * request: { method, url, headers: [[name, value]], body }; response: { code, status, headers: [[name, value]], body, responseTime }
 */

const RUNTIME = String.raw`
'use strict';
const logs = [], tests = [], pending = [];
const show = (v) => { try { return typeof v === 'string' ? v : JSON.stringify(v); } catch (e) { return String(v); } };
const log = (level) => (...args) => logs.push({ level, text: args.map(show).join(' ') });
self.console = { log: log('log'), info: log('info'), warn: log('warn'), error: log('error'), debug: log('log') };

function store(obj) {
  return {
    get: (k) => obj[k], set: (k, v) => { obj[k] = v == null ? '' : String(v); }, unset: (k) => { delete obj[k]; },
    has: (k) => Object.prototype.hasOwnProperty.call(obj, k), clear: () => { for (const k of Object.keys(obj)) delete obj[k]; },
    toObject: () => ({ ...obj }), replaceIn: (s) => String(s).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, n) => (n in obj ? obj[n] : m)),
  };
}

function headerList(list) {
  const find = (k) => list.findIndex(([n]) => n.toLowerCase() === String(k).toLowerCase());
  return {
    get: (k) => { const i = find(k); return i < 0 ? undefined : list[i][1]; },
    has: (k) => find(k) >= 0,
    add: (h) => { list.push([h.key, String(h.value)]); },
    upsert: (h) => { const i = find(h.key); if (i < 0) list.push([h.key, String(h.value)]); else list[i][1] = String(h.value); },
    remove: (k) => { const i = find(k); if (i >= 0) list.splice(i, 1); },
    toObject: () => Object.fromEntries(list.map(([k, v]) => [k.toLowerCase(), v])),
    all: () => list.map(([key, value]) => ({ key, value })),
  };
}

class AssertionError extends Error { constructor(m) { super(m); this.name = 'AssertionError'; } }
const fmt = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
const deepEqual = (a, b) => {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
};

function expect(value, label = '') {
  let negate = false, deep = false;
  const check = (ok, message) => { if (ok === negate) throw new AssertionError((label ? label + ': ' : '') + 'expected ' + fmt(value) + ' ' + (negate ? 'not ' : '') + message); return chain; };
  const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
  const chain = {
    equal: (x) => (deep ? check(deepEqual(value, x), 'to deeply equal ' + fmt(x)) : check(value === x, 'to equal ' + fmt(x))),
    eql: (x) => check(deepEqual(value, x), 'to deeply equal ' + fmt(x)),
    above: (x) => check(value > x, 'to be above ' + x), below: (x) => check(value < x, 'to be below ' + x),
    least: (x) => check(value >= x, 'to be at least ' + x), most: (x) => check(value <= x, 'to be at most ' + x),
    within: (a, b) => check(value >= a && value <= b, 'to be within ' + a + '..' + b),
    include: (x) => check(typeof value === 'string' ? value.includes(x) : Array.isArray(value) ? value.some((v) => deepEqual(v, x)) : value && typeof x === 'object' ? Object.keys(x).every((k) => deepEqual(value[k], x[k])) : false, 'to include ' + fmt(x)),
    property: (...args) => { const [k, v] = args; return check(value != null && Object.prototype.hasOwnProperty.call(Object(value), k) && (args.length < 2 || deepEqual(value[k], v)), 'to have property ' + fmt(k) + (args.length > 1 ? ' of ' + fmt(v) : '')); },
    lengthOf: (n) => check(value != null && value.length === n, 'to have length ' + n),
    match: (re) => check(re.test(String(value)), 'to match ' + re),
    oneOf: (list) => check(list.some((x) => deepEqual(x, value)), 'to be one of ' + fmt(list)),
    a: (type) => check(typeOf(value) === String(type).toLowerCase(), 'to be a ' + type),
    status: (code) => check(value && value.code === code, 'to have status ' + code),
    header: (k, v) => check(value && value.headers && value.headers.has(k) && (v === undefined || value.headers.get(k) === v), 'to have header ' + k),
  };
  chain.equals = chain.eq = chain.equal; chain.gt = chain.greaterThan = chain.above; chain.lt = chain.lessThan = chain.below;
  chain.gte = chain.least; chain.lte = chain.most; chain.includes = chain.contain = chain.contains = chain.include; chain.an = chain.a; chain.length = chain.lengthOf;
  for (const w of ['to', 'be', 'been', 'is', 'that', 'which', 'and', 'has', 'have', 'with', 'at', 'of', 'same', 'does', 'still']) Object.defineProperty(chain, w, { get: () => chain });
  Object.defineProperty(chain, 'not', { get: () => { negate = !negate; return chain; } });
  Object.defineProperty(chain, 'deep', { get: () => { deep = true; return chain; } });
  const flag = (name, test, message) => Object.defineProperty(chain, name, { get: () => check(test(), message), configurable: true });
  flag('ok', () => !!value, 'to be truthy'); flag('true', () => value === true, 'to be true'); flag('false', () => value === false, 'to be false');
  flag('null', () => value === null, 'to be null'); flag('undefined', () => value === undefined, 'to be undefined');
  flag('exist', () => value != null, 'to exist'); flag('empty', () => value != null && (typeof value === 'object' ? Object.keys(value).length === 0 : value.length === 0), 'to be empty');
  flag('json', () => value && value.json && (() => { try { value.json(); return true; } catch (e) { return false; } })(), 'to be JSON');
  flag('success', () => value && value.code >= 200 && value.code < 300, 'to be successful');
  return chain;
}

self.onmessage = async (event) => {
  const ctx = event.data;
  const env = store(ctx.environment), coll = store(ctx.collection), local = store(ctx.variables);
  const request = { method: ctx.request.method, url: ctx.request.url, headers: headerList(ctx.request.headers), body: { raw: ctx.request.body || '' } };
  let response;
  if (ctx.response) {
    const r = ctx.response;
    response = {
      code: r.code, status: r.status, responseTime: r.responseTime, headers: headerList(r.headers),
      text: () => r.body, json: () => JSON.parse(r.body),
    };
    // pm.response.to.have.status(200), .to.have.header('x'), .to.be.ok (2xx), .to.be.json
    Object.defineProperty(response, 'to', { get: () => { const c = expect(response, 'response'); Object.defineProperty(c, 'ok', { get: () => c.success }); return c; } });
  }
  self.pm = {
    environment: env, collectionVariables: coll, globals: env,
    variables: { ...store(ctx.variables), get: (k) => (local.has(k) ? local.get(k) : env.has(k) ? env.get(k) : coll.get(k)), replaceIn: (s) => coll.replaceIn(env.replaceIn(local.replaceIn(s))) },
    request, response, info: { requestName: ctx.name, eventName: ctx.kind },
    expect,
    test: (name, fn) => {
      try {
        const r = fn();
        if (r && typeof r.then === 'function') pending.push(r.then(() => tests.push({ name, passed: true }), (e) => tests.push({ name, passed: false, error: e.message || String(e) })));
        else tests.push({ name, passed: true });
      } catch (e) { tests.push({ name, passed: false, error: e.message || String(e) }); }
    },
  };
  self.postman = { setEnvironmentVariable: env.set, getEnvironmentVariable: env.get };
  let error = null;
  try { await self.__script(); await Promise.all(pending); } catch (e) { error = (e && e.name ? e.name + ': ' : '') + (e && e.message ? e.message : String(e)); }
  self.postMessage({
    tests, logs, error, environment: env.toObject(), collection: coll.toObject(), variables: local.toObject(),
    request: { method: request.method, url: typeof request.url === 'string' ? request.url : String(request.url), headers: request.headers.all().map((h) => [h.key, h.value]) },
  });
};
`;

export async function runScript(code, context, { timeout = 5000 } = {}) {
  // the user's code becomes the body of an async function (no eval: the source is part of the worker's data: URL)
  const source = `${RUNTIME}\nself.__script = async () => {\n${code}\n};\n`;
  const url = `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
  return new Promise((resolve) => {
    let worker;
    const finish = (result) => { clearTimeout(timer); if (worker) worker.terminate(); resolve(result); };
    const failed = (message) => finish({ tests: [], logs: [], error: message, environment: context.environment, collection: context.collection, variables: context.variables, request: context.request });
    const timer = setTimeout(() => failed(`the script did not finish within ${timeout / 1000} s`), timeout);
    try { worker = new Worker(url); } catch (e) { failed(e.message); return; }
    worker.onmessage = (e) => finish(e.data);
    worker.onerror = (e) => { e.preventDefault(); failed(e.message || 'script error'); };
    worker.postMessage(context);
  });
}
