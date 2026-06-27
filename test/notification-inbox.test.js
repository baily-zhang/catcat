const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createNotificationInbox,
  normalizeThreadId,
  withInboxFields
} = require("../src/notification/inbox");

test("derives stable notification thread ids", () => {
  assert.equal(normalizeThreadId({ threadId: "agent-1", source: "codex" }), "agent-1");
  assert.equal(normalizeThreadId({ paneId: "%42", source: "tmux" }), "tmux:%42");
  assert.equal(
    normalizeThreadId({ source: "terminal", terminalProgram: "Apple_Terminal" }),
    "terminal:terminal:Apple_Terminal"
  );
  assert.equal(normalizeThreadId({ source: "codex" }), "source:codex");
});

test("marks needs-action notifications as sticky", () => {
  const item = withInboxFields({
    id: "n1",
    level: "warning",
    source: "codex",
    body: "confirm"
  }, 1000);

  assert.equal(item.sticky, true);
  assert.equal(item.status, "active");
  assert.equal(item.expiresAtMs, null);
});

test("keeps one active result per thread", () => {
  const inbox = createNotificationInbox();
  inbox.add({ id: "a", threadId: "t1", level: "warning", source: "codex", body: "confirm", ttlMs: 8000 }, 1000);
  const current = inbox.add({ id: "b", threadId: "t1", level: "success", source: "codex", body: "done", ttlMs: 5000 }, 1200);

  assert.equal(inbox.activeItems(1200).length, 1);
  assert.equal(current.id, "b");
  assert.equal(current.level, "success");
  assert.equal(current.sticky, false);
});

test("schedules mixed notification display by priority and summary", () => {
  const inbox = createNotificationInbox();
  inbox.add({ id: "ok", threadId: "build", level: "success", source: "codex", body: "done", ttlMs: 5000 }, 1000);
  inbox.add({ id: "err", threadId: "test", level: "error", source: "codex", body: "failed", ttlMs: 5000 }, 1100);
  const current = inbox.add({ id: "ask", threadId: "deploy", level: "warning", source: "codex", body: "approve", ttlMs: 5000 }, 1200);

  assert.equal(current.id, "ask");
  assert.equal(current.summary.needsAction, 1);
  assert.equal(current.summary.error, 1);
  assert.equal(current.summary.success, 1);
  assert.equal(current.summaryText, "还有 1 个错误，1 个完成");
});

test("expires transient notifications but keeps sticky notifications", () => {
  const inbox = createNotificationInbox();
  inbox.add({ id: "ok", threadId: "build", level: "success", source: "codex", body: "done", ttlMs: 1000 }, 1000);
  inbox.add({ id: "ask", threadId: "deploy", level: "warning", source: "codex", body: "approve", ttlMs: 1000 }, 1100);

  assert.equal(inbox.activeItems(1500).length, 2);
  assert.equal(inbox.activeItems(2101).length, 1);
  assert.equal(inbox.current(2101).id, "ask");
});

test("detects sticky state for matching notification threads", () => {
  const inbox = createNotificationInbox();
  inbox.add({ id: "ask", paneId: "%7", level: "warning", source: "tmux", body: "approve" }, 1000);

  assert.equal(inbox.hasStickyThread({ paneId: "%7", level: "success", source: "tmux" }, 1200), true);
  assert.equal(inbox.hasStickyThread({ paneId: "%8", level: "success", source: "tmux" }, 1200), false);

  inbox.add({ id: "ok", paneId: "%7", level: "success", source: "tmux", body: "done", ttlMs: 1000 }, 1300);
  assert.equal(inbox.hasStickyThread({ paneId: "%7", level: "success", source: "tmux" }, 1400), false);
});

test("clears a matching notification thread", () => {
  const inbox = createNotificationInbox();
  inbox.add({ id: "ask", threadId: "tmux:%7", level: "warning", source: "tmux", body: "approve" }, 1000);
  inbox.add({ id: "err", threadId: "tmux:%8", level: "error", source: "tmux", body: "failed" }, 1100);

  const current = inbox.clearThread({ threadId: "tmux:%7" }, 1200);

  assert.equal(inbox.hasStickyThread({ threadId: "tmux:%7" }, 1200), false);
  assert.equal(current.id, "err");
});
