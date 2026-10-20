"""Interactive widgets for the notebook: a subset of ipywidgets (API 8) without traitlets or Jupyter comms.

shared/js/python-worker.js installs this file as the module "ipywidgets". Every widget has a model id and a state
(a dict with the key names of the Jupyter widget models, so saved notebooks are compatible); the kernel sends
{"op": "open"|"update"|"close", "id", "model", "state"} to the page (_post_comm), which draws the controls
(apps/notebook/src/js/widgets.js) and sends changes back through _handle(id, data).

Widgets: IntSlider, FloatSlider, IntRangeSlider, FloatRangeSlider, IntText, FloatText, BoundedIntText,
BoundedFloatText, Text, Textarea, Password, Checkbox, ToggleButton, Dropdown, RadioButtons, Select, SelectMultiple,
ToggleButtons, SelectionSlider, Button, Label, HTML, HTMLMath, IntProgress, FloatProgress, Output, Box, HBox, VBox,
Tab, Accordion, ColorPicker, DatePicker, Play; interact, interactive, interact_manual, fixed, link, jslink, dlink,
Layout.
"""
import itertools
import json
import secrets
import sys

import _suite_kernel as _k

__version__ = "8.1.0 (portable web app suite subset)"

_ids = itertools.count(1)
_session = secrets.token_hex(3)  # model ids differ from those of widgets saved in earlier sessions
_widgets = {}
_capture = []  # Output widgets that currently capture (innermost last)


def _jsonable(value):
    if isinstance(value, Widget):
        return f"IPY_MODEL_{value.model_id}"
    if isinstance(value, Layout):
        return value._json()
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if hasattr(value, "item"):  # numpy scalars
        return value.item()
    return value


class Layout:
    """Accepted for compatibility; width, height and the margins are applied by the page."""

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)

    def _json(self):
        return {k: v for k, v in self.__dict__.items() if isinstance(v, (str, int, float)) and not k.startswith("_")}


class Widget:
    _model_name = "Widget"
    _defaults = {}

    def __init__(self, *args, **kwargs):
        if args:  # Label("text"), IntSlider(5): the value
            kwargs.setdefault("value", args[0])
        object.__setattr__(self, "model_id", f"{_session}-{next(_ids)}")
        object.__setattr__(self, "_observers", [])
        object.__setattr__(self, "_callbacks", [])
        state = {"description": "", "disabled": False, "layout": Layout(), "style": {}, "tooltip": None}
        state.update({k: (list(v) if isinstance(v, list) else v) for k, v in self._defaults.items()})
        object.__setattr__(self, "_state", state)
        for key in ("layout", "style"):
            if key in kwargs:
                value = kwargs.pop(key)
                state[key] = Layout(**value) if key == "layout" and isinstance(value, dict) else value
        self._init(kwargs)
        for key, value in kwargs.items():
            setattr(self, key, value)
        _widgets[self.model_id] = self
        self._send("open", self._state)

    def _init(self, kwargs):
        pass

    def __getattr__(self, name):
        state = self.__dict__.get("_state")
        if state is not None and name in state:
            return state[name]
        raise AttributeError(f"{type(self).__name__!r} object has no attribute {name!r}")

    def __setattr__(self, name, value):
        if name in self._state:
            self._set(name, value)
        else:
            object.__setattr__(self, name, value)

    def _validate(self, name, value):
        return value

    def _set(self, name, value, echo=True):
        value = self._validate(name, value)
        old = self._state.get(name)
        if old is value or (type(old) is type(value) and old == value):
            return
        self._state[name] = value
        if echo and self.__dict__.get("_opened"):  # (set in the constructor: part of the "open" message)
            self._send("update", {name: value})
        for handler, names in list(self._observers):
            if names is None or name in names:
                handler({"name": name, "old": old, "new": value, "owner": self, "type": "change"})

    def _send(self, op, state=None):
        if op == "open":
            object.__setattr__(self, "_opened", True)
        _k.post_comm(json.dumps({"op": op, "id": self.model_id, "model": self._model_name,
                                  "state": _jsonable(state) if state is not None else {}}))

    def observe(self, handler, names=None, type="change"):
        if isinstance(names, str):
            names = (names,)
        self._observers.append((handler, tuple(names) if names else None))

    def unobserve(self, handler, names=None, type="change"):
        object.__setattr__(self, "_observers", [(h, n) for h, n in self._observers if h is not handler])

    def unobserve_all(self, name=None):
        object.__setattr__(self, "_observers", [])

    def close(self):
        _widgets.pop(self.model_id, None)
        self._send("close")

    def get_state(self, key=None):
        state = _jsonable(self._state)
        return state if key is None else {key: state[key]}

    def _repr_mimebundle_(self, **kwargs):
        return {"text/plain": repr(self),
                "application/vnd.jupyter.widget-view+json": {"version_major": 2, "version_minor": 0, "model_id": self.model_id}}

    def __repr__(self):
        shown = {k: v for k, v in self._state.items() if k in ("value", "description", "options", "children") and v not in ("", None)}
        return f"{type(self).__name__}({', '.join(f'{k}={v!r}' for k, v in shown.items())})"

    # page -> kernel
    def _event(self, data):
        if "value" in data:
            self._set("value", self._from_json(data["value"]), echo=False)
            if self._state["value"] != self._from_json(data["value"]):  # corrected (e.g. clamped): tell the page
                self._send("update", {"value": self._state["value"]})

    def _from_json(self, value):
        return value


# ---- values --------------------------------------------------------------------------------------------------------

class _Number(Widget):
    _cast = float

    def _validate(self, name, value):
        if name in ("value", "min", "max", "step") and value is not None:
            value = self._cast(value)
        if name == "value" and "min" in self._state:
            lo, hi = self._state["min"], self._state["max"]
            if lo is not None and value < lo:
                value = lo
            if hi is not None and value > hi:
                value = hi
        return value


class IntSlider(_Number):
    _model_name = "IntSlider"
    _defaults = {"value": 0, "min": 0, "max": 100, "step": 1, "orientation": "horizontal", "readout": True,
                 "readout_format": "d", "continuous_update": True}
    _cast = int


class FloatSlider(IntSlider):
    _model_name = "FloatSlider"
    _defaults = {**IntSlider._defaults, "value": 0.0, "min": 0.0, "max": 10.0, "step": 0.1, "readout_format": ".2f"}
    _cast = float


class FloatLogSlider(FloatSlider):
    _model_name = "FloatLogSlider"
    _defaults = {**FloatSlider._defaults, "value": 1.0, "min": 0.0, "max": 4.0, "step": 0.1, "base": 10.0}

    def _validate(self, name, value):
        return float(value) if value is not None and name in ("value", "min", "max", "step", "base") else value


class IntRangeSlider(Widget):
    _model_name = "IntRangeSlider"
    _defaults = {"value": (25, 75), "min": 0, "max": 100, "step": 1, "orientation": "horizontal", "readout": True,
                 "continuous_update": True}
    _cast = int

    def _validate(self, name, value):
        if name == "value":
            lo, hi = sorted(self._cast(v) for v in value)
            return (max(lo, self._state["min"]), min(hi, self._state["max"]))
        return self._cast(value) if name in ("min", "max", "step") else value

    def _from_json(self, value):
        return tuple(value)


class FloatRangeSlider(IntRangeSlider):
    _model_name = "FloatRangeSlider"
    _defaults = {**IntRangeSlider._defaults, "value": (5.0, 7.5), "min": 0.0, "max": 10.0, "step": 0.1}
    _cast = float


class IntText(_Number):
    _model_name = "IntText"
    _defaults = {"value": 0, "step": 1, "continuous_update": False}
    _cast = int


class FloatText(IntText):
    _model_name = "FloatText"
    _defaults = {"value": 0.0, "step": None, "continuous_update": False}
    _cast = float


class BoundedIntText(IntText):
    _model_name = "BoundedIntText"
    _defaults = {**IntText._defaults, "min": 0, "max": 100}


class BoundedFloatText(FloatText):
    _model_name = "BoundedFloatText"
    _defaults = {**FloatText._defaults, "min": 0.0, "max": 100.0}


class IntProgress(_Number):
    _model_name = "IntProgress"
    _defaults = {"value": 0, "min": 0, "max": 100, "bar_style": "", "orientation": "horizontal"}
    _cast = int


class FloatProgress(IntProgress):
    _model_name = "FloatProgress"
    _defaults = {**IntProgress._defaults, "value": 0.0, "min": 0.0, "max": 10.0}
    _cast = float


class Text(Widget):
    _model_name = "Text"
    _defaults = {"value": "", "placeholder": "", "continuous_update": True}

    def _validate(self, name, value):
        return "" if name == "value" and value is None else (str(value) if name == "value" else value)

    def on_submit(self, callback):
        self._callbacks.append(callback)

    def _event(self, data):
        super()._event(data)
        if data.get("submit"):
            for callback in list(self._callbacks):
                callback(self)


class Textarea(Text):
    _model_name = "Textarea"
    _defaults = {**Text._defaults, "rows": None}


class Password(Text):
    _model_name = "Password"


class Checkbox(Widget):
    _model_name = "Checkbox"
    _defaults = {"value": False, "indent": True}

    def _validate(self, name, value):
        return bool(value) if name == "value" else value


class ToggleButton(Checkbox):
    _model_name = "ToggleButton"
    _defaults = {"value": False, "button_style": "", "icon": ""}


class ColorPicker(Widget):
    _model_name = "ColorPicker"
    _defaults = {"value": "black", "concise": False}


class DatePicker(Widget):
    _model_name = "DatePicker"
    _defaults = {"value": None}

    def _from_json(self, value):
        import datetime
        return datetime.date.fromisoformat(value) if value else None


class Label(Widget):
    _model_name = "Label"
    _defaults = {"value": ""}


class HTML(Label):
    _model_name = "HTML"


class HTMLMath(HTML):
    _model_name = "HTMLMath"


class Play(_Number):
    """Counts from min to max in steps while playing (the page drives the timer)."""
    _model_name = "Play"
    _defaults = {"value": 0, "min": 0, "max": 100, "step": 1, "interval": 100, "repeat": False, "playing": False}
    _cast = int

    def _validate(self, name, value):
        return value if name in ("playing", "repeat", "interval") else super()._validate(name, value)

    def _event(self, data):
        if "playing" in data:
            self._set("playing", bool(data["playing"]), echo=False)
        super()._event(data)


# ---- selection -----------------------------------------------------------------------------------------------------

def _pairs(options):
    if isinstance(options, dict):
        return [(str(k), v) for k, v in options.items()]
    out = []
    for o in options:
        if isinstance(o, (tuple, list)) and len(o) == 2:
            out.append((str(o[0]), o[1]))
        else:
            out.append((str(o), o))
    return out


class _Selection(Widget):
    _defaults = {"_options_labels": [], "index": None, "value": None, "label": None, "rows": 5}

    def _init(self, kwargs):
        options = kwargs.pop("options", [])
        object.__setattr__(self, "_pairs", _pairs(options))
        self._state["_options_labels"] = [label for label, _ in self._pairs]
        if "index" in kwargs:
            self._select(kwargs.pop("index"))
        elif "value" in kwargs:
            self._state["value"] = kwargs.pop("value")
            self._sync_index()
        elif "label" in kwargs:
            self._select(self._state["_options_labels"].index(kwargs.pop("label")))
        elif self._pairs and self._first:
            self._select(0)

    _first = True

    @property
    def options(self):
        return tuple(value for _, value in self._pairs)

    @options.setter
    def options(self, options):
        object.__setattr__(self, "_pairs", _pairs(options))
        self._state["_options_labels"] = [label for label, _ in self._pairs]
        self._send("update", {"_options_labels": self._state["_options_labels"]})
        self._select(0 if self._pairs and self._first else None)

    def _select(self, index, echo=True):
        if index is None or not (0 <= index < len(self._pairs)):
            label, value, index = None, None, None
        else:
            label, value = self._pairs[index]
        self._set("index", index, echo)
        self._set("label", label, echo)
        self._set("value", value, echo)

    def _sync_index(self):
        values = [v for _, v in self._pairs]
        index = values.index(self._state["value"]) if self._state["value"] in values else None
        self._state["index"] = index
        self._state["label"] = self._pairs[index][0] if index is not None else None

    def __setattr__(self, name, value):
        if name == "value":
            values = [v for _, v in self._pairs]
            if value is not None and value not in values:
                raise ValueError(f"{value!r} is not one of the options")
            self._select(values.index(value) if value is not None else None)
        elif name == "index":
            self._select(value)
        elif name == "label":
            self._select(self._state["_options_labels"].index(value))
        elif name == "options":
            type(self).options.fset(self, value)
        else:
            super().__setattr__(name, value)

    def _event(self, data):
        if "index" in data:
            self._select(data["index"], echo=False)


class Dropdown(_Selection):
    _model_name = "Dropdown"


class RadioButtons(_Selection):
    _model_name = "RadioButtons"


class Select(_Selection):
    _model_name = "Select"


class ToggleButtons(_Selection):
    _model_name = "ToggleButtons"
    _defaults = {**_Selection._defaults, "button_style": ""}


class SelectionSlider(_Selection):
    _model_name = "SelectionSlider"
    _defaults = {**_Selection._defaults, "continuous_update": True, "readout": True}


class SelectMultiple(Widget):
    _model_name = "SelectMultiple"
    _defaults = {"_options_labels": [], "index": (), "value": (), "label": (), "rows": 5}

    def _init(self, kwargs):
        object.__setattr__(self, "_pairs", _pairs(kwargs.pop("options", [])))
        self._state["_options_labels"] = [label for label, _ in self._pairs]
        if "value" in kwargs:
            self._choose([v for _, v in self._pairs].index(v) for v in kwargs.pop("value"))
        elif "index" in kwargs:
            self._choose(kwargs.pop("index"))

    @property
    def options(self):
        return tuple(value for _, value in self._pairs)

    def _choose(self, indices, echo=True):
        indices = tuple(sorted(set(indices)))
        self._set("index", indices, echo)
        self._set("label", tuple(self._pairs[i][0] for i in indices), echo)
        self._set("value", tuple(self._pairs[i][1] for i in indices), echo)

    def __setattr__(self, name, value):
        if name == "value":
            values = [v for _, v in self._pairs]
            self._choose(values.index(v) for v in value)
        elif name == "index":
            self._choose(value)
        else:
            super().__setattr__(name, value)

    def _event(self, data):
        if "index" in data:
            self._choose(data["index"], echo=False)


# ---- buttons and output --------------------------------------------------------------------------------------------

class Button(Widget):
    _model_name = "Button"
    _defaults = {"button_style": "", "icon": ""}

    def on_click(self, callback, remove=False):
        if remove:
            object.__setattr__(self, "_callbacks", [c for c in self._callbacks if c is not callback])
        else:
            self._callbacks.append(callback)

    def click(self):
        for callback in list(self._callbacks):
            callback(self)

    def _event(self, data):
        if data.get("click"):
            self.click()


class _Stream:
    def __init__(self, output, name):
        self.output, self.name = output, name

    def write(self, text):
        if text:
            self.output._append({"output_type": "stream", "name": self.name, "text": text})
        return len(text)

    def flush(self):
        pass

    def isatty(self):
        return False


class Output(Widget):
    """Captures print(), display() and figures inside "with out:" (also in callbacks of other widgets)."""
    _model_name = "Output"
    _defaults = {"outputs": []}

    def _append(self, output):
        outputs = self._state["outputs"]
        last = outputs[-1] if outputs else None
        if output.get("output_type") == "stream" and last and last.get("output_type") == "stream" and last.get("name") == output["name"]:
            outputs[-1] = {**last, "text": last["text"] + output["text"]}
        else:
            outputs.append(output)
        self._send("update", {"outputs": outputs})

    def clear_output(self, wait=False):
        self._state["outputs"] = []
        self._send("update", {"outputs": []})

    def append_stdout(self, text):
        self._append({"output_type": "stream", "name": "stdout", "text": text})

    def append_stderr(self, text):
        self._append({"output_type": "stream", "name": "stderr", "text": text})

    def append_display_data(self, obj):
        self._append({"output_type": "display_data", "data": _k.mime(obj), "metadata": {}})

    def __enter__(self):
        _capture.append((self, sys.stdout, sys.stderr))
        sys.stdout, sys.stderr = _Stream(self, "stdout"), _Stream(self, "stderr")
        return self

    def __exit__(self, kind, error, tb):
        _k.flush_figures()
        if error is not None and not isinstance(error, KeyboardInterrupt):
            import traceback
            lines = traceback.format_exception(kind, error, tb)
            self._append({"output_type": "error", "ename": kind.__name__, "evalue": str(error), "traceback": lines})
        _, sys.stdout, sys.stderr = _capture.pop()
        return error is not None and not isinstance(error, KeyboardInterrupt)

    def capture(self, clear_output=False, wait=False):
        def decorator(function):
            def wrapper(*args, **kwargs):
                if clear_output:
                    self.clear_output()
                with self:
                    return function(*args, **kwargs)
            return wrapper
        return decorator


def _route(output):
    """Outputs while an Output widget captures go into it (called by the kernel's _post)."""
    if not _capture:
        return False
    _capture[-1][0]._append(output)
    return True


# ---- containers ----------------------------------------------------------------------------------------------------

class Box(Widget):
    _model_name = "Box"
    _defaults = {"children": (), "box_style": ""}

    def _init(self, kwargs):
        if "children" in kwargs:
            self._state["children"] = tuple(kwargs.pop("children"))

    def __init__(self, children=(), **kwargs):
        super().__init__(children=children, **kwargs)

    def _validate(self, name, value):
        return tuple(value) if name == "children" else value


class HBox(Box):
    _model_name = "HBox"


class VBox(Box):
    _model_name = "VBox"


class GridBox(Box):
    _model_name = "GridBox"


class Tab(Box):
    _model_name = "Tab"
    _defaults = {"children": (), "titles": (), "selected_index": 0}

    def set_title(self, index, title):
        titles = list(self._state["titles"]) + [""] * (len(self._state["children"]) - len(self._state["titles"]))
        titles[index] = title
        self._set("titles", tuple(titles))

    def get_title(self, index):
        titles = self._state["titles"]
        return titles[index] if index < len(titles) else ""

    def _validate(self, name, value):
        return tuple(value) if name in ("children", "titles") else value

    def _event(self, data):
        if "selected_index" in data:
            self._set("selected_index", data["selected_index"], echo=False)


class Accordion(Tab):
    _model_name = "Accordion"
    _defaults = {**Tab._defaults, "selected_index": None}


# ---- links -----------------------------------------------------------------------------------------------------------

class link:
    def __init__(self, source, target, transform=None):
        (self.source, self.sname), (self.target, self.tname) = source, target
        forward, back = (transform or (None, None))
        self._busy = False
        setattr(self.target, self.tname, forward(getattr(self.source, self.sname)) if forward else getattr(self.source, self.sname))
        self.source.observe(self._forward, self.sname)
        if not isinstance(self, dlink):
            self.target.observe(self._back, self.tname)
        self.forward, self.back = forward, back

    def _forward(self, change):
        if not self._busy:
            self._busy = True
            try:
                setattr(self.target, self.tname, self.forward(change["new"]) if self.forward else change["new"])
            finally:
                self._busy = False

    def _back(self, change):
        if not self._busy:
            self._busy = True
            try:
                setattr(self.source, self.sname, self.back(change["new"]) if self.back else change["new"])
            finally:
                self._busy = False

    def unlink(self):
        self.source.unobserve(self._forward)
        self.target.unobserve(self._back)


class dlink(link):
    def __init__(self, source, target, transform=None):
        super().__init__(source, target, (transform, None) if transform else None)


jslink, jsdlink = link, dlink


# ---- interact --------------------------------------------------------------------------------------------------------

class fixed:
    def __init__(self, value):
        self.value = value


def _widget_for(name, abbrev, default=None):
    if isinstance(abbrev, Widget):
        return abbrev
    if isinstance(abbrev, fixed):
        return abbrev
    if isinstance(abbrev, bool):
        return Checkbox(value=abbrev, description=name)
    if isinstance(abbrev, str):
        return Text(value=abbrev, description=name)
    if isinstance(abbrev, (int, float)):
        v = abbrev
        lo, hi = (-v, 3 * v) if v > 0 else (3 * v, -v) if v < 0 else (0, 1)
        cls = IntSlider if isinstance(v, int) else FloatSlider
        return cls(value=v, min=lo, max=hi, step=1 if cls is IntSlider else (hi - lo) / 100 or 0.1, description=name)
    if isinstance(abbrev, tuple) and 2 <= len(abbrev) <= 3 and all(isinstance(x, (int, float)) for x in abbrev):
        lo, hi = abbrev[0], abbrev[1]
        is_int = all(isinstance(x, int) and not isinstance(x, bool) for x in abbrev)
        step = abbrev[2] if len(abbrev) == 3 else (1 if is_int else (hi - lo) / 100)
        value = default if default is not None else (lo + hi) // 2 if is_int else (lo + hi) / 2
        cls = IntSlider if is_int else FloatSlider
        return cls(value=value, min=lo, max=hi, step=step, description=name)
    if isinstance(abbrev, (list, tuple, dict)):
        w = Dropdown(options=abbrev, description=name)
        if default is not None and default in w.options:
            w.value = default
        return w
    raise ValueError(f"cannot make a widget for {name}={abbrev!r}")


class interactive(VBox):
    """A VBox of controls for the parameters of a function and an Output with its result."""
    _model_name = "VBox"

    def __init__(self, __interact_f, __options=None, **kwargs):
        import inspect
        options = __options or {}
        function = __interact_f
        manual = options.get("manual", False)
        defaults = {}
        try:
            for p in inspect.signature(function).parameters.values():
                if p.default is not inspect.Parameter.empty:
                    defaults[p.name] = p.default
        except (TypeError, ValueError):
            pass
        controls = {}
        for name, abbrev in kwargs.items():
            controls[name] = _widget_for(name, abbrev, defaults.get(name))
        out = Output()
        shown = [w for w in controls.values() if isinstance(w, Widget)]
        button = None
        if manual:
            button = Button(description=options.get("manual_name", "Run Interact"))
            shown.append(button)
        super().__init__(children=shown + [out])
        object.__setattr__(self, "f", function)
        object.__setattr__(self, "out", out)
        object.__setattr__(self, "controls", controls)
        object.__setattr__(self, "result", None)
        object.__setattr__(self, "manual_button", button)
        if manual:
            button.on_click(lambda b: self.update())
        else:
            for w in shown:
                w.observe(lambda change: self.update(), "value")
            self.update()

    @property
    def kwargs(self):
        return {name: (w.value if isinstance(w, (Widget, fixed)) else w) for name, w in self.controls.items()}

    @property
    def children_widgets(self):
        return self.children

    def update(self, *args):
        self.out.clear_output()
        with self.out:
            result = self.f(**self.kwargs)
            object.__setattr__(self, "result", result)
            if result is not None:
                _k.display(result)


class _Interact:
    def __init__(self, manual=False):
        self.manual = manual

    def __call__(self, __interact_f=None, **kwargs):
        if __interact_f is None:  # @interact(x=...)
            return lambda f: self(f, **kwargs)
        w = interactive(__interact_f, {"manual": self.manual}, **kwargs)
        _k.display(w)
        try:
            __interact_f.widget = w
        except AttributeError:
            pass
        return __interact_f

    def options(self, manual=False, manual_name="Run Interact"):
        return _Interact(manual)


interact = _Interact()
interact_manual = _Interact(manual=True)


def _handle(model_id, data):
    widget = _widgets.get(model_id)
    if widget is not None:
        widget._event(data)


widgets = sys.modules[__name__]  # "from ipywidgets import widgets"
