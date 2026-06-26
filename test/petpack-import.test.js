const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const zlib = require("zlib");

const { openPetpackArchive } = require("../src/petpack/archive");
const { PetpackImportError, importPetpack } = require("../src/petpack/importer");

function headerBuffer(size) {
  return Buffer.alloc(size);
}

function localHeader(name, compressedSize, uncompressedSize, method) {
  const nameBuffer = Buffer.from(name);
  const header = headerBuffer(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(method, 8);
  header.writeUInt32LE(0, 10);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(compressedSize, 18);
  header.writeUInt32LE(uncompressedSize, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  return Buffer.concat([header, nameBuffer]);
}

function centralHeader(name, compressedSize, uncompressedSize, method, localOffset) {
  const nameBuffer = Buffer.from(name);
  const header = headerBuffer(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(method, 10);
  header.writeUInt32LE(0, 12);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(compressedSize, 20);
  header.writeUInt32LE(uncompressedSize, 24);
  header.writeUInt16LE(nameBuffer.length, 28);
  header.writeUInt32LE(localOffset, 42);
  return Buffer.concat([header, nameBuffer]);
}

function endOfCentralDirectory(entryCount, centralSize, centralOffset) {
  const header = headerBuffer(22);
  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(entryCount, 8);
  header.writeUInt16LE(entryCount, 10);
  header.writeUInt32LE(centralSize, 12);
  header.writeUInt32LE(centralOffset, 16);
  return header;
}

function createPetpack(filePath, entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const [name, value] of Object.entries(entries)) {
    const raw = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const method = name.endsWith(".json") ? 8 : 0;
    const data = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const local = localHeader(name, data.length, raw.length, method);
    locals.push(local, data);
    centrals.push(centralHeader(name, data.length, raw.length, method, offset));
    offset += local.length + data.length;
  }

  const centralOffset = offset;
  const centralDirectory = Buffer.concat(centrals);
  const eocd = endOfCentralDirectory(Object.keys(entries).length, centralDirectory.length, centralOffset);
  fs.writeFileSync(filePath, Buffer.concat([...locals, centralDirectory, eocd]));
}

function validManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    id: "petsona.test.import",
    name: "Import Test Pet",
    renderer: {
      type: "webp-sequence",
      width: 512,
      height: 512
    },
    actions: {
      idle: {
        type: "webp",
        src: "assets/idle.webp",
        fps: 12,
        loop: true
      },
      click: {
        type: "webp",
        src: "assets/click.webp",
        fps: 12,
        loop: false,
        trigger: "click"
      },
      drag: {
        type: "webp",
        src: "assets/drag.webp",
        fps: 12,
        loop: true,
        trigger: "drag"
      }
    },
    preview: {
      thumbnail: "previews/thumb.webp"
    },
    entitlements: {
      tier: "basic"
    },
    ...overrides
  };
}

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "petsona-import-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("petpack archive reader lists files and reads deflated manifest JSON", (t) => {
  const dir = tempDir(t);
  const sourcePath = path.join(dir, "reader.petpack");
  createPetpack(sourcePath, {
    "manifest.json": JSON.stringify(validManifest()),
    "assets/idle.webp": Buffer.from("idle image")
  });

  const archive = openPetpackArchive(sourcePath);

  assert.deepEqual(archive.listFiles().sort(), ["assets/idle.webp", "manifest.json"]);
  assert.equal(archive.readJson("manifest.json").name, "Import Test Pet");
  assert.equal(archive.readFile("assets/idle.webp").toString(), "idle image");
});

test("imports a valid petpack into app-managed storage", (t) => {
  const dir = tempDir(t);
  const sourcePath = path.join(dir, "valid.petpack");
  const petpacksDir = path.join(dir, "userData", "petpacks");
  createPetpack(sourcePath, {
    "manifest.json": JSON.stringify(validManifest()),
    "assets/idle.webp": Buffer.from("idle image"),
    "assets/click.webp": Buffer.from("click image"),
    "assets/drag.webp": Buffer.from("drag image"),
    "previews/thumb.webp": Buffer.from("thumbnail")
  });

  const asset = importPetpack(sourcePath, { petpacksDir });

  assert.match(asset.id, /^petpack-petsona\.test\.import-[a-f0-9]{12}$/);
  assert.equal(asset.label, "Import Test Pet");
  assert.equal(asset.kind, "petpack");
  assert.equal(fs.readFileSync(asset.path, "utf8"), "idle image");
  assert.equal(fs.existsSync(asset.petpack.sourcePath), true);
  assert.deepEqual(fs.readFileSync(asset.petpack.sourcePath), fs.readFileSync(sourcePath));
  assert.equal(fs.existsSync(asset.petpack.manifestPath), true);
  assert.equal(fs.existsSync(asset.petpack.actions.idle.path), true);
  assert.equal(fs.readFileSync(asset.actions.click.path, "utf8"), "click image");
  assert.equal(fs.readFileSync(asset.actions.drag.path, "utf8"), "drag image");
  assert.deepEqual(asset.petpack.warnings, []);
});

test("imports valid petpacks that only have optional metadata warnings", (t) => {
  const dir = tempDir(t);
  const sourcePath = path.join(dir, "warnings.petpack");
  createPetpack(sourcePath, {
    "manifest.json": JSON.stringify(
      validManifest({
        preview: undefined,
        entitlements: undefined
      })
    ),
    "assets/idle.webp": Buffer.from("idle image"),
    "assets/click.webp": Buffer.from("click image"),
    "assets/drag.webp": Buffer.from("drag image")
  });

  const asset = importPetpack(sourcePath, { petpacksDir: path.join(dir, "petpacks") });

  assert.equal(fs.existsSync(asset.path), true);
  assert.ok(asset.petpack.warnings.some((issue) => issue.code === "preview.missing"));
  assert.ok(asset.petpack.warnings.some((issue) => issue.code === "entitlements.missing"));
});

test("rejects petpacks without a manifest", (t) => {
  const dir = tempDir(t);
  const sourcePath = path.join(dir, "missing-manifest.petpack");
  createPetpack(sourcePath, {
    "assets/idle.webp": Buffer.from("idle image")
  });

  assert.throws(
    () => importPetpack(sourcePath, { petpacksDir: path.join(dir, "petpacks") }),
    (error) => error instanceof PetpackImportError && error.code === "manifest.missing"
  );
});

test("rejects petpacks with missing required action files", (t) => {
  const dir = tempDir(t);
  const sourcePath = path.join(dir, "missing-action.petpack");
  createPetpack(sourcePath, {
    "manifest.json": JSON.stringify(validManifest())
  });

  assert.throws(
    () => importPetpack(sourcePath, { petpacksDir: path.join(dir, "petpacks") }),
    (error) => {
      assert.equal(error instanceof PetpackImportError, true);
      assert.equal(error.code, "manifest.invalid");
      assert.ok(error.details.errors.some((issue) => issue.code === "action.src.missing"));
      return true;
    }
  );
});

test("rejects petpacks whose manifest tries to escape the package root", (t) => {
  const dir = tempDir(t);
  const sourcePath = path.join(dir, "unsafe.petpack");
  createPetpack(sourcePath, {
    "manifest.json": JSON.stringify(
      validManifest({
        actions: {
          idle: {
            type: "webp",
            src: "../idle.webp"
          }
        }
      })
    ),
    "idle.webp": Buffer.from("idle image")
  });

  assert.throws(
    () => importPetpack(sourcePath, { petpacksDir: path.join(dir, "petpacks") }),
    (error) => {
      assert.equal(error instanceof PetpackImportError, true);
      assert.equal(error.code, "manifest.invalid");
      assert.ok(error.details.errors.some((issue) => issue.code === "action.src.invalid"));
      return true;
    }
  );
  assert.equal(fs.existsSync(path.join(dir, "idle.webp")), false);
});
