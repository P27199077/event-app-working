import test from "node:test";
import assert from "node:assert/strict";
import {
  placePinLabels,
  pinLabelTime,
  PIN_LABEL_WIDTH,
  PIN_LABEL_HEIGHT,
} from "../../src/map/pin-labels.js";

const pin = (id, x, y) => ({
  events: [{ id }],
  coords: [x, y],
  offset: [0, 0],
});
const options = {
  zoom: 18,
  project: ([x, y]) => ({ x, y }),
  width: 700,
  height: 600,
};
function box(pin, position) {
  return {
    x: pin.coords[0] + pin.offset[0] + position.left - 20,
    y: pin.coords[1] + pin.offset[1] + position.top - 48,
    width: PIN_LABEL_WIDTH,
    height: PIN_LABEL_HEIGHT,
  };
}
function intersects(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

test("zoomed-in labels avoid each other, controls and viewport edges without moving real pins", () => {
  const pins = [
    pin("a", 340, 280),
    pin("b", 378, 290),
    pin("c", 340, 330),
    pin("edge", 685, 590),
  ];
  const before = JSON.stringify(pins);
  const obstacle = { x: 355, y: 215, width: 210, height: 70 };
  assert.equal(placePinLabels(pins, { ...options, zoom: 17.99 }).size, 0);
  const placed = placePinLabels(pins, { ...options, obstacles: [obstacle] });
  assert.ok(placed.size >= 3);
  const boxes = [...placed].map(([p, position]) => box(p, position));
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    assert.ok(
      b.x >= 6 && b.y >= 6 && b.x + b.width <= 694 && b.y + b.height <= 594,
    );
    assert.equal(intersects(b, obstacle), false);
    for (let j = i + 1; j < boxes.length; j++)
      assert.equal(intersects(b, boxes[j]), false);
  }
  assert.equal(JSON.stringify(pins), before);
});
test("group counts stay grouped and times use the campus timezone", () => {
  const grouped = {
    ...pin("group", 300, 300),
    events: [{ id: "a" }, { id: "b" }],
  };
  assert.equal(placePinLabels([grouped], options).size, 0);
  assert.equal(
    pinLabelTime({
      start: "2026-10-23T03:30:00Z",
      end: "2026-10-23T06:30:00Z",
    }),
    "9:00 am – 12:00 pm IST",
  );
});
