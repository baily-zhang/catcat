const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeAgentNotificationMode,
  shouldForwardNotification
} = require("../src/notification/filter");

test("normalizes agent notification modes", () => {
  assert.equal(normalizeAgentNotificationMode("all"), "all");
  assert.equal(normalizeAgentNotificationMode("urgent"), "urgent");
  assert.equal(normalizeAgentNotificationMode("unexpected"), "all");
  assert.equal(normalizeAgentNotificationMode(undefined), "all");
});

test("all mode forwards every bridge notification level", () => {
  for (const level of ["info", "success", "warning", "error"]) {
    assert.equal(shouldForwardNotification("all", { level }), true);
  }
});

test("urgent mode forwards only needs-action and error levels", () => {
  assert.equal(shouldForwardNotification("urgent", { level: "warning" }), true);
  assert.equal(shouldForwardNotification("urgent", { level: "error" }), true);
  assert.equal(shouldForwardNotification("urgent", { level: "success" }), false);
  assert.equal(shouldForwardNotification("urgent", { level: "info" }), false);
});
