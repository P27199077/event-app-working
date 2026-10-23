import test from "node:test";
import assert from "node:assert/strict";
import {
  classroomKey,
  roomPinsFromEvents,
  createPrivateRoomPins,
} from "../../src/private-room-pins.js";
const a = [78.57089016070978, 17.54481558055123],
  b = [78.57075873246822, 17.54468515123982];
test("typed classroom variants share a key but multi-room labels cannot silently reuse one pin", () => {
  for (const label of ["G102", "g102", " g 102 ", "G-102"])
    assert.equal(classroomKey(label), "G102");
  assert.equal(classroomKey("G204A"), "G204A");
  for (const label of ["G102 / G103", "G204A / F206 *", "", "Auditorium", null])
    assert.equal(classroomKey(label), null);
});
test("room history keeps the latest valid point without changing source events", () => {
  const events = [
    { room: "G102", coords: a, created: "2026-10-22T10:00:00Z" },
    { room: "g 102", coords: b, created: "2026-10-23T10:00:00Z" },
    { room: "G103", coords: [0, 0] },
    { room: "G104", coords: a, status: "cancelled" },
    { room: "G105 / G106", coords: a },
  ];
  const before = JSON.stringify(events),
    pins = roomPinsFromEvents(events);
  assert.equal(pins.length, 1);
  assert.equal(pins[0].room, "G102");
  assert.deepEqual(pins[0].coords, b);
  assert.equal(JSON.stringify(events), before);
});
test("private room pins remain account-scoped and late history responses cannot cross accounts", async () => {
  let account = "a",
    release;
  const values = new Map();
  const storage = {
    getItem: (k) => values.get(k),
    setItem: (k, v) => values.set(k, v),
  };
  const store = createPrivateRoomPins({
    storage,
    accountIdentity: () => account,
    fetchHistory: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    onChange: () => {},
  });
  store.remember({ room: "G102", coords: a }, "a");
  assert.deepEqual(store.find("g102").coords, a);
  const pending = store.load("a");
  account = "b";
  store.clear();
  release([{ room: "G103", coords: b }]);
  await pending;
  assert.equal(store.find("G102"), undefined);
  assert.equal(store.find("G103"), undefined);
  store.remember({ room: "G104", coords: b }, "b");
  assert.ok(values.has("pinpoint-private-room-pins-v1-a"));
  assert.ok(values.has("pinpoint-private-room-pins-v1-b"));
  account = null;
  assert.equal(store.find("G104"), null);
  assert.deepEqual(store.list(), []);
});
