import test from "node:test";
import assert from "node:assert/strict";
import { activeAt, istInput, parseIstInput } from "../../src/event-clock.js";

test("campus input and parsing use IST across UTC day boundaries", () => {
  const instant = Date.parse("2026-10-22T20:15:00Z");
  assert.equal(istInput(instant), "2026-10-23T01:45");
  assert.equal(parseIstInput("2026-10-23T01:45"), instant);
  assert.equal(
    parseIstInput("2026-10-22T00:00"),
    Date.parse("2026-10-21T18:30:00Z"),
  );
  assert.equal(
    istInput(Date.parse("2028-02-29T18:29:00Z")),
    "2028-02-29T23:59",
  );
});
test("time selection rejects normalized invalid calendar dates and incomplete input", () => {
  for (const value of [
    null,
    "",
    "2026-02-29T12:00",
    "2026-04-31T12:00",
    "2026-10-22T24:00",
    "2026-13-01T12:00",
    "2026-10-22",
    "2026-10-22T12:00Z",
  ])
    assert.equal(parseIstInput(value), null, String(value));
  assert.equal(
    parseIstInput("2028-02-29T12:00"),
    Date.parse("2028-02-29T06:30:00Z"),
  );
});
test("selected-time pins include overlapping events, exclude cancelled events and stop at the end boundary", () => {
  const at = Date.parse("2026-10-23T19:00:00+05:30");
  const event = {
    start: "2026-10-23T18:00:00+05:30",
    end: "2026-10-23T20:00:00+05:30",
    status: "published",
  };
  assert.equal(activeAt(event, at), true);
  assert.equal(
    activeAt({ ...event, start: "2026-10-23T19:00:00+05:30" }, at),
    true,
  );
  assert.equal(
    activeAt({ ...event, end: "2026-10-23T19:00:00+05:30" }, at),
    false,
  );
  assert.equal(activeAt({ ...event, status: "cancelled" }, at), false);
  assert.equal(activeAt({ ...event, start: "invalid" }, at), false);
});
