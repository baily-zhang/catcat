const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_ACTION_DURATION_MS,
  actionDisplayKind,
  actionDurationMs,
  actionFor
} = require("../src/petpack/actions");

test("resolves requested actions and falls back to idle", () => {
  const asset = {
    actions: {
      idle: { name: "idle", type: "webp" },
      click: { name: "click", type: "webp" }
    }
  };

  assert.equal(actionFor(asset, "click").name, "click");
  assert.equal(actionFor(asset, "drag").name, "idle");
  assert.equal(actionFor(asset, "idle").name, "idle");
});

test("maps action media types to renderer kinds", () => {
  assert.equal(actionDisplayKind({ type: "sprite-state" }), "sprite");
  assert.equal(actionDisplayKind({ type: "webm" }), "video");
  assert.equal(actionDisplayKind({ type: "webp" }), "image");
  assert.equal(actionDisplayKind(null), "none");
});

test("uses finite durations for one-shot actions only", () => {
  assert.equal(actionDurationMs({ name: "click", durationMs: 1200 }), 1200);
  assert.equal(actionDurationMs({ name: "click" }), DEFAULT_ACTION_DURATION_MS);
  assert.equal(actionDurationMs({ name: "idle", durationMs: 1200 }), null);
  assert.equal(actionDurationMs({ name: "drag", durationMs: 1200 }), null);
});
