const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 20177;
const MAX_BODY_BYTES = 12 * 1024;
const LEVELS = new Set(["info", "success", "warning", "error"]);
const DEFAULT_TTL_MS = {
  info: 5600,
  success: 5200,
  warning: 8200,
  error: 10000
};

class NotificationBridgeError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = "NotificationBridgeError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function defaultBridgeFilePath() {
  return path.join(os.homedir(), ".petsona", "bridge.json");
}

function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

function safeString(value, maxLength) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
}

function normalizeTtlMs(value, level) {
  const fallback = DEFAULT_TTL_MS[level] || DEFAULT_TTL_MS.info;
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1200, Math.min(30000, parsed));
}

function normalizeNotificationPayload(input = {}) {
  const level = LEVELS.has(input.level) ? input.level : "info";
  const body = safeString(input.body || input.message || input.text, 900);
  if (!body) {
    throw new NotificationBridgeError("body is required", 400, "body.required");
  }

  return {
    id: safeString(input.id, 80) || `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    source: safeString(input.source, 48) || "terminal",
    level,
    title: safeString(input.title, 120),
    body,
    ttlMs: normalizeTtlMs(input.ttlMs || input.ttl, level),
    createdAt: new Date().toISOString()
  };
}

function tokenMatches(actual, expected) {
  if (!actual || !expected || actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function tokenFromRequest(request) {
  const auth = request.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return String(request.headers["x-petsona-token"] || "").trim();
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new NotificationBridgeError("request body is too large", 413, "body.tooLarge"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new NotificationBridgeError("request body must be valid JSON", 400, "body.invalidJson"));
      }
    });

    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function writeBridgeFile(filePath, config) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), { mode: 0o600 });
}

function createNotificationBridge(options = {}) {
  const host = options.host || DEFAULT_HOST;
  const preferredPort = Number.isInteger(options.port) ? options.port : DEFAULT_PORT;
  const bridgeFilePath = options.bridgeFilePath || defaultBridgeFilePath();
  const token = options.token || newToken();
  const onMessage = typeof options.onMessage === "function" ? options.onMessage : () => {};
  let server = null;
  let activePort = null;

  async function handleRequest(request, response) {
    const url = new URL(request.url || "/", `http://${host}`);
    if (url.pathname !== "/v1/bubble") {
      sendJson(response, 404, { ok: false, error: "not_found" });
      return;
    }
    if (request.method !== "POST") {
      sendJson(response, 405, { ok: false, error: "method_not_allowed" });
      return;
    }
    if (!tokenMatches(tokenFromRequest(request), token)) {
      sendJson(response, 401, { ok: false, error: "unauthorized" });
      return;
    }

    try {
      const body = await readJsonBody(request);
      const notification = normalizeNotificationPayload(body);
      await onMessage(notification);
      sendJson(response, 200, { ok: true, notification });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      sendJson(response, statusCode, {
        ok: false,
        error: error.code || "bridge.error",
        message: error.message
      });
    }
  }

  function listenOn(port) {
    return new Promise((resolve, reject) => {
      const nextServer = http.createServer((request, response) => {
        handleRequest(request, response);
      });
      nextServer.once("error", reject);
      nextServer.listen(port, host, () => {
        nextServer.removeAllListeners("error");
        server = nextServer;
        activePort = nextServer.address().port;
        writeBridgeFile(bridgeFilePath, {
          schemaVersion: 1,
          app: "Petsona",
          host,
          port: activePort,
          token,
          endpoint: `http://${host}:${activePort}/v1/bubble`
        });
        resolve();
      });
    });
  }

  return {
    get host() {
      return host;
    },
    get port() {
      return activePort;
    },
    get token() {
      return token;
    },
    get bridgeFilePath() {
      return bridgeFilePath;
    },
    async start() {
      try {
        await listenOn(preferredPort);
      } catch (error) {
        if (error.code !== "EADDRINUSE" || preferredPort === 0) throw error;
        await listenOn(0);
      }
      return this;
    },
    close({ removeFile = true } = {}) {
      if (server) {
        server.close();
        server = null;
      }
      if (removeFile) {
        fs.rmSync(bridgeFilePath, { force: true });
      }
    }
  };
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  LEVELS,
  NotificationBridgeError,
  createNotificationBridge,
  defaultBridgeFilePath,
  normalizeNotificationPayload
};
