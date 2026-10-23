import test from "node:test";
import assert from "node:assert/strict";
import { mergeDraftEvents, draftDay } from "../../src/schedule-drafts.js";
test("new day imports retain existing drafts, replace matching source IDs and keep repeated sessions separate", () => {
  const day1 = {
    id: "d1",
    title: "Workshop",
    start: "2026-10-23T09:00",
    bookings: [],
  };
  const day2 = {
    id: "d2",
    title: "Workshop",
    start: "2026-10-24T10:00",
    bookings: [],
  };
  const day3 = {
    id: "d3",
    title: "Workshop",
    start: "2026-10-25T11:00",
    bookings: [],
  };
  const existing = [day1, day2];
  const result = mergeDraftEvents(existing, [day3, { ...day2, room: "G102" }]);
  assert.deepEqual(
    result.map((e) => e.id),
    ["d1", "d2", "d3"],
  );
  assert.equal(result[1].room, "G102");
  assert.equal(existing.length, 2);
  assert.equal(existing[1].room, undefined);
  assert.equal(
    draftDay({ start: "", bookings: [{ start: "2026-10-24T13:00" }] }),
    "2026-10-24",
  );
  assert.equal(
    draftDay({
      start: "",
      bookings: [],
      catalog_date: "23 October 2026; 24 October 2026",
    }),
    "2026-10-23",
  );
});
