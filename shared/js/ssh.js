/* Loads the SSH/SFTP WebAssembly engine (engines/ssh, vendor/wasm/ssh-engine.wasm). */
(function (Suite) {
  'use strict';

  let loading = null;

  /**
   * Start the engine once. Needs vendor/wasm/wasm_exec.js (Go runtime, defines the global Go class)
   * and the engine embedded with id "ssh-engine". Resolves to the SSHEngine API (see engines/ssh/main.go).
   */
  function load(embedId = 'ssh-engine') {
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        window.onSSHEngineReady = (engine) => { delete window.onSSHEngineReady; resolve(engine); };
        const go = new Go();
        Suite.embed.wasm(embedId, go.importObject)
          .then(({ instance }) => go.run(instance))
          .catch(reject);
      });
    }
    return loading;
  }

  /** Open an SSH connection through the relay. options: {host, port, user, password, privateKey, passphrase, hostKey}. */
  async function connect(relay, options) {
    const engine = await load();
    const transport = await Suite.relay.connect(relay, { host: options.host, port: options.port || 22 });
    try {
      return await engine.connect(transport, options);
    } catch (e) {
      transport.close();
      throw e;
    }
  }

  Suite.ssh = { load, connect };
})(window.Suite = window.Suite || {});
