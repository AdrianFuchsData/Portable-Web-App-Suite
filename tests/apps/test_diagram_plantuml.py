"""Diagram editor: PlantUML diagrams (class, use case, component, state, activity, sequence) and templates."""
from playwright.sync_api import expect

from test_diagram import NO_PICKERS, edges, open_file, shapes

CLASSES = """@startuml
' a comment
abstract class Animal {
  name: String
  speak(): void
}
interface Pet
class "Big Dog" as Dog
Dog : bark()
enum Colour {
  RED
  GREEN
}
Animal <|-- Dog
Pet <|.. Dog
Dog "1" *-- "0..*" Colour : has >
Dog --> Owner
@enduml"""

USECASE = """@startuml
left to right direction
actor Customer
:Admin: as A
(Log in) as L
usecase "Manage users" as M
Customer --> L
A --> L
A --> M
L ..> (Check password) : <<include>>
@enduml"""

COMPONENT = """@startuml
[Web app] as W
component API
database Store
cloud CDN
interface REST
W --> API : calls
API --> Store
API - REST
CDN --> W
@enduml"""

STATE = """@startuml
[*] --> Idle
state "Running job" as Running
Idle --> Running : start
Running --> Idle : done
Running : counts up
Running --> [*] : kill
@enduml"""

ACTIVITY = """@startuml
start
:Read
the input;
if (valid?) then (yes)
  :Save;
elseif (fixable?) then (maybe)
  :Fix it;
else (no)
  :Show error;
  stop
endif
while (more?) is (yes)
  :Next;
endwhile (no)
repeat
  :Try;
repeat while (failed?) is (yes) not (no)
fork
  :A;
fork again
  :B;
end fork
stop
@enduml"""

SEQUENCE = """@startuml
title Login
autonumber
actor User as U
participant "Web server" as S
database DB
U -> S : login
activate S
S -> DB : query
DB --> S : rows
S -> S : check
alt ok
  S --> U : welcome
else failed
  S --> U : error
end
note over S, DB : cached
== Later ==
U ->x S : logout
@enduml"""


def parse(page, text):
    return page.evaluate("(t) => DG.parsePlantUml(t)", text)


def test_plantuml_parsing(app_page):
    page = app_page("diagram", init_script=NO_PICKERS)
    g = parse(page, CLASSES)
    nodes = {n["id"]: n for n in g["nodes"]}
    assert nodes["Animal"]["type"] == "class" and nodes["Animal"]["text"] == "«abstract» Animal\nname: String\n--\nspeak(): void"
    assert nodes["Pet"]["text"] == "«interface» Pet"
    assert nodes["Dog"]["text"] == "Big Dog\n--\nbark()"
    assert nodes["Colour"]["text"] == "«enum» Colour\nRED\nGREEN"
    assert "Owner" in nodes
    links = {(e["from"], e["to"]): e for e in g["edges"]}
    assert links[("Animal", "Dog")]["startArrow"] == "block-open" and not links[("Animal", "Dog")]["dash"]
    assert links[("Pet", "Dog")]["startArrow"] == "block-open" and links[("Pet", "Dog")]["dash"]
    assert links[("Dog", "Colour")]["startArrow"] == "diamond" and links[("Dog", "Colour")]["text"] == "has\n1 … 0..*"
    assert links[("Dog", "Owner")]["endArrow"] == "open"

    g = parse(page, USECASE)
    assert g["direction"] == "LR"
    nodes = {n["id"]: (n["type"], n["text"]) for n in g["nodes"]}
    assert nodes == {"Customer": ("actor", "Customer"), "A": ("actor", "Admin"), "L": ("ellipse", "Log in"), "M": ("ellipse", "Manage users"),
                     "Check password": ("ellipse", "Check password")}
    inc = [e for e in g["edges"] if e["to"] == "Check password"][0]
    assert inc["dash"] and inc["text"] == "«include»"

    g = parse(page, COMPONENT)
    nodes = {n["id"]: (n["type"], n["text"]) for n in g["nodes"]}
    assert nodes == {"W": ("component", "Web app"), "API": ("component", "API"), "Store": ("cylinder", "Store"), "CDN": ("cloud", "CDN"), "REST": ("ellipse", "REST")}
    assert [(e["from"], e["to"], e["text"]) for e in g["edges"]] == [("W", "API", "calls"), ("API", "Store", ""), ("API", "REST", ""), ("CDN", "W", "")]

    g = parse(page, STATE)
    nodes = {n["id"]: (n["type"], n["text"]) for n in g["nodes"]}
    assert nodes == {"[*]start": ("event-start", ""), "Idle": ("rounded", "Idle"), "Running": ("rounded", "Running job\ncounts up"), "[*]end": ("event-end", "")}
    assert [(e["from"], e["to"], e["text"]) for e in g["edges"]] == [("[*]start", "Idle", ""), ("Idle", "Running", "start"), ("Running", "Idle", "done"), ("Running", "[*]end", "kill")]

    g = parse(page, ACTIVITY)
    text = {n["id"]: n["text"] for n in g["nodes"]}
    named = {(text[e["from"]] or e["from"], text[e["to"]] or e["to"], e["text"]) for e in g["edges"]}
    assert ("Read\nthe input", "valid?", "") in named
    assert ("valid?", "Save", "yes") in named and ("valid?", "fixable?", "") in named
    assert ("fixable?", "Fix it", "maybe") in named and ("fixable?", "Show error", "no") in named
    # the branches meet at the loop; "Show error" stops
    assert ("Save", "more?", "") in named and ("Fix it", "more?", "") in named and not any(a == "Show error" and b == "more?" for a, b, _ in named)
    assert ("more?", "Next", "yes") in named and ("Next", "more?", "") in named and ("more?", "Try", "no") in named
    assert ("Try", "failed?", "") in named and ("failed?", "Try", "yes") in named
    types = [n["type"] for n in g["nodes"]]
    assert types.count("event-start") == 1 and types.count("event-end") == 2 and types.count("diamond") == 4
    bars = [n["id"] for n in g["nodes"] if n["type"] == "rect"]
    assert len(bars) == 2 and ("failed?", bars[0], "no") in named and (bars[0], "A", "") in named and (bars[0], "B", "") in named
    assert ("A", bars[1], "") in named and ("B", bars[1], "") in named

    g = parse(page, SEQUENCE)
    assert g["kind"] == "sequence"
    texts = [s["text"] for s in g["shapes"]]
    assert texts[0] == "Login" and "U" not in texts and "User" in texts and "Web server" in texts and "DB" in texts and "cached" in texts and "Later" in texts
    assert any(t.startswith("alt [ok]") for t in texts)
    msgs = [e["text"] for e in g["edges"] if e["text"]]
    assert msgs == ["1 login", "2 query", "3 rows", "4 check", "5 welcome", "6 error", "[failed]", "7 logout"]
    rows = {e["text"]: e for e in g["edges"] if e["text"]}
    assert rows["3 rows"]["style"]["dash"] and not rows["2 query"]["style"]["dash"] and rows["4 check"]["waypoints"]
    assert rows["1 login"]["from"]["y"] < rows["2 query"]["from"]["y"] < rows["5 welcome"]["from"]["y"] < rows["7 logout"]["from"]["y"]
    assert rows["7 logout"]["style"]["endArrow"] == "open"
    user = next(s for s in g["shapes"] if s["text"] == "User")
    assert user["type"] == "actor" and abs(rows["1 login"]["from"]["x"] - (user["x"] + user["w"] / 2)) < 1
    assert page.evaluate("() => { try { DG.parsePlantUml('@startuml\\n@enduml'); } catch (e) { return e.message; } }").startswith("no PlantUML diagram")
    assert page.errors == []


def test_plantuml_insert_and_open(app_page, tmp_path):
    page = app_page("diagram", init_script=NO_PICKERS)
    page.locator("[data-testid=canvas]").click(position={"x": 5, "y": 5})
    page.click("[data-testid=mermaid]")
    page.fill("[data-testid=mermaid-text]", CLASSES)
    page.click("[data-testid=mermaid-insert]")
    expect(page.locator("[data-testid=mermaid-dialog]")).to_have_count(0)
    s = {x["text"].split("\n")[0]: x for x in shapes(page)}
    assert set(s) == {"«abstract» Animal", "«interface» Pet", "Big Dog", "«enum» Colour", "Owner"} and len(edges(page)) == 4
    boxes = list(s.values())
    for i, a in enumerate(boxes):
        for b in boxes[i + 1:]:
            assert a["x"] + a["w"] <= b["x"] or b["x"] + b["w"] <= a["x"] or a["y"] + a["h"] <= b["y"] or b["y"] + b["h"] <= a["y"]
    # an example from the list goes into the text field
    page.locator("[data-testid=canvas]").click(position={"x": 5, "y": 5})
    page.click("[data-testid=mermaid]")
    page.select_option("[data-testid=text-example]", "state")
    expect(page.locator("[data-testid=mermaid-text]")).to_have_value(page.evaluate("DG.TEMPLATES.find((t) => t.id === 'state').plantuml"))
    page.click("[data-testid=mermaid-insert]")
    assert len(shapes(page)) == 5 + 7
    # a .puml file opens as a diagram (also without @startuml)
    f = tmp_path / "seq.puml"
    f.write_text("Alice -> Bob : hello\nBob --> Alice : hi\n", encoding="utf-8")
    page.evaluate("DG.app.dirty = false")
    open_file(page, f)
    expect(page.locator("[data-testid=canvas] .dg-shape")).to_have_count(2)
    assert sorted(x["text"] for x in shapes(page)) == ["Alice", "Bob"] and len(edges(page)) == 4
    assert page.evaluate("DG.app.name") == "seq.drawio"
    assert page.errors == []


def test_templates(app_page):
    page = app_page("diagram", init_script=NO_PICKERS)
    ids = page.evaluate("DG.TEMPLATES.map((t) => t.id)")
    assert len(ids) >= 12
    page.click("[data-testid=templates]")
    dialog = page.locator("[data-testid=templates-dialog]")
    expect(dialog).to_be_visible()
    expect(dialog.locator("[role=option]")).to_have_count(len(ids))
    expect(page.locator("[data-testid=template-new]")).to_be_disabled()
    page.click("[data-testid=template-er]")
    page.click("[data-testid=template-new]")
    expect(dialog).to_have_count(0)
    s = shapes(page)
    assert [x["text"].split("\n")[0] for x in s] == ["Customer", "Order", "OrderItem", "Product"] and all(x["type"] == "entity" for x in s)
    assert page.evaluate("DG.app.name") == "Entity relationship.drawio"
    # added below what is on the page; undo removes it again
    page.click("[data-testid=templates]")
    page.click("[data-testid=template-swot]")
    page.click("[data-testid=template-insert]")
    s2 = shapes(page)
    assert len(s2) == 9 and min(x["y"] for x in s2[4:]) > max(x["y"] + x["h"] for x in s2[:4])
    page.keyboard.press("Control+z")
    assert len(shapes(page)) == 4
    # every template gives shapes, without errors; a changed diagram is not replaced without asking
    for tid in ids:
        n = page.evaluate("(id) => { DG.app.dirty = false; return DG.useTemplate(id, true).then(() => DG.page().shapes.length); }", tid)
        assert n >= 4, tid
    page.evaluate("DG.app.dirty = true")
    page.click("[data-testid=templates]")
    page.click("[data-testid=template-flowchart]")
    page.click("[data-testid=template-new]")
    page.click("[data-testid=confirm-cancel]")
    assert page.evaluate("DG.app.name") == "Timeline.drawio"
    assert page.errors == []
