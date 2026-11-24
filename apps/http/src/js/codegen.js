/*
 * Code for a request in other languages and tools. Input: the built request { method, url, headers: [[name, value]], body } (with
 * the variables filled in). Text bodies are written into the code; binary bodies are read from a file "body.bin".
 *
 *   LANGUAGES: [{ id, label, ext }]     generate(id, built) -> code
 */
import { toCurl } from '@app/model.js';

export const LANGUAGES = [
  { id: 'curl', label: 'cURL', ext: 'sh' }, { id: 'wget', label: 'wget', ext: 'sh' }, { id: 'httpie', label: 'HTTPie', ext: 'sh' },
  { id: 'fetch', label: 'JavaScript (fetch)', ext: 'js' }, { id: 'node', label: 'Node.js (fetch)', ext: 'mjs' }, { id: 'python', label: 'Python (requests)', ext: 'py' },
  { id: 'powershell', label: 'PowerShell', ext: 'ps1' }, { id: 'go', label: 'Go (net/http)', ext: 'go' }, { id: 'java', label: 'Java (HttpClient)', ext: 'java' },
  { id: 'csharp', label: 'C# (HttpClient)', ext: 'cs' }, { id: 'php', label: 'PHP (cURL)', ext: 'php' },
];

const sh = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
const js = (s) => JSON.stringify(String(s));
const ps = (s) => `'${String(s).replace(/'/g, "''")}'`;
const php = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const py = (s) => JSON.stringify(String(s)); // (a valid Python string literal)

function textOf(body) {
  if (!body || !body.length) return null;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(body); } catch (e) { return undefined; } // undefined: binary
}

const CONTENT_HEADERS = new Set(['content-type', 'content-length', 'content-encoding', 'content-language']);

const GENERATORS = {
  curl: (b) => toCurl(b),

  wget(b, text) {
    const lines = [`wget --quiet --output-document=- --method=${b.method} ${sh(b.url)}`];
    for (const [k, v] of b.headers) lines.push(`--header=${sh(`${k}: ${v}`)}`);
    if (text) lines.push(`--body-data=${sh(text)}`);
    else if (text === undefined) lines.push('--body-file=body.bin');
    return lines.join(' \\\n  ');
  },

  httpie(b, text) {
    const parts = [`http ${b.method} ${sh(b.url)}`, ...b.headers.map(([k, v]) => sh(`${k}:${v}`))];
    const cmd = parts.join(' \\\n  ');
    if (text) return `printf %s ${sh(text)} | ${cmd}`;
    if (text === undefined) return `${cmd} < body.bin`;
    return cmd;
  },

  fetch(b, text) {
    const opts = [`  method: ${js(b.method)},`];
    if (b.headers.length) opts.push(`  headers: {\n${b.headers.map(([k, v]) => `    ${js(k)}: ${js(v)},`).join('\n')}\n  },`);
    if (text) opts.push(`  body: ${js(text)},`);
    else if (text === undefined) opts.push('  body: await (await fetch("body.bin")).blob(),');
    return `const response = await fetch(${js(b.url)}, {\n${opts.join('\n')}\n});\nconsole.log(response.status, await response.text());`;
  },

  node(b, text) {
    const head = text === undefined ? 'import { readFile } from "node:fs/promises";\n\n' : '';
    const code = GENERATORS.fetch(b, text).replace('await (await fetch("body.bin")).blob()', 'await readFile("body.bin")');
    return `${head}${code}`;
  },

  python(b, text) {
    const lines = ['import requests', ''];
    lines.push(`url = ${py(b.url)}`);
    if (b.headers.length) lines.push(`headers = {\n${b.headers.map(([k, v]) => `    ${py(k)}: ${py(v)},`).join('\n')}\n}`);
    if (text) lines.push(`data = ${py(text)}.encode("utf-8")`);
    else if (text === undefined) lines.push('data = open("body.bin", "rb").read()');
    const args = [py(b.method), 'url', ...(b.headers.length ? ['headers=headers'] : []), ...(text !== null ? ['data=data'] : [])];
    lines.push('', `response = requests.request(${args.join(', ')})`, 'print(response.status_code)', 'print(response.text)');
    return lines.join('\n');
  },

  powershell(b, text) {
    const lines = [];
    const headers = b.headers.filter(([k]) => k.toLowerCase() !== 'content-type');
    const type = (b.headers.find(([k]) => k.toLowerCase() === 'content-type') || [])[1];
    lines.push(`$headers = @{\n${headers.map(([k, v]) => `    ${ps(k)} = ${ps(v)}`).join('\n')}\n}`);
    const args = [`-Method ${b.method}`, `-Uri ${ps(b.url)}`, '-Headers $headers'];
    if (type) args.push(`-ContentType ${ps(type)}`);
    if (text) { lines.push(`$body = ${ps(text)}`); args.push('-Body ([System.Text.Encoding]::UTF8.GetBytes($body))'); } else if (text === undefined) args.push('-InFile body.bin');
    lines.push(`$response = Invoke-WebRequest ${args.join(' ')}`, '$response.StatusCode', '$response.Content');
    return lines.join('\n');
  },

  go(b, text) {
    const imports = ['"fmt"', '"io"', '"net/http"', ...(text ? ['"strings"'] : []), ...(text === undefined ? ['"os"'] : [])];
    const body = text ? `strings.NewReader(${js(text)})` : text === undefined ? 'file' : 'nil';
    return `package main

import (
${imports.map((i) => `\t${i}`).join('\n')}
)

func main() {
${text === undefined ? '\tfile, err := os.Open("body.bin")\n\tif err != nil {\n\t\tpanic(err)\n\t}\n\tdefer file.Close()\n' : ''}\treq, err := http.NewRequest(${js(b.method)}, ${js(b.url)}, ${body})
\tif err != nil {
\t\tpanic(err)
\t}
${b.headers.map(([k, v]) => `\treq.Header.Set(${js(k)}, ${js(v)})`).join('\n')}${b.headers.length ? '\n' : ''}\tres, err := http.DefaultClient.Do(req)
\tif err != nil {
\t\tpanic(err)
\t}
\tdefer res.Body.Close()
\tdata, _ := io.ReadAll(res.Body)
\tfmt.Println(res.StatusCode)
\tfmt.Println(string(data))
}`;
  },

  java(b, text) {
    // (HttpClient does not allow some headers, e.g. Host, Content-Length, Connection)
    const restricted = new Set(['host', 'content-length', 'connection', 'expect', 'upgrade']);
    const publisher = text ? `HttpRequest.BodyPublishers.ofString(${js(text)})` : text === undefined ? 'HttpRequest.BodyPublishers.ofFile(Path.of("body.bin"))' : 'HttpRequest.BodyPublishers.noBody()';
    return `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;${text === undefined ? '\nimport java.nio.file.Path;' : ''}

public class Main {
    public static void main(String[] args) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(${js(b.url)}))
            .method(${js(b.method)}, ${publisher})
${b.headers.filter(([k]) => !restricted.has(k.toLowerCase())).map(([k, v]) => `            .header(${js(k)}, ${js(v)})`).join('\n')}${b.headers.length ? '\n' : ''}            .build();
        HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
        System.out.println(response.statusCode());
        System.out.println(response.body());
    }
}`;
  },

  csharp(b, text) {
    const content = b.headers.filter(([k]) => CONTENT_HEADERS.has(k.toLowerCase()) && k.toLowerCase() !== 'content-length');
    const other = b.headers.filter(([k]) => !CONTENT_HEADERS.has(k.toLowerCase()));
    const lines = ['using var client = new HttpClient();', `var request = new HttpRequestMessage(new HttpMethod(${js(b.method)}), ${js(b.url)});`];
    for (const [k, v] of other) lines.push(`request.Headers.TryAddWithoutValidation(${js(k)}, ${js(v)});`);
    if (text) lines.push(`request.Content = new StringContent(${js(text)});`);
    else if (text === undefined) lines.push('request.Content = new ByteArrayContent(File.ReadAllBytes("body.bin"));');
    if (text !== null) {
      lines.push('request.Content.Headers.Clear();');
      for (const [k, v] of content) lines.push(`request.Content.Headers.TryAddWithoutValidation(${js(k)}, ${js(v)});`);
    }
    lines.push('var response = await client.SendAsync(request);', 'Console.WriteLine((int)response.StatusCode);', 'Console.WriteLine(await response.Content.ReadAsStringAsync());');
    return lines.join('\n');
  },

  php(b, text) {
    const opts = [`    CURLOPT_URL => ${php(b.url)},`, `    CURLOPT_CUSTOMREQUEST => ${php(b.method)},`, '    CURLOPT_RETURNTRANSFER => true,'];
    if (b.headers.length) opts.push(`    CURLOPT_HTTPHEADER => [\n${b.headers.map(([k, v]) => `        ${php(`${k}: ${v}`)},`).join('\n')}\n    ],`);
    if (text) opts.push(`    CURLOPT_POSTFIELDS => ${php(text)},`);
    else if (text === undefined) opts.push("    CURLOPT_POSTFIELDS => file_get_contents('body.bin'),");
    return `<?php
$curl = curl_init();
curl_setopt_array($curl, [
${opts.join('\n')}
]);
$body = curl_exec($curl);
echo curl_getinfo($curl, CURLINFO_RESPONSE_CODE), "\\n", $body;
curl_close($curl);`;
  },
};

export function generate(id, built) {
  const text = textOf(built.body);
  return (GENERATORS[id] || GENERATORS.curl)(built, text);
}
