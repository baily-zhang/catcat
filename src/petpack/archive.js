const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP64_SENTINEL = 0xffffffff;
const MAX_MANIFEST_BYTES = 1024 * 1024;

class PetpackArchiveError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "PetpackArchiveError";
    this.code = code;
  }
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  throw new PetpackArchiveError("The file is not a readable petpack archive.", "archive.invalid");
}

function parseEntries(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (centralDirectorySize === ZIP64_SENTINEL || centralDirectoryOffset === ZIP64_SENTINEL) {
    throw new PetpackArchiveError("ZIP64 petpack archives are not supported yet.", "archive.zip64.unsupported");
  }

  const entries = new Map();
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new PetpackArchiveError("The petpack central directory is corrupt.", "archive.centralDirectory.invalid");
    }

    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    const name = buffer.toString("utf8", nameStart, nameEnd);

    if (flags & 1) {
      throw new PetpackArchiveError("Encrypted petpack entries are not supported.", "archive.encrypted.unsupported");
    }
    if (compressedSize === ZIP64_SENTINEL || uncompressedSize === ZIP64_SENTINEL) {
      throw new PetpackArchiveError("ZIP64 petpack entries are not supported yet.", "archive.zip64.unsupported");
    }
    if (!name.endsWith("/")) {
      if (entries.has(name)) {
        throw new PetpackArchiveError(`Duplicate petpack entry: ${name}`, "archive.entry.duplicate");
      }
      entries.set(name, {
        name,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        localHeaderOffset
      });
    }

    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}

class PetpackArchive {
  constructor(filePath, buffer, entries) {
    this.filePath = filePath;
    this.buffer = buffer;
    this.entries = entries;
  }

  listFiles() {
    return Array.from(this.entries.keys());
  }

  hasFile(name) {
    return this.entries.has(name);
  }

  readFile(name) {
    const entry = this.entries.get(name);
    if (!entry) {
      throw new PetpackArchiveError(`Missing petpack entry: ${name}`, "archive.entry.missing");
    }

    const localOffset = entry.localHeaderOffset;
    if (localOffset + 30 > this.buffer.length || this.buffer.readUInt32LE(localOffset) !== LOCAL_FILE_SIGNATURE) {
      throw new PetpackArchiveError(`Invalid local file header for ${name}.`, "archive.localHeader.invalid");
    }

    const fileNameLength = this.buffer.readUInt16LE(localOffset + 26);
    const extraLength = this.buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + fileNameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > this.buffer.length) {
      throw new PetpackArchiveError(`Entry data is truncated: ${name}`, "archive.entry.truncated");
    }

    const compressed = this.buffer.subarray(dataStart, dataEnd);
    if (entry.compressionMethod === 0) {
      return Buffer.from(compressed);
    }
    if (entry.compressionMethod === 8) {
      return zlib.inflateRawSync(compressed);
    }

    throw new PetpackArchiveError(
      `Unsupported compression method ${entry.compressionMethod} for ${name}.`,
      "archive.compression.unsupported"
    );
  }

  readJson(name) {
    const data = this.readFile(name);
    if (data.length > MAX_MANIFEST_BYTES) {
      throw new PetpackArchiveError(`${name} is too large.`, "archive.manifest.tooLarge");
    }

    try {
      return JSON.parse(data.toString("utf8"));
    } catch {
      throw new PetpackArchiveError(`${name} is not valid JSON.`, "archive.manifest.invalidJson");
    }
  }

  extractFile(name, destinationPath) {
    const data = this.readFile(name);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, data);
  }
}

function openPetpackArchive(filePath) {
  const buffer = fs.readFileSync(filePath);
  return new PetpackArchive(filePath, buffer, parseEntries(buffer));
}

module.exports = {
  PetpackArchiveError,
  openPetpackArchive
};
