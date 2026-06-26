const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { openPetpackArchive } = require("./archive");
const { isSafePackagePath, validateManifest } = require("./manifest");

class PetpackImportError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "PetpackImportError";
    this.code = code;
    this.details = details;
  }
}

function slugify(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "petpack";
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").slice(0, 12);
}

function collectReferencedAssets(manifest, availableFiles) {
  const referenced = new Set();
  for (const action of Object.values(manifest.actions || {})) {
    if (action && isSafePackagePath(action.src)) {
      referenced.add(action.src);
    }
  }
  for (const src of Object.values(manifest.preview || {})) {
    if (isSafePackagePath(src) && availableFiles.has(src)) {
      referenced.add(src);
    }
  }
  return referenced;
}

function extractedPath(packDir, packagePath) {
  return path.join(packDir, "assets", ...packagePath.split(/[\\/]+/));
}

function normalizeIssues(issues) {
  return issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path
  }));
}

function importPetpack(sourcePath, options = {}) {
  const petpacksDir = options.petpacksDir;
  if (!petpacksDir) {
    throw new TypeError("petpacksDir is required");
  }
  if (path.extname(sourcePath).toLowerCase() !== ".petpack") {
    throw new PetpackImportError("Only .petpack files can be imported.", "petpack.extension.unsupported");
  }

  const archive = openPetpackArchive(sourcePath);
  if (!archive.hasFile("manifest.json")) {
    throw new PetpackImportError("manifest.json is missing.", "manifest.missing");
  }

  const availableFiles = new Set(archive.listFiles());
  const manifest = archive.readJson("manifest.json");
  const validation = validateManifest(manifest, { availableFiles });
  if (!validation.valid) {
    throw new PetpackImportError("Pet Pack manifest is invalid.", "manifest.invalid", {
      errors: normalizeIssues(validation.errors),
      warnings: normalizeIssues(validation.warnings)
    });
  }

  const contentHash = hashFile(sourcePath);
  const id = `petpack-${slugify(manifest.id)}-${contentHash}`;
  const packDir = path.join(petpacksDir, id);
  const stagingDir = path.join(petpacksDir, `.${id}-${process.pid}-${Date.now()}.tmp`);
  const sourceCopyPath = path.join(packDir, "source.petpack");
  const manifestCopyPath = path.join(packDir, "manifest.json");

  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  try {
    fs.copyFileSync(sourcePath, path.join(stagingDir, "source.petpack"));
    fs.writeFileSync(path.join(stagingDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    const referencedAssets = collectReferencedAssets(manifest, availableFiles);
    const extractedAssets = {};
    const stagedAssets = {};
    for (const packagePath of referencedAssets) {
      const destination = extractedPath(stagingDir, packagePath);
      archive.extractFile(packagePath, destination);
      stagedAssets[packagePath] = destination;
      extractedAssets[packagePath] = path.join(packDir, path.relative(stagingDir, destination));
    }

    const idle = manifest.actions.idle;
    if (!stagedAssets[idle.src] || !fs.existsSync(stagedAssets[idle.src])) {
      throw new PetpackImportError("The idle action asset could not be extracted.", "action.idle.extractFailed");
    }

    fs.rmSync(packDir, { recursive: true, force: true });
    fs.renameSync(stagingDir, packDir);

    const idlePath = extractedAssets[idle.src];

    const actions = {};
    for (const [name, action] of Object.entries(manifest.actions || {})) {
      actions[name] = {
        ...action,
        path: extractedAssets[action.src] || null
      };
    }

    return {
      id,
      label: manifest.name,
      kind: idle.type === "webp" ? "image" : idle.type,
      path: idlePath,
      petpack: {
        id: manifest.id,
        name: manifest.name,
        sourcePath: sourceCopyPath,
        storagePath: packDir,
        manifestPath: manifestCopyPath,
        manifest,
        actions,
        warnings: normalizeIssues(validation.warnings)
      }
    };
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

module.exports = {
  PetpackImportError,
  importPetpack
};
