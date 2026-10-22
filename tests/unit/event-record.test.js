import test from "node:test";
import assert from "node:assert/strict";
import { fromRow, toRow, friendlyError } from "../../src/data/event-record.js";
test("posting payload excludes browser-controlled ownership and IDs", () => {
  const event = {
    id: "fake",
    mine: true,
    organizer_id: "someone-else",
    revision: 99,
    status: "published",
    title: " Test ",
    category: "Fun",
    area: "Academic block",
    room: "E-101",
    host: "Host",
    description: "Details",
    start: "2026-10-22T10:00:00Z",
    end: "2026-10-22T11:00:00Z",
    coords: [78.5716, 17.5445],
  };
  const row = toRow(event);
  assert.equal(row.title, "Test");
  assert.equal(row.organizer_id, undefined);
  assert.equal(row.id, undefined);
  assert.equal(row.revision, undefined);
  assert.equal(row.status, undefined);
  assert.equal(
    fromRow({ ...row, id: "uuid", organizer_id: "owner" }, "owner").mine,
    true,
  );
  assert.equal(
    fromRow({ ...row, id: "uuid", organizer_id: "owner" }, "other").mine,
    false,
  );
  assert.deepEqual(fromRow(row).coords, event.coords);
});
test("database duplicate errors have actionable copy without leaking DB details", () => {
  assert.match(
    friendlyError({ code: "23P01", details: "private row data" }),
    /already posted/,
  );
  assert.doesNotMatch(
    friendlyError({ code: "23P01", details: "private row data" }),
    /private row/,
  );
  assert.match(friendlyError({ code: "42501" }), /approved organizers/);
});

test("managed records preserve event identity, cancellation and revision; conflicts do not leak data", () => {
  const record = fromRow({
    id: "event-1",
    status: "cancelled",
    revision: 4,
    organizer_id: "reviewer",
    longitude: 78.571,
    latitude: 17.544,
  });
  assert.equal(record.id, "event-1");
  assert.equal(record.status, "cancelled");
  assert.equal(record.revision, 4);
  assert.equal(record.mine, false);
  assert.match(
    friendlyError({ code: "40001", details: "private data" }),
    /another device/,
  );
  assert.doesNotMatch(
    friendlyError({ code: "40001", details: "private data" }),
    /private data/,
  );
});
