/*
 * OpenAPI 3.x and Swagger 2.0 descriptions (JSON or YAML) as a collection: one folder per tag, one request per operation
 * with {{baseUrl}}, path parameters as {{variables}}, required/example query parameters and headers, an example JSON body
 * generated from the schema, and Basic/Bearer authorization from the security schemes.
 *
 *   fromOpenApi(text) -> collection
 */
import yaml from 'js-yaml';
import { newRequest, newId } from '@app/model.js';

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

export function parseSpec(text) {
  const doc = /^\s*\{/.test(text) ? JSON.parse(text) : yaml.load(text);
  if (!doc || typeof doc !== 'object' || (!doc.openapi && !doc.swagger) || !doc.paths) throw new Error('not an OpenAPI or Swagger description');
  return doc;
}

/** Resolve a local $ref (#/components/…), with protection against cycles. */
function deref(doc, node, seen = new Set()) {
  if (!node || typeof node !== 'object' || !node.$ref) return node;
  if (seen.has(node.$ref) || !node.$ref.startsWith('#/')) return {};
  seen.add(node.$ref);
  const target = node.$ref.slice(2).split('/').reduce((o, k) => (o ? o[k.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined), doc);
  return deref(doc, target, seen) || {};
}

/** An example value for a schema (example/default/enum first, then by type; depth-limited). */
export function exampleOf(doc, schema, depth = 0, seen = new Set()) {
  const ref = schema && schema.$ref;
  if (ref && seen.has(ref)) return {};
  const s = deref(doc, schema);
  if (!s || depth > 6) return null;
  const next = ref ? new Set([...seen, ref]) : seen;
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
  if (s.allOf) return Object.assign({}, ...s.allOf.map((x) => exampleOf(doc, x, depth + 1, next)).filter((x) => x && typeof x === 'object'));
  if (s.oneOf || s.anyOf) return exampleOf(doc, (s.oneOf || s.anyOf)[0], depth + 1, next);
  const type = Array.isArray(s.type) ? s.type.find((x) => x !== 'null') : s.type || (s.properties ? 'object' : s.items ? 'array' : 'string');
  switch (type) {
    case 'object': {
      const out = {};
      for (const [k, v] of Object.entries(s.properties || {})) out[k] = exampleOf(doc, v, depth + 1, next);
      return out;
    }
    case 'array': return [exampleOf(doc, s.items || {}, depth + 1, next)];
    case 'integer': return s.minimum ?? 0;
    case 'number': return s.minimum ?? 0;
    case 'boolean': return true;
    default:
      return s.format === 'date-time' ? '2026-01-01T00:00:00Z' : s.format === 'date' ? '2026-01-01' : s.format === 'uuid' ? '00000000-0000-0000-0000-000000000000'
        : s.format === 'email' ? 'user@example.org' : 'string';
  }
}

function baseUrl(doc) {
  if (doc.swagger) return `${(doc.schemes && doc.schemes[0]) || 'https'}://${doc.host || 'localhost'}${doc.basePath || ''}`.replace(/\/$/, '');
  const server = (doc.servers && doc.servers[0]) || { url: '/' };
  // server variables get their defaults
  return server.url.replace(/\{(\w+)\}/g, (m, k) => (server.variables && server.variables[k] && server.variables[k].default) || m).replace(/\/$/, '');
}

function authOf(doc, op) {
  const schemes = (doc.components && doc.components.securitySchemes) || doc.securityDefinitions || {};
  const requirements = op.security || doc.security || [];
  for (const req of requirements) {
    for (const name of Object.keys(req)) {
      const s = deref(doc, schemes[name]);
      if (!s) continue;
      if ((s.type === 'http' && s.scheme === 'basic') || s.type === 'basic') return { type: 'basic', username: '{{username}}', password: '{{password}}', token: '' };
      if ((s.type === 'http' && /bearer/i.test(s.scheme)) || s.type === 'oauth2' || s.type === 'openIdConnect') return { type: 'bearer', username: '', password: '', token: '{{token}}' };
      if (s.type === 'apiKey' && s.in === 'header') return { header: { key: s.name, value: `{{${s.name.replace(/[^\w.-]/g, '_')}}}`, enabled: true } };
    }
  }
  return null;
}

export function fromOpenApi(text) {
  const doc = parseSpec(text);
  const folders = new Map();
  const loose = [];
  const pathVars = new Set();
  for (const [path, item] of Object.entries(doc.paths || {})) {
    const pathItem = deref(doc, item);
    const shared = pathItem.parameters || [];
    for (const method of METHODS) {
      const op = pathItem[method];
      if (!op) continue;
      const params = [...shared, ...(op.parameters || [])].map((p) => deref(doc, p));
      const url = `{{baseUrl}}${path.replace(/\{([^}]+)\}/g, (m, k) => { pathVars.add(k); return `{{${k}}}`; })}`;
      const query = params.filter((p) => p.in === 'query' && (p.required || p.example !== undefined || (p.schema && p.schema.example !== undefined)));
      const qs = query.map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(String(p.example ?? exampleOf(doc, p.schema || { type: p.type }) ?? ''))}`).join('&');
      const req = newRequest({ name: op.summary || op.operationId || `${method.toUpperCase()} ${path}`, method: method.toUpperCase(), url: qs ? `${url}?${qs}` : url });
      req.headers = params.filter((p) => p.in === 'header').map((p) => ({ key: p.name, value: String(p.example ?? exampleOf(doc, p.schema || { type: p.type }) ?? ''), enabled: !!p.required }));
      // request body: OpenAPI 3 requestBody, Swagger 2 "in: body" / formData parameters
      const body = deref(doc, op.requestBody);
      const content = body && body.content ? body.content : null;
      const jsonType = content && Object.keys(content).find((t) => /json/i.test(t));
      const swaggerBody = params.find((p) => p.in === 'body');
      if (jsonType || swaggerBody) {
        const media = jsonType ? content[jsonType] : null;
        const example = media && media.example !== undefined ? media.example : media && media.examples ? deref(doc, Object.values(media.examples)[0]).value : exampleOf(doc, media ? media.schema : swaggerBody.schema);
        req.body = { ...req.body, mode: 'raw', language: 'json', raw: JSON.stringify(example, null, 2) };
      } else if (content && content['application/x-www-form-urlencoded']) {
        const schema = deref(doc, content['application/x-www-form-urlencoded'].schema) || {};
        req.body = { ...req.body, mode: 'urlencoded', fields: Object.entries(schema.properties || {}).map(([key, v]) => ({ key, value: String(exampleOf(doc, v) ?? ''), enabled: true, type: 'text' })) };
      } else if (content && content['multipart/form-data']) {
        const schema = deref(doc, content['multipart/form-data'].schema) || {};
        req.body = { ...req.body, mode: 'formdata', fields: Object.entries(schema.properties || {}).map(([key, v]) => { const d = deref(doc, v) || {}; const file = d.format === 'binary'; return { key, value: file ? '' : String(exampleOf(doc, v) ?? ''), enabled: true, type: file ? 'file' : 'text' }; }) };
      }
      const auth = authOf(doc, op);
      if (auth && auth.header) req.headers.push(auth.header); else if (auth) req.auth = auth;
      const tag = (op.tags && op.tags[0]) || null;
      if (!tag) { loose.push(req); continue; }
      if (!folders.has(tag)) folders.set(tag, { type: 'folder', id: newId(), name: tag, items: [] });
      folders.get(tag).items.push(req);
    }
  }
  const variables = [{ key: 'baseUrl', value: baseUrl(doc), enabled: true }, ...[...pathVars].map((key) => ({ key, value: '', enabled: true }))];
  return { name: (doc.info && doc.info.title) || 'API', items: [...folders.values(), ...loose], variables };
}
