const STICKY_LEVELS = new Set(["warning"]);
const TRANSIENT_LEVELS = new Set(["info", "success", "error"]);
const LEVEL_PRIORITY = {
  warning: 30,
  error: 20,
  success: 10,
  info: 0
};
const MAX_ITEMS = 50;

function timestampMs(value, fallback = Date.now()) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeThreadId(notification) {
  const explicit = notification && notification.threadId;
  if (explicit) return String(explicit).trim().slice(0, 120);
  if (notification && notification.paneId) return `tmux:${notification.paneId}`;
  if (notification && notification.terminalProgram) {
    return `terminal:${notification.source || "terminal"}:${notification.terminalProgram}`;
  }
  return `source:${(notification && notification.source) || "terminal"}`;
}

function notificationStatus(level) {
  return STICKY_LEVELS.has(level) ? "active" : "transient";
}

function withInboxFields(notification, now = Date.now()) {
  const level = notification.level || "info";
  const createdAtMs = timestampMs(notification.createdAt, now);
  const sticky = STICKY_LEVELS.has(level);
  const ttlMs = Number(notification.ttlMs);
  return {
    ...notification,
    threadId: normalizeThreadId(notification),
    status: notification.status || notificationStatus(level),
    sticky,
    createdAtMs,
    expiresAtMs: sticky || !TRANSIENT_LEVELS.has(level) ? null : now + (Number.isFinite(ttlMs) ? ttlMs : 5600),
    actions: Array.isArray(notification.actions) ? notification.actions : []
  };
}

function isActive(item, now) {
  if (!item || item.status !== "active" && item.status !== "transient") return false;
  return !item.expiresAtMs || item.expiresAtMs > now;
}

function compareDisplayItems(a, b) {
  const priorityDelta = (LEVEL_PRIORITY[b.level] || 0) - (LEVEL_PRIORITY[a.level] || 0);
  if (priorityDelta !== 0) return priorityDelta;
  return b.createdAtMs - a.createdAtMs;
}

function countByLevel(items) {
  return items.reduce(
    (counts, item) => {
      if (item.level === "warning") counts.needsAction += 1;
      if (item.level === "error") counts.error += 1;
      if (item.level === "success") counts.success += 1;
      return counts;
    },
    { needsAction: 0, error: 0, success: 0 }
  );
}

function summaryText(display, activeItems) {
  if (!display) return "";
  const otherItems = activeItems.filter((item) => item.id !== display.id);
  const counts = countByLevel(otherItems);
  const parts = [];
  if (counts.needsAction > 0) parts.push(`${counts.needsAction} 个需交互`);
  if (counts.error > 0) parts.push(`${counts.error} 个错误`);
  if (counts.success > 0) parts.push(`${counts.success} 个完成`);
  return parts.length > 0 ? `还有 ${parts.join("，")}` : "";
}

function createNotificationInbox(options = {}) {
  const maxItems = Math.max(1, Math.round(options.maxItems || MAX_ITEMS));
  const itemsByThread = new Map();

  function prune(now = Date.now()) {
    for (const [threadId, item] of itemsByThread) {
      if (!isActive(item, now)) itemsByThread.delete(threadId);
    }

    if (itemsByThread.size <= maxItems) return;
    const ordered = Array.from(itemsByThread.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
    for (const item of ordered.slice(maxItems)) {
      itemsByThread.delete(item.threadId);
    }
  }

  function activeItems(now = Date.now()) {
    prune(now);
    return Array.from(itemsByThread.values())
      .filter((item) => isActive(item, now))
      .sort(compareDisplayItems);
  }

  function current(now = Date.now()) {
    const items = activeItems(now);
    const display = items[0] || null;
    if (!display) return null;
    return {
      ...display,
      summary: countByLevel(items),
      summaryText: summaryText(display, items)
    };
  }

  return {
    add(notification, now = Date.now()) {
      const item = withInboxFields(notification, now);
      itemsByThread.set(item.threadId, item);
      prune(now);
      return current(now);
    },
    clearThread(notification, now = Date.now()) {
      itemsByThread.delete(normalizeThreadId(notification));
      prune(now);
      return current(now);
    },
    itemFor(notification, now = Date.now()) {
      prune(now);
      return itemsByThread.get(normalizeThreadId(notification)) || null;
    },
    hasStickyThread(notification, now = Date.now()) {
      const item = this.itemFor(notification, now);
      return Boolean(item && item.sticky && isActive(item, now));
    },
    current,
    activeItems,
    clear() {
      itemsByThread.clear();
    },
    get size() {
      prune();
      return itemsByThread.size;
    }
  };
}

module.exports = {
  STICKY_LEVELS,
  createNotificationInbox,
  normalizeThreadId,
  withInboxFields
};
