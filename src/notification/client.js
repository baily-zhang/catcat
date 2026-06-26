const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

function defaultBridgeFilePath() {
  return path.join(os.homedir(), ".petsona", "bridge.json");
}

function loadBridgeConfig(filePath = process.env.PETSONA_BRIDGE_FILE || defaultBridgeFilePath()) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Petsona bridge is not available. Start Petsona Player first. (${filePath})`);
  }
}

function detectSource(env = process.env) {
  if (env.TMUX) return "tmux";
  if (env.TERM_PROGRAM === "iTerm.app") return "iterm";
  if (env.TERM_PROGRAM === "Apple_Terminal") return "terminal";
  return env.TERM_PROGRAM || "terminal";
}

function sendNotification(payload, options = {}) {
  const bridge = options.bridge || loadBridgeConfig(options.bridgeFilePath);
  const endpoint = new URL(bridge.endpoint || `http://${bridge.host}:${bridge.port}/v1/bubble`);
  const body = JSON.stringify({
    source: detectSource(),
    ...payload
  });

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: endpoint.hostname,
        port: endpoint.port,
        path: endpoint.pathname,
        method: "POST",
        headers: {
          authorization: `Bearer ${bridge.token}`,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body)
        }
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let result = {};
          try {
            result = text ? JSON.parse(text) : {};
          } catch {
            result = { ok: false, message: text };
          }
          if (response.statusCode >= 200 && response.statusCode < 300 && result.ok !== false) {
            resolve(result);
          } else {
            reject(new Error(result.message || result.error || `Petsona bridge returned ${response.statusCode}`));
          }
        });
      }
    );

    request.on("error", (error) => {
      reject(new Error(`Could not reach Petsona bridge: ${error.message}`));
    });
    request.write(body);
    request.end();
  });
}

module.exports = {
  defaultBridgeFilePath,
  detectSource,
  loadBridgeConfig,
  sendNotification
};
