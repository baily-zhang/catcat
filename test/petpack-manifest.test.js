const assert = require("node:assert/strict");
const test = require("node:test");

const { isSafePackagePath, validateManifest } = require("../src/petpack/manifest");

function validManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "petsona.test.pet",
    name: "Test Pet",
    author: "Petsona Studio",
    renderer: {
      type: "webp-sequence",
      width: 512,
      height: 512,
      defaultScale: 1
    },
    actions: {
      idle: {
        type: "webp",
        src: "assets/idle.webp",
        fps: 12,
        loop: true
      },
      blink: {
        type: "webp",
        src: "assets/blink.webp",
        fps: 12,
        loop: false,
        trigger: "idle-random"
      },
      click: {
        type: "webp",
        src: "assets/click.webp",
        fps: 12,
        loop: false,
        trigger: "click"
      }
    },
    preview: {
      thumbnail: "previews/thumbnail.webp"
    },
    entitlements: {
      tier: "basic",
      commercialUse: false,
      watermarked: false
    },
    ...overrides
  };
}

const availableFiles = [
  "assets/idle.webp",
  "assets/blink.webp",
  "assets/click.webp",
  "previews/thumbnail.webp"
];

test("accepts a valid v1 manifest", () => {
  const result = validateManifest(validManifest(), { availableFiles });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("rejects unsupported schema versions", () => {
  const result = validateManifest(validManifest({ schemaVersion: 2 }), { availableFiles });

  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, "schemaVersion.unsupported");
});

test("requires stable identity, renderer, and idle action fields", () => {
  const result = validateManifest({
    schemaVersion: 1,
    id: "",
    name: "",
    renderer: {
      type: "gif",
      width: 0,
      height: -1
    },
    actions: {}
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "id.required"));
  assert.ok(result.errors.some((error) => error.code === "name.required"));
  assert.ok(result.errors.some((error) => error.code === "renderer.type.unsupported"));
  assert.ok(result.errors.some((error) => error.code === "renderer.width.invalid"));
  assert.ok(result.errors.some((error) => error.code === "renderer.height.invalid"));
  assert.ok(result.errors.some((error) => error.code === "actions.idle.required"));
});

test("rejects package paths that escape the archive root", () => {
  assert.equal(isSafePackagePath("assets/idle.webp"), true);
  assert.equal(isSafePackagePath("../idle.webp"), false);
  assert.equal(isSafePackagePath("assets/../idle.webp"), false);
  assert.equal(isSafePackagePath("/assets/idle.webp"), false);
  assert.equal(isSafePackagePath("C:\\assets\\idle.webp"), false);

  const result = validateManifest(
    validManifest({
      actions: {
        idle: {
          type: "webp",
          src: "../idle.webp"
        }
      }
    })
  );

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "action.src.invalid"));
});

test("rejects missing required action assets when an archive file list is provided", () => {
  const result = validateManifest(validManifest(), {
    availableFiles: ["assets/idle.webp", "assets/blink.webp", "previews/thumbnail.webp"]
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === "action.src.missing"));
});

test("warns for missing optional metadata but still imports", () => {
  const result = validateManifest(
    validManifest({
      preview: undefined,
      entitlements: undefined
    }),
    { availableFiles }
  );

  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((warning) => warning.code === "preview.missing"));
  assert.ok(result.warnings.some((warning) => warning.code === "entitlements.missing"));
});

test("warns about unknown actions without rejecting the pack", () => {
  const manifest = validManifest({
    actions: {
      idle: {
        type: "webp",
        src: "assets/idle.webp"
      },
      dance: {
        type: "webp",
        src: "assets/dance.webp"
      }
    }
  });

  const result = validateManifest(manifest, {
    availableFiles: ["assets/idle.webp", "assets/dance.webp"]
  });

  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((warning) => warning.code === "action.name.unknown"));
});

