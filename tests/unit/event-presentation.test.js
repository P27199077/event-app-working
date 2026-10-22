import test from "node:test";
import assert from "node:assert/strict";
import { countdown, locationLabel } from "../../src/event-presentation.js";
import {
  groupEventsAtPins,
  layoutPins,
  INDIVIDUAL_PIN_ZOOM,
} from "../../src/map/pin-layout.js";
import { SAVED_VENUES, savedVenue } from "../../src/data/venues.js";
import { inside } from "../../src/utils.js";
const now = Date.parse("2026-10-22T10:00:00Z");
test("countdown distinguishes live, upcoming and ended events", () => {
  const event = {
    start: new Date(now - 60000).toISOString(),
    end: new Date(now + 30 * 60000).toISOString(),
  };
  assert.equal(countdown(event, now), "Ends in 30 minutes");
  assert.equal(
    countdown({ ...event, end: new Date(now + 61 * 60000).toISOString() }, now),
    "Ends in 1h 1m",
  );
  assert.equal(
    countdown({ ...event, start: new Date(now + 60000).toISOString() }, now),
    "Starts in 1 minute",
  );
  assert.equal(
    countdown({ ...event, end: new Date(now).toISOString() }, now),
    "Ended",
  );
});
test("location labels include room details and avoid repeating a venue name", () => {
  assert.equal(
    locationLabel({ area: "Academic block", room: "F101" }),
    "Academic block · F101",
  );
  assert.equal(
    locationLabel({ area: "Auditorium", room: "Auditorium" }),
    "Auditorium",
  );
  assert.equal(
    locationLabel({ area: "Custom pin", room: "LTC Lobby · stall 2" }),
    "LTC Lobby · stall 2",
  );
});
test("nearby real pins group at low zoom and separate at high zoom", () => {
  const events = [
    { id: "a", coords: [1, 1] },
    { id: "b", coords: [1.0001, 1] },
  ];
  const groups = groupEventsAtPins(events, {
    zoom: 15,
    project: (c) => ({ x: c[0] * 100000, y: c[1] * 100000 }),
  });
  assert.equal(groups.length, 1);
  assert.equal(layoutPins(groups, 15).length, 1);
  const zoomed = groupEventsAtPins(events, {
    zoom: INDIVIDUAL_PIN_ZOOM,
    project: (c) => ({ x: c[0] * 100000, y: c[1] * 100000 }),
  });
  assert.equal(layoutPins(zoomed, INDIVIDUAL_PIN_ZOOM).length, 2);
});
test("coincident pins stay individually clickable at high zoom without changing their coordinates", () => {
  const events = Array.from({ length: 7 }, (_, i) => ({
    id: i,
    coords: [78.5709906, 17.5446488],
  }));
  const groups = groupEventsAtPins(events, { zoom: 19 });
  const pins = layoutPins(groups, 19);
  assert.equal(pins.length, 7);
  assert.equal(new Set(pins.map((pin) => pin.offset.join(","))).size, 7);
  for (const pin of pins) assert.deepEqual(pin.coords, events[0].coords);
});
test("saved venues use campus map coordinates and distinguish F rooms", () => {
  assert.equal(savedVenue("ltc-lobby").room, "LTC Lobby");
  assert.deepEqual(
    SAVED_VENUES.filter((v) => /^f\d/.test(v.id)).map((v) => v.room),
    ["F101", "F102", "F103", "F104", "F105", "F106"],
  );
  for (const venue of SAVED_VENUES)
    assert.equal(inside(venue.coords), true, venue.label);
});
