const { app, BrowserWindow, dialog, ipcMain, screen } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const DEFAULT_ASSET_ID = "default-cat-sprite";
const ALLOWED_EXTENSIONS = new Set([".webp", ".webm", ".mp4", ".mov", ".gif"]);
const VIDEO_EXTENSIONS = new Set([".webm", ".mp4", ".mov"]);
const HIT_PADDING = 72;

let petWindow = null;
let panelWindow = null;
let config = null;

function userDataPath(...parts) {
  return path.join(app.getPath("userData"), ...parts);
}

function configPath() {
  return userDataPath("config.json");
}

function assetsDir() {
  return userDataPath("assets");
}

function defaultConfig() {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  return {
    version: 1,
    activeAssetId: DEFAULT_ASSET_ID,
    window: {
      x: workArea.x + Math.round(workArea.width * 0.68),
      y: workArea.y + Math.round(workArea.height * 0.48),
      size: 320
    },
    assets: [
      {
        id: DEFAULT_ASSET_ID,
        label: "默认猫猫",
        kind: "sprite",
        bundled: true,
        sprite: "sprite.webp",
        front: "frame_front.webp"
      }
    ],
    buttons: [
      { id: "feed", label: "喂食", reply: "嗷呜，收下了。" },
      { id: "pat", label: "摸摸", reply: "呼噜呼噜。" },
      { id: "play", label: "逗一下", reply: "盯住你了。" }
    ],
    replies: ["今天也在桌面巡逻。", "鱼在哪里？", "我看到你的鼠标了。", "先不要切走。"],
    idle: {
      enabled: true,
      intervalSeconds: 45
    }
  };
}

function ensureStorage() {
  fs.mkdirSync(assetsDir(), { recursive: true });
}

function loadConfig() {
  ensureStorage();
  const fallback = defaultConfig();
  if (!fs.existsSync(configPath())) {
    saveConfig(fallback);
    return fallback;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), "utf8"));
    const merged = {
      ...fallback,
      ...parsed,
      window: { ...fallback.window, ...(parsed.window || {}) },
      idle: { ...fallback.idle, ...(parsed.idle || {}) },
      assets: Array.isArray(parsed.assets) ? parsed.assets : fallback.assets,
      buttons: Array.isArray(parsed.buttons) ? parsed.buttons : fallback.buttons,
      replies: Array.isArray(parsed.replies) ? parsed.replies : fallback.replies
    };

    if (!merged.assets.some((asset) => asset.id === DEFAULT_ASSET_ID)) {
      merged.assets.unshift(fallback.assets[0]);
    }
    if (!merged.assets.some((asset) => asset.id === merged.activeAssetId)) {
      merged.activeAssetId = DEFAULT_ASSET_ID;
    }
    return merged;
  } catch {
    saveConfig(fallback);
    return fallback;
  }
}

function saveConfig(nextConfig = config) {
  ensureStorage();
  fs.writeFileSync(configPath(), JSON.stringify(nextConfig, null, 2));
}

function assetKindFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext) ? "video" : "image";
}

function toRendererAsset(asset) {
  if (asset.bundled) {
    return {
      ...asset,
      url: pathToFileURL(path.join(__dirname, asset.sprite || asset.file || "")).href,
      frontUrl: pathToFileURL(path.join(__dirname, asset.front || asset.sprite || "")).href
    };
  }

  return {
    ...asset,
    url: pathToFileURL(asset.path).href
  };
}

function publicConfig() {
  const assets = config.assets.map(toRendererAsset);
  const activeAsset = assets.find((asset) => asset.id === config.activeAssetId) || assets[0];
  return {
    ...config,
    hitPadding: HIT_PADDING,
    assets,
    activeAsset
  };
}

function broadcastConfig() {
  const payload = publicConfig();
  for (const win of [petWindow, panelWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send("config:changed", payload);
    }
  }
}

function createPetWindow() {
  const size = Math.max(180, Math.min(560, Number(config.window.size) || 320));
  const outerSize = size + HIT_PADDING * 2;
  petWindow = new BrowserWindow({
    width: outerSize,
    height: outerSize,
    x: Number.isFinite(config.window.x) ? Math.round(config.window.x) : undefined,
    y: Number.isFinite(config.window.y) ? Math.round(config.window.y) : undefined,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWindow.setAlwaysOnTop(true, "floating");
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.loadFile(path.join(__dirname, "pet.html"));
  petWindow.once("ready-to-show", () => petWindow.show());
  petWindow.on("closed", () => {
    petWindow = null;
  });
}

function createPanelWindow() {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.focus();
    return;
  }

  panelWindow = new BrowserWindow({
    width: 760,
    height: 640,
    minWidth: 680,
    minHeight: 560,
    title: "Catcat Control",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  panelWindow.loadFile(path.join(__dirname, "panel.html"));
  panelWindow.once("ready-to-show", () => panelWindow.show());
  panelWindow.on("closed", () => {
    panelWindow = null;
  });
}

function randomReply() {
  const replies = config.replies.length > 0 ? config.replies : defaultConfig().replies;
  return replies[Math.floor(Math.random() * replies.length)];
}

app.whenReady().then(() => {
  config = loadConfig();
  createPetWindow();

  app.on("activate", () => {
    if (!petWindow) createPetWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("config:get", () => publicConfig());

ipcMain.handle("panel:open", () => {
  createPanelWindow();
  return true;
});

ipcMain.handle("pet:move-by", (_event, delta) => {
  if (!petWindow) return false;
  const bounds = petWindow.getBounds();
  const next = {
    x: Math.round(bounds.x + Number(delta.dx || 0)),
    y: Math.round(bounds.y + Number(delta.dy || 0)),
    width: bounds.width,
    height: bounds.height
  };
  petWindow.setBounds(next, false);
  config.window.x = next.x;
  config.window.y = next.y;
  saveConfig();
  return true;
});

ipcMain.handle("pet:set-size", (_event, sizeValue) => {
  if (!petWindow) return false;
  const size = Math.max(180, Math.min(560, Math.round(Number(sizeValue) || 320)));
  const bounds = petWindow.getBounds();
  const outerSize = size + HIT_PADDING * 2;
  const nextX = Math.round(bounds.x + bounds.width / 2 - outerSize / 2);
  const nextY = Math.round(bounds.y + bounds.height / 2 - outerSize / 2);
  petWindow.setBounds({ x: nextX, y: nextY, width: outerSize, height: outerSize }, true);
  config.window.x = nextX;
  config.window.y = nextY;
  config.window.size = size;
  saveConfig();
  broadcastConfig();
  return true;
});

ipcMain.handle("asset:upload", async () => {
  const owner = panelWindow || petWindow;
  const result = await dialog.showOpenDialog(owner, {
    title: "选择宠物素材",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Pet media", extensions: ["webp", "webm", "mp4", "mov", "gif"] }
    ]
  });

  if (result.canceled) return publicConfig();

  for (const filePath of result.filePaths) {
    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) continue;

    const id = crypto.randomUUID();
    const dest = path.join(assetsDir(), `${id}${ext}`);
    fs.copyFileSync(filePath, dest);
    config.assets.push({
      id,
      label: path.basename(filePath),
      kind: assetKindFor(filePath),
      path: dest
    });
    config.activeAssetId = id;
  }

  saveConfig();
  broadcastConfig();
  return publicConfig();
});

ipcMain.handle("asset:select", (_event, assetId) => {
  if (config.assets.some((asset) => asset.id === assetId)) {
    config.activeAssetId = assetId;
    saveConfig();
    broadcastConfig();
  }
  return publicConfig();
});

ipcMain.handle("asset:delete", (_event, assetId) => {
  const asset = config.assets.find((item) => item.id === assetId);
  if (!asset || asset.bundled) return publicConfig();

  config.assets = config.assets.filter((item) => item.id !== assetId);
  if (asset.path && fs.existsSync(asset.path)) {
    fs.rmSync(asset.path, { force: true });
  }
  if (config.activeAssetId === assetId) {
    config.activeAssetId = DEFAULT_ASSET_ID;
  }

  saveConfig();
  broadcastConfig();
  return publicConfig();
});

ipcMain.handle("settings:update", (_event, patch) => {
  if (patch.window && Number.isFinite(Number(patch.window.size))) {
    config.window.size = Math.max(180, Math.min(560, Math.round(Number(patch.window.size))));
  }
  if (patch.idle) {
    config.idle = {
      ...config.idle,
      enabled: Boolean(patch.idle.enabled),
      intervalSeconds: Math.max(10, Math.min(600, Math.round(Number(patch.idle.intervalSeconds) || 45)))
    };
  }
  if (Array.isArray(patch.replies)) {
    config.replies = patch.replies.map((item) => String(item).trim()).filter(Boolean).slice(0, 40);
  }
  if (Array.isArray(patch.buttons)) {
    config.buttons = patch.buttons
      .map((button, index) => ({
        id: button.id || `button-${index}-${Date.now()}`,
        label: String(button.label || "").trim(),
        reply: String(button.reply || "").trim()
      }))
      .filter((button) => button.label && button.reply)
      .slice(0, 8);
  }

  saveConfig();
  if (petWindow && !petWindow.isDestroyed()) {
    const size = Math.max(180, Math.min(560, Math.round(config.window.size)));
    const outerSize = size + HIT_PADDING * 2;
    const bounds = petWindow.getBounds();
    const nextX = Math.round(bounds.x + bounds.width / 2 - outerSize / 2);
    const nextY = Math.round(bounds.y + bounds.height / 2 - outerSize / 2);
    petWindow.setBounds({ x: nextX, y: nextY, width: outerSize, height: outerSize }, true);
    config.window.x = nextX;
    config.window.y = nextY;
    saveConfig();
  }
  broadcastConfig();
  return publicConfig();
});

ipcMain.handle("pet:interact", (_event, buttonId) => {
  const button = config.buttons.find((item) => item.id === buttonId);
  return button ? button.reply : randomReply();
});

ipcMain.handle("reply:random", () => randomReply());
