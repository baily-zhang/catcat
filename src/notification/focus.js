const { execFileSync } = require("child_process");

const TERMINAL_APP_NAMES = new Set([
  "Alacritty",
  "Ghostty",
  "iTerm",
  "iTerm2",
  "kitty",
  "Rio",
  "Terminal",
  "Warp",
  "WezTerm"
]);

const TERMINAL_SOURCES = new Set(["iterm", "terminal", "tmux"]);

function defaultRunCommand(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 500
  }).trim();
}

function frontmostTerminalState(appName) {
  const normalized = String(appName || "").trim();
  if (!normalized) return "unknown";
  return TERMINAL_APP_NAMES.has(normalized) ? "yes" : "no";
}

function getFrontmostAppName(runCommand = defaultRunCommand) {
  if (process.platform !== "darwin") return "";
  try {
    return runCommand("osascript", [
      "-l",
      "AppleScript",
      "-e",
      'tell application "System Events" to get name of first application process whose frontmost is true'
    ]);
  } catch {
    return "";
  }
}

function parseTmuxPaneState(output) {
  const [windowId, windowActive, paneActive, sessionAttached] = String(output || "").trim().split("\t");
  return {
    windowId,
    windowActive: windowActive === "1",
    paneActive: paneActive === "1",
    sessionAttached: sessionAttached === "1"
  };
}

function parseTmuxClients(output) {
  return String(output || "")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [tty, windowId, flags] = line.split("\t");
      return { tty, windowId, flags: flags || "" };
    });
}

function tmuxPaneIsActivelyViewed(paneId, options = {}) {
  const normalizedPaneId = String(paneId || "").trim();
  if (!normalizedPaneId) return false;

  const terminalState =
    options.terminalState || frontmostTerminalState(options.frontmostAppName || getFrontmostAppName(options.runCommand));
  if (terminalState !== "yes") return false;

  const runCommand = options.runCommand || defaultRunCommand;
  try {
    const pane = parseTmuxPaneState(
      runCommand("tmux", [
        "display-message",
        "-p",
        "-t",
        normalizedPaneId,
        "#{window_id}\t#{window_active}\t#{pane_active}\t#{session_attached}"
      ])
    );
    if (!pane.windowId || !pane.windowActive || !pane.paneActive || !pane.sessionAttached) return false;

    const clients = parseTmuxClients(runCommand("tmux", ["list-clients", "-F", "#{client_tty}\t#{window_id}\t#{client_flags}"]));
    return clients.some((client) => client.windowId === pane.windowId && client.flags.includes("focused"));
  } catch {
    return false;
  }
}

function isTerminalSource(source) {
  return TERMINAL_SOURCES.has(String(source || "").trim().toLowerCase());
}

function shouldSuppressForTerminalFocus(notification, options = {}) {
  const paneId = notification && notification.paneId;
  if (paneId) return tmuxPaneIsActivelyViewed(paneId, options);

  if (!isTerminalSource(notification && notification.source)) return false;
  const terminalState =
    options.terminalState || frontmostTerminalState(options.frontmostAppName || getFrontmostAppName(options.runCommand));
  return terminalState === "yes";
}

module.exports = {
  TERMINAL_APP_NAMES,
  frontmostTerminalState,
  getFrontmostAppName,
  isTerminalSource,
  parseTmuxClients,
  parseTmuxPaneState,
  shouldSuppressForTerminalFocus,
  tmuxPaneIsActivelyViewed
};
