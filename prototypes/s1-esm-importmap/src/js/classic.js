// Classic script: waits for the module bridge (window.S1.ready) set up by main.js.
(function (S1) {
  'use strict';
  let resolve;
  S1.ready = new Promise((r) => { resolve = r; });
  S1.resolveReady = resolve;
  S1.ready.then(() => {
    document.getElementById('status').textContent = 'ready';
    document.body.dataset.ready = 'true';
  });
})(window.S1 = window.S1 || {});
