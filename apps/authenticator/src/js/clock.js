/*
 * Adjustable clock for the TOTP codes of the authenticator (from the Web Authenticator, EUPL-1.2).
 *
 * TOTP codes depend on the current time: if this device's clock differs from the server's, the codes are rejected. The
 * clock can run with an offset to the system clock, be stopped at (or set to) a fixed point in time and be reset.
 *   AUTH.clock.now() / running / offset / isDefault / stop() / start() / setOffset(ms) / shift(ms) / setTime(ms) / reset() / subscribe(fn)
 */
(function (AUTH) {
  'use strict';

  let offset = 0; // ms added to the system clock while running
  let frozenAt = null; // the clock's time (ms) while stopped, null while running
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());

  const clock = {
    now() { return frozenAt !== null ? frozenAt : Date.now() + offset; },
    get running() { return frozenAt === null; },
    /** Difference between this clock and the system clock in ms. */
    get offset() { return clock.now() - Date.now(); },
    get isDefault() { return frozenAt === null && offset === 0; },
    stop() { if (frozenAt === null) { frozenAt = clock.now(); emit(); } },
    start() { if (frozenAt !== null) { offset = frozenAt - Date.now(); frozenAt = null; emit(); } }, // continues from the stopped time
    /** The deviation from the system clock; keeps running or stopped. */
    setOffset(ms) { if (frozenAt !== null) frozenAt = Date.now() + ms; else offset = ms; emit(); },
    shift(ms) { if (frozenAt !== null) frozenAt += ms; else offset += ms; emit(); },
    /** Stop the clock at a point in time (ms since the epoch). */
    setTime(ms) { frozenAt = ms; emit(); },
    reset() { offset = 0; frozenAt = null; emit(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };

  AUTH.clock = clock;
})(window.AUTH = window.AUTH || {});
