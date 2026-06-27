const assert = require("node:assert/strict");
const test = require("node:test");

const {
  frontmostTerminalState,
  parseTmuxClients,
  parseTmuxPaneState,
  shouldSuppressForTerminalFocus,
  tmuxPaneIsActivelyViewed
} = require("../src/notification/focus");

test("classifies frontmost terminal apps", () => {
  assert.equal(frontmostTerminalState("iTerm2"), "yes");
  assert.equal(frontmostTerminalState("Terminal"), "yes");
  assert.equal(frontmostTerminalState("Arc"), "no");
  assert.equal(frontmostTerminalState(""), "unknown");
});

test("parses tmux pane and client state", () => {
  assert.deepEqual(parseTmuxPaneState("@12\t1\t1\t1"), {
    windowId: "@12",
    windowActive: true,
    paneActive: true,
    sessionAttached: true
  });
  assert.deepEqual(parseTmuxClients("/dev/ttys001\t@12\tfocused,active\n/dev/ttys002\t@13\t"), [
    { tty: "/dev/ttys001", windowId: "@12", flags: "focused,active" },
    { tty: "/dev/ttys002", windowId: "@13", flags: "" }
  ]);
});

test("detects when a tmux pane is actively viewed", () => {
  const runCommand = (command, args) => {
    assert.equal(command, "tmux");
    if (args[0] === "display-message") return "@12\t1\t1\t1";
    if (args[0] === "list-clients") return "/dev/ttys001\t@12\tfocused,active";
    throw new Error(`unexpected command: ${args.join(" ")}`);
  };

  assert.equal(tmuxPaneIsActivelyViewed("%42", { runCommand, terminalState: "yes" }), true);
  assert.equal(tmuxPaneIsActivelyViewed("%42", { runCommand, terminalState: "no" }), false);
});

test("suppresses terminal notifications only when the relevant terminal context is focused", () => {
  assert.equal(shouldSuppressForTerminalFocus({ source: "terminal" }, { terminalState: "yes" }), true);
  assert.equal(shouldSuppressForTerminalFocus({ source: "terminal" }, { terminalState: "no" }), false);
  assert.equal(shouldSuppressForTerminalFocus({ source: "github" }, { terminalState: "yes" }), false);

  const runCommand = (_command, args) => {
    if (args[0] === "display-message") return "@12\t1\t1\t1";
    if (args[0] === "list-clients") return "/dev/ttys001\t@12\tfocused,active";
    return "";
  };
  assert.equal(shouldSuppressForTerminalFocus({ source: "tmux", paneId: "%42" }, { runCommand, terminalState: "yes" }), true);
  assert.equal(shouldSuppressForTerminalFocus({ source: "tmux", paneId: "%42" }, { runCommand, terminalState: "no" }), false);
});
