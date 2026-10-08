const assert = require("node:assert/strict");
const test = require("node:test");
const loadTypeScript = require("./load-typescript.cjs");
const { clampMessagePaneHeight, getInspectorGridRows } = loadTypeScript("src/renderer/components/workspace/consume/inspectorLayout.ts");

test("compact panes retain a usable drag range and never overflow the available rows", () => {
  assert.equal(clampMessagePaneHeight(368.875, 240), 240);
  // A wrapped toolbar must leave room for the payload, not consume the entire viewer.
  assert.equal(clampMessagePaneHeight(300, 500, 110), 292 - 174);
  for (const height of [0, 8, 90, 180, 240, 368.875, 700]) {
    const available = Math.max(0, height - 8);
    const low = clampMessagePaneHeight(height, -100);
    const high = clampMessagePaneHeight(height, 2000);
    assert(low >= 0 && high <= available);
    if (available > 0) assert(high > low);
  }
  assert.equal(getInspectorGridRows(300, 600, true), "minmax(0, 1fr) 34px");
});

function harness({containerHeight = 368.875, preferredHeight = 230} = {}) {
  const previous = { window: global.window, document: global.document, ResizeObserver: global.ResizeObserver };
  const win = new EventTarget();
  const frames = new Map();
  let frameId = 0;
  win.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
  win.cancelAnimationFrame = id => frames.delete(id);
  const effects = [];
  let observer;
  global.window = win;
  global.document = { body: { style: { cursor: "crosshair", userSelect: "text" } } };
  global.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  const grid = { style: {}, getBoundingClientRect: () => ({ height: containerHeight }), querySelector: () => null };
  grid.firstElementChild = { getBoundingClientRect: () => ({ height: parseFloat(grid.style.gridTemplateRows) }) };
  const handle = new EventTarget();
  let captured;
  handle.setPointerCapture = id => { captured = id; };
  handle.hasPointerCapture = id => captured === id;
  handle.releasePointerCapture = () => { captured = undefined; };
  const saves = [];
  const { useInspectorResize } = loadTypeScript("src/renderer/components/workspace/consume/useInspectorResize.ts", {
    react: { useRef: current => ({current}), useLayoutEffect: effect => effects.push(effect) }
  });
  const start = useInspectorResize({ consumeGridRef: {current:grid}, inspectorCollapsed:false, messagePaneHeight:preferredHeight, onMessagePaneHeight:value=>saves.push(value) });
  const cleanup = effects[0]();
  const send = (type, y, pointerId = 1, target = win) => {
    const event = new Event(type);
    Object.assign(event, {clientY:y,pointerId});
    target.dispatchEvent(event);
  };
  return {
    grid, handle, saves, frames, start:()=>start({button:0,clientY:300,pointerId:1,currentTarget:handle,preventDefault(){}}),
    send, height:()=>parseFloat(grid.style.gridTemplateRows),
    resize:height=>{containerHeight=height;observer.callback();},
    flush:()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());},
    dispose:()=>{cleanup();},
    restore:()=>{cleanup();Object.assign(global,previous);}
  };
}

test("a 10px drag in a small window moves down 10px instead of jumping from 230 to 150", () => {
  const h = harness();
  try {
    h.start(); h.send("pointermove", 310); h.flush(); h.send("pointerup", 310);
    assert.equal(h.height(), 240);
    assert.deepEqual(h.saves, [240]);
    assert.equal(document.body.style.cursor, "crosshair");
    assert.equal(document.body.style.userSelect, "text");
    assert.equal(h.handle.hasPointerCapture(1), false);
  } finally { h.restore(); }
});

test("window resize clamps presentation without saving and drag starts at the displayed height", () => {
  const h = harness({containerHeight:700,preferredHeight:450});
  try {
    h.resize(300);
    const displayed = h.height();
    assert(displayed < 450);
    h.start(); h.send("pointerup",300);
    assert.deepEqual(h.saves, []);
    h.resize(700);
    assert.equal(h.height(),450);
    h.resize(300);
    h.start(); h.send("pointermove",290);h.flush();h.send("pointerup",290);
    assert.equal(h.height(), displayed-10);
    assert.deepEqual(h.saves,[displayed-10]);
  } finally { h.restore(); }
});

test("cancel, capture loss and unmount discard pending drag work and release body styles", () => {
  for (const end of ["pointercancel","lostpointercapture","unmount"]) {
    const h = harness();
    try {
      h.start();h.send("pointermove",320);
      h.resize(350); // Observer updates must not lose track of the queued animation frame.
      if (end === "unmount") h.dispose();
      else h.send(end,320,1,end === "lostpointercapture" ? h.handle : window);
      assert.equal(h.frames.size,0);
      assert.equal(document.body.style.cursor,"crosshair");
      assert.equal(document.body.style.userSelect,"text");
      assert.equal(h.handle.hasPointerCapture(1),false);
      assert.deepEqual(h.saves,[]);
      h.send("pointerup",320);
      assert.deepEqual(h.saves,[]);
    } finally { h.restore(); }
  }
});

test("events from another pointer cannot move or commit the active splitter", () => {
  const h = harness();
  try {
    h.start();h.send("pointermove",350,2);h.send("pointerup",350,2);
    assert.equal(h.height(),230);
    assert.deepEqual(h.saves,[]);
    h.send("pointerup",310,1);
    assert.deepEqual(h.saves,[240]);
  } finally { h.restore(); }
});
