function normalizeAgentNotificationMode(mode) {
  return mode === "urgent" ? "urgent" : "all";
}

function shouldForwardNotification(mode, notification) {
  if (normalizeAgentNotificationMode(mode) !== "urgent") return true;
  return notification && (notification.level === "warning" || notification.level === "error");
}

module.exports = {
  normalizeAgentNotificationMode,
  shouldForwardNotification
};
