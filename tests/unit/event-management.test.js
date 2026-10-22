import test from "node:test";
import assert from "node:assert/strict";
import {
  managementStatus,
  filterManagedEvents,
} from "../../src/event-management.js";
import { visibleAtTime } from "../../src/data/event-visibility.js";
const now = Date.parse("2026-10-22T09:00:00Z");
const base = {
  title: "Quiz",
  area: "Academic block",
  room: "F101",
  host: "Quiz club",
  start: new Date(now - 60000).toISOString(),
  end: new Date(now + 60000).toISOString(),
  status: "published",
  mine: false,
};
const events = [
  { ...base, id: "live" },
  {
    ...base,
    id: "upcoming",
    start: new Date(now + 60000).toISOString(),
    end: new Date(now + 120000).toISOString(),
  },
  { ...base, id: "ended", end: new Date(now).toISOString() },
  { ...base, id: "cancelled", status: "cancelled" },
];
test("owner workspace distinguishes live, upcoming, ended and cancelled events at boundaries", () => {
  assert.deepEqual(
    events.map((event) => managementStatus(event, now)),
    ["live", "upcoming", "ended", "cancelled"],
  );
  assert.deepEqual(
    filterManagedEvents(events, "active", "", now).map((e) => e.id),
    ["live", "upcoming"],
  );
  assert.deepEqual(
    filterManagedEvents(events, "cancelled", "", now).map((e) => e.id),
    ["cancelled"],
  );
  assert.equal(filterManagedEvents(events, "all", "", now).length, 4);
});
test("owner search includes venue and host and does not depend on original creator", () => {
  assert.equal(filterManagedEvents(events, "all", "  f101  ", now).length, 4);
  assert.equal(
    filterManagedEvents(events, "active", "QUIZ CLUB", now).length,
    2,
  );
  assert.equal(
    filterManagedEvents(events, "upcoming", "Quiz", now)[0].id,
    "upcoming",
  );
  assert.equal(filterManagedEvents(events, "all", "auditorium", now).length, 0);
  assert.equal(visibleAtTime(events[1], "Explore", now), false);
});
