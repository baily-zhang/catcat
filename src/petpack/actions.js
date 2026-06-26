const DEFAULT_ACTION_DURATION_MS = 900;
const LOOPING_ACTIONS = new Set(["idle", "drag"]);

function actionFor(asset, actionName) {
  const actions = (asset && asset.actions) || (asset && asset.petpack && asset.petpack.actions) || {};
  if (actions[actionName]) return actions[actionName];
  if (actionName !== "idle" && actions.idle) return actions.idle;
  return null;
}

function actionDurationMs(action, fallback = DEFAULT_ACTION_DURATION_MS) {
  if (!action || LOOPING_ACTIONS.has(action.name)) return null;
  const duration = Number(action.durationMs);
  return Number.isFinite(duration) && duration > 0 ? Math.round(duration) : fallback;
}

function actionDisplayKind(action) {
  if (!action) return "none";
  if (action.type === "sprite" || action.type === "sprite-state") return "sprite";
  if (action.type === "webm" || action.type === "mp4" || action.type === "mov") return "video";
  return "image";
}

module.exports = {
  DEFAULT_ACTION_DURATION_MS,
  actionDisplayKind,
  actionDurationMs,
  actionFor
};
