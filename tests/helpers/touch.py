"""Real touch input in Chromium (DevTools protocol Input.dispatchTouchEvent): the page gets touch and pointer events with
pointerType "touch", as from a finger. Playwright itself only offers taps."""


class Touch:
    def __init__(self, page):
        self.page = page
        self.cdp = page.context.new_cdp_session(page)

    def _send(self, kind, points):
        self.cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(points)]})

    def drag(self, start, end, steps=8, hold=0):
        """One finger from start to end; hold: ms to wait before moving (a long press)."""
        self._send("touchStart", [start])
        if hold:
            self.page.wait_for_timeout(hold)
        for i in range(1, steps + 1):
            self._send("touchMove", [(start[0] + (end[0] - start[0]) * i / steps, start[1] + (end[1] - start[1]) * i / steps)])
            self.page.wait_for_timeout(16)
        self._send("touchEnd", [])

    def tap(self, point):
        self._send("touchStart", [point])
        self.page.wait_for_timeout(50)
        self._send("touchEnd", [])

    def pinch(self, center, start_gap, end_gap, steps=8):
        """Two fingers apart (or together) around center, horizontally."""
        cx, cy = center
        self._send("touchStart", [(cx - start_gap / 2, cy), (cx + start_gap / 2, cy)])
        for i in range(1, steps + 1):
            gap = start_gap + (end_gap - start_gap) * i / steps
            self._send("touchMove", [(cx - gap / 2, cy), (cx + gap / 2, cy)])
            self.page.wait_for_timeout(16)
        self._send("touchEnd", [])
