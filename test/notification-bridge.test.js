const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const test = require("node:test");

const { createNotificationBridge, normalizeNotificationPayload } = require("../src/notification/bridge");
const { sendNotification } = require("../src/notification/client");

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "petsona-bridge-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function postJson({ port, token, payload }) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/v1/bubble",
        method: "POST",
        headers: {
          authorization: token ? `Bearer ${token}` : "",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body)
        }
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
          });
        });
      }
    );
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

test("normalizes terminal notification payloads", () => {
  const payload = normalizeNotificationPayload({
    source: "tmux",
    level: "error",
    title: "Build failed",
    body: "npm test failed",
    threadId: "agent-build",
    paneId: "%42",
    terminalProgram: "iTerm.app",
    actions: [{ id: "open", label: "查看", type: "focus_source", payload: { paneId: "%42" } }],
    ttlMs: 9000
  });

  assert.equal(payload.source, "tmux");
  assert.equal(payload.level, "error");
  assert.equal(payload.title, "Build failed");
  assert.equal(payload.body, "npm test failed");
  assert.equal(payload.threadId, "agent-build");
  assert.equal(payload.paneId, "%42");
  assert.equal(payload.terminalProgram, "iTerm.app");
  assert.deepEqual(payload.actions, [{ id: "open", label: "查看", type: "focus_source", payload: { paneId: "%42" } }]);
  assert.equal(payload.ttlMs, 9000);
  assert.match(payload.createdAt, /^\d{4}-/);
});

test("normalizes agent notification level aliases", () => {
  assert.equal(normalizeNotificationPayload({ level: "needs_action", body: "check" }).level, "warning");
  assert.equal(normalizeNotificationPayload({ level: "needs-action", body: "check" }).level, "warning");
  assert.equal(normalizeNotificationPayload({ level: "done", body: "ok" }).level, "success");
  assert.equal(normalizeNotificationPayload({ level: "failed", body: "no" }).level, "error");
});

test("bridge writes credentials and forwards authorized bubble messages", async (t) => {
  const dir = tempDir(t);
  const received = [];
  const bridge = await createNotificationBridge({
    port: 0,
    token: "test-token",
    bridgeFilePath: path.join(dir, "bridge.json"),
    onMessage: (message) => received.push(message)
  }).start();
  t.after(() => bridge.close());

  const bridgeFile = JSON.parse(fs.readFileSync(path.join(dir, "bridge.json"), "utf8"));
  assert.equal(bridgeFile.token, "test-token");
  assert.equal(bridgeFile.port, bridge.port);
  assert.equal(bridgeFile.endpoint, `http://127.0.0.1:${bridge.port}/v1/bubble`);

  const response = await postJson({
    port: bridge.port,
    token: "test-token",
    payload: {
      source: "iterm",
      level: "success",
      body: "done"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(received.length, 1);
  assert.equal(received[0].source, "iterm");
  assert.equal(received[0].level, "success");
  assert.equal(received[0].body, "done");
});

test("bridge rejects unauthorized and invalid requests", async (t) => {
  const dir = tempDir(t);
  const bridge = await createNotificationBridge({
    port: 0,
    token: "test-token",
    bridgeFilePath: path.join(dir, "bridge.json")
  }).start();
  t.after(() => bridge.close());

  const unauthorized = await postJson({
    port: bridge.port,
    token: "wrong",
    payload: { body: "hello" }
  });
  assert.equal(unauthorized.statusCode, 401);

  const invalid = await postJson({
    port: bridge.port,
    token: "test-token",
    payload: { title: "missing body" }
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.body.error, "body.required");
});

test("notification client sends through bridge file", async (t) => {
  const dir = tempDir(t);
  const received = [];
  const bridgeFilePath = path.join(dir, "bridge.json");
  const bridge = await createNotificationBridge({
    port: 0,
    token: "client-token",
    bridgeFilePath,
    onMessage: (message) => received.push(message)
  }).start();
  t.after(() => bridge.close());

  const result = await sendNotification(
    {
      source: "terminal",
      level: "warning",
      body: "needs attention"
    },
    { bridgeFilePath }
  );

  assert.equal(result.ok, true);
  assert.equal(received.length, 1);
  assert.equal(received[0].source, "terminal");
  assert.equal(received[0].level, "warning");
});
