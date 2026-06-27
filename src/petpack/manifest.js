const SUPPORTED_SCHEMA_VERSION = 1;
const SUPPORTED_RENDERERS = new Set(["webp-sequence"]);
const SUPPORTED_ACTION_TYPES = new Set(["webp", "png", "webm", "mp4", "mov"]);
const V1_ACTIONS = new Set(["idle", "blink", "click"]);
const OPTIONAL_ACTIONS = new Set([
  "drag",
  "needsAction",
  "error",
  "success",
  "lookAround",
  "hover",
  "sleep",
  "message"
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isSafePackagePath(value) {
  if (!isNonEmptyString(value)) return false;
  if (value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(value)) {
    return false;
  }

  const parts = value.split(/[\\/]+/);
  return parts.every((part) => part && part !== "." && part !== "..");
}

function hasFile(fileSet, src) {
  return !fileSet || fileSet.has(src);
}

function normalizeAvailableFiles(availableFiles) {
  if (!availableFiles) return null;
  if (availableFiles instanceof Set) return availableFiles;
  if (Array.isArray(availableFiles)) return new Set(availableFiles);
  throw new TypeError("availableFiles must be an array or Set when provided");
}

function addIssue(list, code, message, path) {
  list.push({ code, message, path });
}

function validateAction(name, action, errors, warnings, fileSet) {
  const path = `actions.${name}`;

  if (!isPlainObject(action)) {
    addIssue(errors, "action.invalid", `Action "${name}" must be an object.`, path);
    return;
  }

  if (!SUPPORTED_ACTION_TYPES.has(action.type)) {
    addIssue(errors, "action.type.unsupported", `Action "${name}" has an unsupported type.`, `${path}.type`);
  }

  if (!isSafePackagePath(action.src)) {
    addIssue(errors, "action.src.invalid", `Action "${name}" must reference a package-local asset path.`, `${path}.src`);
  } else if (!hasFile(fileSet, action.src)) {
    addIssue(errors, "action.src.missing", `Action "${name}" references a missing asset.`, `${path}.src`);
  }

  if (action.fps !== undefined && !isPositiveInteger(action.fps)) {
    addIssue(errors, "action.fps.invalid", `Action "${name}" fps must be a positive integer.`, `${path}.fps`);
  }

  if (action.loop !== undefined && typeof action.loop !== "boolean") {
    addIssue(errors, "action.loop.invalid", `Action "${name}" loop must be a boolean.`, `${path}.loop`);
  }

  if (action.trigger !== undefined && !isNonEmptyString(action.trigger)) {
    addIssue(errors, "action.trigger.invalid", `Action "${name}" trigger must be a non-empty string.`, `${path}.trigger`);
  }

  if (!V1_ACTIONS.has(name) && !OPTIONAL_ACTIONS.has(name)) {
    addIssue(warnings, "action.name.unknown", `Action "${name}" is not recognized by the current renderer.`, path);
  }
}

function validateManifest(manifest, options = {}) {
  const errors = [];
  const warnings = [];
  const fileSet = normalizeAvailableFiles(options.availableFiles);

  if (!isPlainObject(manifest)) {
    addIssue(errors, "manifest.invalid", "Manifest must be a JSON object.", "manifest");
    return { valid: false, errors, warnings };
  }

  if (manifest.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    addIssue(
      errors,
      "schemaVersion.unsupported",
      `schemaVersion must be ${SUPPORTED_SCHEMA_VERSION}.`,
      "schemaVersion"
    );
  }

  if (!isNonEmptyString(manifest.id)) {
    addIssue(errors, "id.required", "id is required.", "id");
  }

  if (!isNonEmptyString(manifest.name)) {
    addIssue(errors, "name.required", "name is required.", "name");
  }

  if (!isPlainObject(manifest.renderer)) {
    addIssue(errors, "renderer.required", "renderer is required.", "renderer");
  } else {
    if (!SUPPORTED_RENDERERS.has(manifest.renderer.type)) {
      addIssue(errors, "renderer.type.unsupported", "renderer.type is unsupported.", "renderer.type");
    }

    if (!isPositiveInteger(manifest.renderer.width)) {
      addIssue(errors, "renderer.width.invalid", "renderer.width must be a positive integer.", "renderer.width");
    }

    if (!isPositiveInteger(manifest.renderer.height)) {
      addIssue(errors, "renderer.height.invalid", "renderer.height must be a positive integer.", "renderer.height");
    }

    if (
      manifest.renderer.defaultScale !== undefined &&
      (typeof manifest.renderer.defaultScale !== "number" || manifest.renderer.defaultScale <= 0)
    ) {
      addIssue(
        errors,
        "renderer.defaultScale.invalid",
        "renderer.defaultScale must be a positive number.",
        "renderer.defaultScale"
      );
    }
  }

  if (!isPlainObject(manifest.actions)) {
    addIssue(errors, "actions.required", "actions is required.", "actions");
  } else {
    if (!isPlainObject(manifest.actions.idle)) {
      addIssue(errors, "actions.idle.required", "actions.idle is required.", "actions.idle");
    }

    for (const [name, action] of Object.entries(manifest.actions)) {
      validateAction(name, action, errors, warnings, fileSet);
    }
  }

  if (!isPlainObject(manifest.preview)) {
    addIssue(warnings, "preview.missing", "preview metadata is missing.", "preview");
  } else {
    for (const [name, src] of Object.entries(manifest.preview)) {
      const path = `preview.${name}`;
      if (!isSafePackagePath(src)) {
        addIssue(warnings, "preview.src.invalid", `Preview "${name}" should reference a package-local path.`, path);
      } else if (!hasFile(fileSet, src)) {
        addIssue(warnings, "preview.src.missing", `Preview "${name}" references a missing asset.`, path);
      }
    }
  }

  if (!isPlainObject(manifest.entitlements)) {
    addIssue(warnings, "entitlements.missing", "entitlement metadata is missing.", "entitlements");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

module.exports = {
  SUPPORTED_SCHEMA_VERSION,
  validateManifest,
  isSafePackagePath
};
