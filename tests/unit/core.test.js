import test from "node:test";
import assert from "node:assert/strict";
import { loadState, persistState } from "../../src/data/storage.js";
import { inside, safeLink, esc } from "../../src/utils.js";
import { campusRing, areas } from "../../src/data/campus.js";
test("campus bounds accept campus locations and reject outside/invalid points", () => {
  for (const point of Object.values(areas)) assert.equal(inside(point), true);
  assert.equal(inside(campusRing[0]), true);
  for (const point of [null, [], [NaN, 0], [0, 0]])
    assert.equal(inside(point), false);
});
test("links and user text cannot introduce executable markup", () => {
  assert.equal(safeLink("javascript:alert(1)"), "");
  assert.equal(safeLink("https://example.org"), "https://example.org/");
  assert.equal(esc('<script>"&'), "&lt;script&gt;&quot;&amp;");
});
test("invalid and partial stored data recover without losing valid user posts", () => {
  assert.equal(loadState({ getItem: () => "{bad" }).events.length, 6);
  const event = { id: 100, mine: true, title: "My event", category: "Social" };
  const state = loadState({
    getItem: () => JSON.stringify({ events: [null, event] }),
  });
  assert.deepEqual(state.rsvps, []);
  assert.deepEqual(state.reports, []);
  assert.equal(state.events[0].title, "My event");
  assert.equal(state.events[0].category, "Fun");
  let restored;
  persistState(state, {
    setItem: (key, value) => {
      assert.equal(key, "campus-pulse-v2");
      restored = JSON.parse(value);
    },
  });
  assert.deepEqual(restored, state);
});

test("public and Interested views include the 15-minute arrival window; My events includes upcoming own posts", async () => {
  const { visibleAtTime } = await import("../../src/data/event-visibility.js");
  const now = Date.parse("2026-10-22T10:00:00Z");
  const event = {
    start: "2026-10-22T10:00:00Z",
    end: "2026-10-22T11:00:00Z",
    mine: true,
  };
  for (const view of ["Explore", "Interested"]) {
    assert.equal(visibleAtTime(event, view, now - 15 * 60000 - 1), false);
    assert.equal(visibleAtTime(event, view, now - 15 * 60000), true);
    assert.equal(visibleAtTime(event, view, now), true);
    assert.equal(visibleAtTime(event, view, now + 3600000), false);
  }
  assert.equal(visibleAtTime(event, "Mine", now - 1), true);
  assert.equal(
    visibleAtTime({ ...event, mine: false }, "Mine", now - 1),
    false,
  );
  assert.equal(
    visibleAtTime({ ...event, start: "invalid" }, "Explore", now),
    false,
  );
});
