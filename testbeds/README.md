# Testbeds

Pages that only exist for the automated tests (`tests/`). They are built like apps (`python3 build.py` →
`dist/<name>.html`) but are not part of the suite.

| Testbed | Tests | Content |
|---|---|---|
| `shared` | `tests/shared/` | Loads the shared modules (`shared/js/`) so that the tests can call them. |
