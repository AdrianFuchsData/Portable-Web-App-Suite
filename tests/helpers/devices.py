"""Display emulation shared by the fixtures (pytest --mobile runs every browser test on the phone display)."""
PHONE = {"viewport": {"width": 393, "height": 851}, "device_scale_factor": 2.75, "has_touch": True}


def phone_options(browser):
    """Context options of a phone; only Chromium can emulate a mobile browser (is_mobile)."""
    return {**PHONE, "is_mobile": browser.browser_type.name == "chromium"}


# ---- acting like a phone user (pytest --mobile) ---------------------------------------------------------------------
#
# On a phone, side panels are drawers and some views are separate panes; a user opens them (☰, "Panels", "‹ Groups", …)
# before tapping something inside and closes a drawer (tap on the shade) before tapping something behind it. With
# --mobile, actions of Page and Locator do the same: if the target exists but is hidden, the navigation buttons below are
# tried until it is visible; if it is covered by a drawer's shade, the drawer is closed first. A target that no visible
# button reveals still fails, like a tap that a user cannot make.

NAVIGATION = ["toggle-panels", "toggle-sidebar", "phone-slides", "show-groups", "back-to-entries", "back", "tab-media", "tab-props"]
ACTIONS = ["click", "dblclick", "fill", "check", "uncheck", "set_checked", "select_option", "press", "type", "hover", "tap",
           "clear", "press_sequentially", "select_text"]

COVERED_BY_SHADE = """(el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
  const hit = document.elementFromPoint(Math.min(innerWidth - 1, r.left + r.width / 2), Math.min(innerHeight - 1, r.top + r.height / 2));
  if (!hit || el.contains(hit)) return false;
  const drawer = hit.closest('.suite-drawer');
  return hit.classList.contains('suite-backdrop') || (!!drawer && !drawer.contains(el)); }"""


FREE_SPOT = """(el) => { const r = el.getBoundingClientRect();
  for (const x of [r.left + 8, r.right - 8, r.left + r.width / 2]) for (const y of [r.top + 40, r.bottom - 40]) {
    if (document.elementFromPoint(x, y) === el) return { x: x - r.left, y: y - r.top }; }
  return null; }"""


def _close_drawer(shade, click):
    """Tap the shade where the drawer does not cover it."""
    spot = shade.first.evaluate(FREE_SPOT)
    click(shade.first, position=spot) if spot else shade.first.dispatch_event("click")


def _frame_of(locator):
    """The page of a locator (navigation buttons are looked up there; apps inside iframes are not handled)."""
    try:
        return locator.page
    except Exception:
        return None


def _visible(locator):
    try:
        return locator.count() > 0 and locator.first.is_visible()
    except Exception:
        return False


def prepare(locator, originals):
    """Open the drawer or pane that contains locator's element, or close the drawer that covers it (a few attempts:
    an app may switch panes once more after an asynchronous action, then a user simply taps again)."""
    for attempt in range(3):
        _prepare(locator, originals)
        frame = _frame_of(locator)
        if frame is None or not frame.context.__dict__.get("_suite_mobile", False) or _visible(locator) or attempt == 2:
            return
        frame.wait_for_timeout(300)


def _prepare(locator, originals):
    from playwright.sync_api import Locator
    frame = _frame_of(locator)
    if frame is None or not frame.context.__dict__.get("_suite_mobile", False):
        return
    shade = frame.locator(".suite-backdrop")
    click = originals[(Locator, "click")]
    try:
        impl = locator._impl_obj  # frame_locator() locators keep the main frame and enter the iframe in the selector
        in_child_frame = impl._frame is not frame.main_frame._impl_obj or "enter-frame" in impl._selector
    except Exception:
        in_child_frame = False
    if in_child_frame:
        # an element in an iframe (e.g. a preview): only close a drawer of the page over it; queries inside a sandboxed
        # frame without scripts would make Chromium log blocked scripts
        if _visible(shade):
            _close_drawer(shade, click)
        return
    try:
        locator.first.wait_for(state="attached", timeout=3000)  # e.g. a group that a deletion creates
    except Exception:
        return  # not rendered (yet): Playwright waits as usual
    if _visible(locator):
        try:
            if _visible(shade) and locator.first.evaluate(COVERED_BY_SHADE):
                _close_drawer(shade, click)
        except Exception:
            pass
        return
    if _visible(shade):
        _close_drawer(shade, click)
        if _visible(locator):
            return
    for _ in range(3):  # some panes are two steps away (KeePass: entry -> entries -> groups)
        for testid in NAVIGATION:
            button = frame.locator(f"[data-testid={testid}]")
            if not _visible(button):
                continue
            click(button.first)
            for _ in range(40):  # up to 2 s (busy test machines)
                if _visible(locator):
                    return
                frame.wait_for_timeout(50)
            if _visible(shade):  # a drawer that did not contain the target
                _close_drawer(shade, click)


def install_phone_navigation():
    """Patch Page and Locator actions (once per session)."""
    from playwright.sync_api import Locator, Page
    if getattr(Locator, "_suite_patched", False):
        return
    originals = {}
    for cls in (Locator, Page):
        for name in ACTIONS:
            if hasattr(cls, name):
                originals[(cls, name)] = getattr(cls, name)

    def wrap(cls, name):
        original = originals[(cls, name)]

        def action(self, *args, **kwargs):
            if cls is Page:
                selector = args[0] if args else kwargs.get("selector")
                if isinstance(selector, str) and self.context.__dict__.get("_suite_mobile", False):
                    prepare(self.locator(selector), originals)
            else:
                prepare(self, originals)
            return original(self, *args, **kwargs)
        action.__name__ = name
        return action

    for (cls, name) in originals:
        setattr(cls, name, wrap(cls, name))

    # "the user can see it" also means: after opening the pane it is in
    from playwright.sync_api._generated import LocatorAssertions
    to_be_visible = LocatorAssertions.to_be_visible

    def visible(self, *args, **kwargs):
        target = getattr(self._impl_obj, "_actual_locator", None)
        if target is not None and not kwargs.get("visible", True) is False:
            from playwright._impl._sync_base import mapping  # the wrappers of the sync API
            prepare(mapping.from_impl(target), originals)
        return to_be_visible(self, *args, **kwargs)
    LocatorAssertions.to_be_visible = visible

    # raw mouse input (tests use it for canvases) at a point that an open drawer or its shade covers: close the drawer
    # first, as a user would before drawing
    from playwright.sync_api import Mouse
    from playwright._impl._sync_base import mapping

    def page_of(mouse):
        try:
            return mapping.from_impl(mouse._impl_obj._channel._object)
        except Exception:
            return None

    def clear_point(mouse, x, y):
        page = page_of(mouse)
        if page is None or not page.context.__dict__.get("_suite_mobile", False):
            return
        shade = page.locator(".suite-backdrop")
        try:
            if _visible(shade) and page.evaluate("([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest('.suite-backdrop, .suite-drawer'); }", [x, y]):
                _close_drawer(shade, originals[(Locator, "click")])
        except Exception:
            pass

    mouse_move, mouse_down, mouse_up, mouse_click, mouse_dblclick = Mouse.move, Mouse.down, Mouse.up, Mouse.click, Mouse.dblclick

    def move(self, x, y, **kwargs):
        if not getattr(self, "_suite_pressed", False):
            clear_point(self, x, y)
        self._suite_at = (x, y)
        return mouse_move(self, x, y, **kwargs)

    def down(self, *args, **kwargs):
        if hasattr(self, "_suite_at"):
            clear_point(self, *self._suite_at)
            mouse_move(self, *self._suite_at)  # the drawer may have moved things: press where the pointer is
        self._suite_pressed = True
        return mouse_down(self, *args, **kwargs)

    def up(self, *args, **kwargs):
        self._suite_pressed = False
        return mouse_up(self, *args, **kwargs)

    def click(self, x, y, **kwargs):
        clear_point(self, x, y)
        return mouse_click(self, x, y, **kwargs)

    def dblclick(self, x, y, **kwargs):
        clear_point(self, x, y)
        return mouse_dblclick(self, x, y, **kwargs)

    Mouse.move, Mouse.down, Mouse.up, Mouse.click, Mouse.dblclick = move, down, up, click, dblclick
    Locator._suite_patched = True
