import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const $ = (id) => document.getElementById(id);
const status = (text) => { $("status").textContent = text; };
const term = new Terminal({ cursorBlink: true, fontSize: 14 });
const fit = new FitAddon();
term.loadAddon(fit);
term.open($("terminal"));
fit.fit();

let client = null;
let sftp = null;
let shell = null;

async function list() {
  const path = await sftp.realpath($("path").value || ".");
  $("path").value = path;
  const entries = await sftp.list(path);
  entries.sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name));
  $("files").replaceChildren(...[{ name: "..", isDir: true }, ...entries].map((e) => {
    const li = document.createElement("li");
    li.textContent = `${e.isDir ? "📁" : "📄"} ${e.name}${e.isDir ? "/" : `  (${e.size} B)`}`;
    li.onclick = async () => {
      const target = `${path.replace(/\/$/, "")}/${e.name}`;
      if (e.isDir) { $("path").value = target; list(); return; }
      const data = await sftp.readFile(target);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([data]));
      a.download = e.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    };
    return li;
  }));
}

$("login").onsubmit = async (event) => {
  event.preventDefault();
  try {
    status("loading engine…");
    await Suite.ssh.load();
    status("connecting…");
    client = await Suite.ssh.connect(Suite.relay.config($("relay-url").value, $("relay-token").value), {
      host: $("host").value, port: +$("port").value, user: $("user").value,
      password: $("password").value, privateKey: $("key").value,
      hostKey: (info) => window.confirm(`Accept ${info.type} host key?\n${info.fingerprint}`),
    });
    status(`connected (${client.serverVersion})`);
    shell = await client.shell({
      cols: term.cols, rows: term.rows,
      onData: (bytes) => term.write(bytes),
      onExit: (code) => { term.write(`\r\n[shell exited with ${code}]\r\n`); },
    });
    term.onData((data) => shell.write(data));
    term.onResize(({ cols, rows }) => shell.resize(cols, rows));
    term.focus();
    sftp = await client.sftp();
    await list();
  } catch (e) {
    status(`error: ${e.message}`);
  }
};
$("list").onclick = () => list().catch((e) => status(`error: ${e.message}`));
$("upload").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  await sftp.writeFile(`${$("path").value.replace(/\/$/, "")}/${file.name}`, new Uint8Array(await file.arrayBuffer()));
  event.target.value = "";
  list();
};
window.addEventListener("resize", () => fit.fit());

// for tests
window.S4 = { term, get client() { return client; }, get sftp() { return sftp; } };
document.body.dataset.ready = "true";
