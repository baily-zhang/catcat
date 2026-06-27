const assert = require("node:assert/strict");
const test = require("node:test");

const { detectFocusContext, detectSource } = require("../src/notification/client");

test("detects terminal notification source", () => {
  assert.equal(detectSource({ TMUX: "/tmp/tmux", TERM_PROGRAM: "iTerm.app" }), "tmux");
  assert.equal(detectSource({ TERM_PROGRAM: "iTerm.app" }), "iterm");
  assert.equal(detectSource({ TERM_PROGRAM: "Apple_Terminal" }), "terminal");
});

test("detects tmux focus context", () => {
  assert.deepEqual(detectFocusContext({ PETSONA_THREAD_ID: "agent-7", TMUX_PANE: "%42", TERM_PROGRAM: "iTerm.app" }), {
    threadId: "agent-7",
    paneId: "%42",
    terminalProgram: "iTerm.app"
  });
});
