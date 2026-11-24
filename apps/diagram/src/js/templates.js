/*
 * Starting points for common kinds of diagrams. A template is Mermaid or PlantUML text (laid out like an import) or a builder
 * that returns { shapes, edges } placed from (0, 0). Names and descriptions are in the app's translations (dg.tpl.<id>).
 */
import { makeShape, makeEdge } from '@app/model.js';

const shape = (type, x, y, w, h, text = '', style = {}) => makeShape(type, x, y, w, h, { text, style });
const edge = (a, b, style = {}, text = '', props = {}) => makeEdge({ id: a.id, ...(props.from || {}) }, { id: b.id, ...(props.to || {}) }, { text, style, ...(props.route ? { route: props.route } : {}) });

function erModel() {
  const customer = shape('entity', 0, 0, 160, 110, 'Customer\nPK id\nname\nemail');
  const order = shape('entity', 280, 0, 160, 110, 'Order\nPK id\nFK customer_id\ndate');
  const item = shape('entity', 280, 200, 160, 110, 'OrderItem\nPK id\nFK order_id\nFK product_id\nquantity');
  const product = shape('entity', 560, 200, 160, 90, 'Product\nPK id\nname\nprice');
  return {
    shapes: [customer, order, item, product],
    edges: [
      edge(customer, order, { startArrow: 'er-mand-one', endArrow: 'er-zero-many' }, 'places'),
      edge(order, item, { startArrow: 'er-mand-one', endArrow: 'er-one-many' }, 'contains'),
      edge(product, item, { startArrow: 'er-mand-one', endArrow: 'er-zero-many' }),
    ],
  };
}

function network() {
  const internet = shape('cloud', 250, 0, 140, 80, 'Internet', { fill: '#dae8fc', stroke: '#6c8ebf' });
  const router = shape('router', 290, 130, 60, 36, 'Router');
  const firewall = shape('firewall', 290, 220, 60, 50, 'Firewall');
  const dmz = shape('rect', 0, 320, 260, 150, 'DMZ', { fill: '#f5f5f5', stroke: '#999999', dash: true, valign: 'top' });
  const web = shape('server', 50, 370, 40, 60, 'Web server');
  const mail = shape('server', 170, 370, 40, 60, 'Mail server');
  const lan = shape('rect', 380, 320, 300, 150, 'LAN', { fill: '#f5f5f5', stroke: '#999999', dash: true, valign: 'top' });
  const pc1 = shape('computer', 410, 370, 60, 50, 'PC 1');
  const pc2 = shape('computer', 500, 370, 60, 50, 'PC 2');
  const db = shape('cylinder', 600, 365, 60, 70, 'Database');
  const link = (a, c) => edge(a, c, { endArrow: 'none' }, '', { route: 'straight' });
  return {
    shapes: [dmz, lan, internet, router, firewall, web, mail, pc1, pc2, db],
    edges: [link(internet, router), link(router, firewall), link(firewall, web), link(firewall, mail), link(firewall, pc1), link(firewall, pc2), link(firewall, db)],
  };
}

function bpmn() {
  const pool = shape('pool', 0, 0, 820, 200, 'Customer service');
  const start = shape('event-start', 60, 80, 40, 40, '');
  const check = shape('rounded', 140, 70, 120, 60, 'Check request');
  const gate = shape('gateway', 300, 75, 50, 50, '');
  const solve = shape('rounded', 400, 20, 120, 60, 'Solve problem');
  const forward = shape('rounded', 400, 120, 120, 60, 'Forward to expert');
  const answer = shape('rounded', 570, 70, 120, 60, 'Answer customer');
  const end = shape('event-end', 740, 80, 40, 40, '', { strokeWidth: 3 });
  return {
    shapes: [pool, start, check, gate, solve, forward, answer, end],
    edges: [edge(start, check), edge(check, gate), edge(gate, solve, {}, 'simple'), edge(gate, forward, {}, 'complex'), edge(solve, answer), edge(forward, answer), edge(answer, end)],
  };
}

function mindmap() {
  const centre = shape('ellipse', 300, 200, 160, 80, 'Project', { fill: '#fff2cc', stroke: '#d6b656', fontSize: 16, bold: true });
  const colours = [['#dae8fc', '#6c8ebf'], ['#d5e8d4', '#82b366'], ['#f8cecc', '#b85450'], ['#e1d5e7', '#9673a6'], ['#ffe6cc', '#d79b00'], ['#f5f5f5', '#666666']];
  const topics = [['Goals', 'Scope', 'Success criteria'], ['Team', 'Roles'], ['Schedule', 'Milestones', 'Deadline'], ['Budget'], ['Risks', 'Mitigation'], ['Communication']];
  const shapes = [centre], edges = [];
  const cx = 380, cy = 240;
  topics.forEach(([topic, ...subs], i) => {
    const a = (i / topics.length) * Math.PI * 2 - Math.PI / 2;
    const [fill, stroke] = colours[i];
    const right = Math.cos(a) >= -0.01;
    const x = Math.round(cx + Math.cos(a) * 260 - 60), y = Math.round(cy + Math.sin(a) * 170 - 22);
    const t = shape('rounded', x, y, 120, 44, topic, { fill, stroke, bold: true });
    shapes.push(t);
    edges.push(edge(centre, t, { endArrow: 'none', stroke, strokeWidth: 2 }, '', { route: 'curved' }));
    subs.forEach((sub, j) => {
      const s = shape('rounded', right ? x + 160 : x - 150, y - 26 * (subs.length - 1) + j * 52, 110, 36, sub, { fill: '#ffffff', stroke });
      shapes.push(s);
      edges.push(edge(t, s, { endArrow: 'none', stroke }, '', { route: 'curved' }));
    });
  });
  return { shapes, edges };
}

function swot() {
  const cell = (x, y, title, fill, stroke) => shape('rect', x, y, 240, 160, `${title}\n\n• \n• \n• `, { fill, stroke, align: 'left', valign: 'top', fontSize: 13 });
  return {
    shapes: [
      shape('text', 0, 0, 490, 30, 'SWOT analysis', { fontSize: 18, bold: true }),
      cell(0, 40, 'Strengths', '#d5e8d4', '#82b366'), cell(250, 40, 'Weaknesses', '#f8cecc', '#b85450'),
      cell(0, 210, 'Opportunities', '#dae8fc', '#6c8ebf'), cell(250, 210, 'Threats', '#ffe6cc', '#d79b00'),
    ],
    edges: [],
  };
}

function timeline() {
  const shapes = [], edges = [];
  const steps = ['Idea', 'Planning', 'Design', 'Build', 'Test', 'Launch'];
  const line = shape('rect', 0, 118, 900, 4, '', { fill: '#666666', stroke: 'none' });
  shapes.push(line);
  steps.forEach((s, i) => {
    const x = 40 + i * 160;
    const dot = shape('ellipse', x + 50, 110, 20, 20, '', { fill: '#1e88e5', stroke: '#ffffff', strokeWidth: 2 });
    const label = shape('rounded', x, i % 2 ? 160 : 20, 120, 50, `${s}\nQ${(i % 4) + 1}`, { fill: '#dae8fc', stroke: '#6c8ebf' });
    shapes.push(dot, label);
    edges.push(edge(dot, label, { endArrow: 'none', stroke: '#6c8ebf' }, '', { route: 'straight' }));
  });
  return { shapes, edges };
}

export const TEMPLATES = [
  { id: 'flowchart', icon: 'workflow', mermaid: `flowchart TD
  A([Start]) --> B[/Read input/]
  B --> C{Valid?}
  C -->|yes| D[Process]
  C -->|no| E[Show error]
  E --> B
  D --> F[(Save)]
  F --> G([End])` },
  { id: 'orgchart', icon: 'building-2', mermaid: `flowchart TD
  CEO[Managing director] --> CTO[Technology]
  CEO --> CFO[Finance]
  CEO --> COO[Operations]
  CTO --> DEV[Development]
  CTO --> IT[IT operations]
  CFO --> ACC[Accounting]
  COO --> SAL[Sales]
  COO --> SUP[Support]` },
  { id: 'sequence', icon: 'arrow-left-right', plantuml: `@startuml
actor User
participant Browser
participant Server
database Database
User -> Browser : open login page
Browser -> Server : POST /login
Server -> Database : find user
Database --> Server : user record
alt password correct
  Server --> Browser : session cookie
else wrong password
  Server --> Browser : 401 error
end
Browser --> User : show result
@enduml` },
  { id: 'class', icon: 'box', plantuml: `@startuml
abstract class Person {
  name: String
  email: String
}
class Customer {
  number: int
  orders(): List<Order>
}
class Order {
  date: Date
  total(): Money
}
class OrderLine {
  quantity: int
}
class Product {
  name: String
  price: Money
}
Person <|-- Customer
Customer "1" -- "*" Order : places
Order *-- "1..*" OrderLine
OrderLine --> Product
@enduml` },
  { id: 'usecase', icon: 'user', plantuml: `@startuml
left to right direction
actor Customer
actor Clerk
(Browse products) as UC1
(Place order) as UC2
(Pay) as UC3
(Ship order) as UC4
Customer --> UC1
Customer --> UC2
UC2 ..> UC3 : <<include>>
Clerk --> UC4
@enduml` },
  { id: 'state', icon: 'repeat', plantuml: `@startuml
[*] --> New
New --> Paid : payment received
New --> Cancelled : cancel
Paid --> Shipped : ship
Shipped --> Delivered : delivered
Delivered --> [*]
Cancelled --> [*]
@enduml` },
  { id: 'activity', icon: 'activity', plantuml: `@startuml
start
:Receive order;
if (In stock?) then (yes)
  fork
    :Pack goods;
  fork again
    :Write invoice;
  end fork
  :Ship;
else (no)
  :Order from supplier;
endif
:Notify customer;
stop
@enduml` },
  { id: 'er', icon: 'database', build: erModel },
  { id: 'network', icon: 'network', build: network },
  { id: 'bpmn', icon: 'waypoints', build: bpmn },
  { id: 'mindmap', icon: 'brain', build: mindmap },
  { id: 'swot', icon: 'layout-grid', build: swot },
  { id: 'timeline', icon: 'calendar', build: timeline },
];
