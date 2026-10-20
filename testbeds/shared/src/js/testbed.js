/* Test page for the shared modules (tests/shared/): a small demo app in the shell. */
(function () {
  'use strict';
  const { html } = Suite.shell;
  Suite.i18n.register({
    en: { 'app.title': 'Testbed', 'demo.hello': 'Hello' },
    de: { 'app.title': 'Testumgebung', 'demo.hello': 'Hallo' },
  });
  Suite.shell.mount({
    id: 'testbed', title: 'app.title', version: '%%BUILD_VERSION%%',
    toolbar: () => html`<button data-testid="demo-action" onClick=${() => Suite.shell.toast(Suite.t('demo.hello'))}>${Suite.t('demo.hello')}</button>`,
    main: () => html`<p data-testid="demo-text">${Suite.t('demo.hello')}</p>`,
  });
  document.body.dataset.ready = 'true';
})();
