import test from "node:test";
import assert from "node:assert/strict";
import {
  pinVisibleAt,
  upcomingEvents,
  PIN_LEAD_MS,
} from "../../src/data/event-visibility.js";

test("pins appear exactly fifteen minutes before start and disappear at end", () => {
  const start = Date.parse("2026-10-23T14:00:00+05:30");
  const event = {
    id: "a",
    start: new Date(start).toISOString(),
    end: new Date(start + 3600000).toISOString(),
    status: "published",
  };
  assert.equal(pinVisibleAt(event, start - PIN_LEAD_MS - 1), false);
  assert.equal(pinVisibleAt(event, start - PIN_LEAD_MS), true);
  assert.equal(pinVisibleAt(event, start), true);
  assert.equal(pinVisibleAt(event, start + 3600000 - 1), true);
  assert.equal(pinVisibleAt(event, start + 3600000), false);
  assert.equal(pinVisibleAt({ ...event, status: "cancelled" }, start), false);
  assert.equal(pinVisibleAt({ ...event, start: "invalid" }, start), false);
  // Short events inside the 15-minute window must also be visible.
  assert.equal(
    pinVisibleAt(
      {
        ...event,
        start: new Date(start + 600000).toISOString(),
        end: new Date(start + 720000).toISOString(),
      },
      start,
    ),
    true,
  );
});
test("upcoming list sorts dates and times, excludes started/cancelled/invalid events and does not mutate feed", () => {
  const now = Date.parse("2026-10-23T23:50:00+05:30");
  const make = (id, start, status = "published") => ({
    id,
    start: new Date(now + start).toISOString(),
    end: new Date(now + start + 3600000).toISOString(),
    status,
  });
  const events = [
    make("tomorrow", 1200000),
    make("soon", 60000),
    make("cancelled", 120000, "cancelled"),
    make("started", 0),
    make("live", -600000),
    { id: "bad", start: "bad", end: "bad" },
  ];
  assert.deepEqual(
    upcomingEvents(events, now).map((e) => e.id),
    ["soon", "tomorrow"],
  );
  assert.equal(events[0].id, "tomorrow");
});
