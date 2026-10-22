import test from "node:test";
import assert from "node:assert/strict";
import {
  newTrackingToken,
  validTrackingEntry,
  parseTrackingLink,
  trackingUrl,
  requestStatusMessage,
} from "../../src/request-tracking.js";
const entry = {
  id: "11111111-1111-4111-8111-111111111111",
  token: "ab".repeat(32),
};
test("tracking capability stays in the fragment and round-trips without exposing it in a request URL", () => {
  const link = new URL(
    trackingUrl(entry, "https://pinpoint.example/index.html?temporary=1#old"),
  );
  assert.equal(link.origin, "https://pinpoint.example");
  assert.equal(link.search, "");
  assert.equal(
    (link.origin + link.pathname + link.search).includes(entry.token),
    false,
  );
  assert.deepEqual(parseTrackingLink(link.hash), entry);
  assert.equal(parseTrackingLink("#access_token=other"), null);
});
test("invalid or altered tracking-link syntax is rejected and tokens are independently generated", () => {
  for (const hash of [
    "#request=123.bad",
    `#request=${entry.id}.${entry.token}.extra`,
    `#request=${entry.id}.${entry.token}.`,
    `#request=${entry.id}.${"a".repeat(63)}`,
  ])
    assert.equal(parseTrackingLink(hash), null);
  assert.equal(validTrackingEntry({ ...entry, token: null }), false);
  const first = newTrackingToken(),
    second = newTrackingToken();
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
});
test("request feedback distinguishes review status from later cancellation", () => {
  assert.match(
    requestStatusMessage({ status: "pending" }),
    /waiting for review/,
  );
  assert.equal(
    requestStatusMessage({
      status: "rejected",
      reason: "Please confirm the room.",
    }),
    "Please confirm the room.",
  );
  assert.match(
    requestStatusMessage({ status: "approved" }),
    /while the event is live/,
  );
  assert.match(
    requestStatusMessage({ status: "approved", eventStatus: "cancelled" }),
    /since been cancelled/,
  );
});
