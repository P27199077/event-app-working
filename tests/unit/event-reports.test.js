import test from "node:test";
import assert from "node:assert/strict";
import {
  REPORT_REASONS,
  validReport,
  reportError,
} from "../../src/event-reports.js";
test("reports have bounded reasons and details; Other requires an explanation", () => {
  for (const reason of REPORT_REASONS)
    assert.equal(validReport(reason, "The room changed."), true);
  assert.equal(validReport("Wrong location", ""), true);
  assert.equal(validReport("Other", "  "), false);
  assert.equal(validReport("invalid", "Details"), false);
  assert.equal(validReport("Other", "x".repeat(500)), true);
  assert.equal(validReport("Other", "x".repeat(501)), false);
  assert.equal(validReport("Other", null), false);
});
test("report failures keep permission, stale-event and retry feedback actionable without leaking database details", () => {
  assert.match(reportError({ code: "42501" }), /owner account/);
  assert.match(reportError({ code: "40001" }), /changed on another device/);
  assert.match(reportError({ code: "55000" }), /already been reviewed/);
  assert.match(reportError({ code: "P0001" }), /wait/);
  assert.match(reportError({ code: "PGRST202" }), /not available yet/);
  assert.doesNotMatch(
    reportError({ code: "unknown", details: "private database contents" }),
    /private database contents/,
  );
});
