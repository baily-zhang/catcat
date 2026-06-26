const { app, BrowserWindow, dialog, ipcMain, screen } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { importPetpack } = require("./src/petpack/importer");

const DEFAULT_ASSET_ID = "default-cat-sprite";
const HIT_PADDING = 72;
const DEFAULT_IDLE_SECONDS = 300;

let petWindow = null;
let panelWindow = null;
let config = null;
let petInteractive = false;

function userDataPath(...parts) {
  return path.join(app.getPath("userData"), ...parts);
}

function configPath() {
  return userDataPath("config.json");
}

function petpacksDir() {
  return userDataPath("petpacks");
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
        label: "默认宠物",
        kind: "sprite",
        bundled: true,
        sprite: "sprite.webp",
        front: "frame_front.webp",
        actions: {
          idle: {
            name: "idle",
            type: "sprite",
            src: "sprite.webp"
          },
          click: {
            name: "click",
            type: "sprite-state",
            src: "sprite.webp",
            durationMs: 900
          },
          drag: {
            name: "drag",
            type: "sprite-state",
            src: "sprite.webp"
          }
        }
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
      intervalSeconds: DEFAULT_IDLE_SECONDS
    },
    interaction: {
      passthrough: false
    }
  };
}

function ensureStorage() {
  fs.mkdirSync(petpacksDir(), { recursive: true });
}

function normalizeAssets(assets, fallbackAsset) {
  const kept = Array.isArray(assets)
    ? assets.filter((asset) => asset && (asset.bundled || asset.petpack))
    : [];
  const withoutDefault = kept.filter((asset) => asset.id !== DEFAULT_ASSET_ID);
  return [fallbackAsset, ...withoutDefault];
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
      interaction: { ...fallback.interaction, ...(parsed.interaction || {}) },
      assets: normalizeAssets(parsed.assets, fallback.assets[0]),
      buttons: Array.isArray(parsed.buttons) ? parsed.buttons : fallback.buttons,
      replies: Array.isArray(parsed.replies) ? parsed.replies : fallback.replies
    };

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

function rendererAction(action, asset) {
  if (!action) return null;
  const srcPath = action.path || (asset.bundled && action.src ? path.join(__dirname, action.src) : null);
  return {
    ...action,
    url: srcPath ? pathToFileURL(srcPath).href : null
  };
}

function rendererActions(asset) {
  const actions = asset.actions || (asset.petpack && asset.petpack.actions) || {};
  return Object.fromEntries(
    Object.entries(actions).map(([name, action]) => [name, rendererAction(action, asset)])
  );
}

function toRendererAsset(asset) {
  const actions = rendererActions(asset);
  if (asset.bundled) {
    return {
      ...asset,
      actions,
      url: pathToFileURL(path.join(__dirname, asset.sprite || asset.file || "")).href,
      frontUrl: pathToFileURL(path.join(__dirname, asset.front || asset.sprite || "")).href
    };
  }

  if (!asset.path) {
    return {
      ...asset,
      actions,
      url: null
    };
  }

  return {
    ...asset,
    actions,
    url: pathToFileURL(asset.path).href
  };
}

function assetCanRender(asset) {
  return Boolean(asset && (asset.bundled || (asset.path && fs.existsSync(asset.path))));
}

function applyMousePassthrough() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const passthrough = Boolean(config.interaction && config.interaction.passthrough);
  petWindow.setIgnoreMouseEvents(passthrough && !petInteractive, {
    forward: true
  });
}

function publicConfig() {
  const assets = config.assets.map(toRendererAsset);
  const activeAssetId = assetCanRender(config.assets.find((asset) => asset.id === config.activeAssetId))
    ? config.activeAssetId
    : DEFAULT_ASSET_ID;
  const activeAsset = assets.find((asset) => asset.id === activeAssetId) || assets[0];
  return {
    ...config,
    activeAssetId,
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
  petWindow.once("ready-to-show", () => {
    applyMousePassthrough();
    petWindow.show();
  });
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
    title: "Petsona Control",
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

ipcMain.handle("petpack:import", async () => {
  const owner = panelWindow || petWindow;
  const result = await dialog.showOpenDialog(owner, {
    title: "导入 Pet Pack",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Pet Pack", extensions: ["petpack"] }]
  });

  if (result.canceled) return publicConfig();

  const imported = [];
  for (const filePath of result.filePaths) {
    const asset = importPetpack(filePath, { petpacksDir: petpacksDir() });
    const existingIndex = config.assets.findIndex((item) => item.id === asset.id);
    if (existingIndex >= 0) {
      config.assets[existingIndex] = asset;
    } else {
      config.assets.push(asset);
    }
    config.activeAssetId = asset.id;
    imported.push(asset);
  }

  saveConfig();
  broadcastConfig();
  return {
    ...publicConfig(),
    importResult: {
      imported: imported.length,
      warnings: imported.flatMap((asset) => asset.petpack.warnings || [])
    }
  };
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
  if (asset.petpack && asset.petpack.storagePath) {
    fs.rmSync(asset.petpack.storagePath, { recursive: true, force: true });
  } else if (asset.path && fs.existsSync(asset.path)) {
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
      intervalSeconds: Math.max(10, Math.min(1800, Math.round(Number(patch.idle.intervalSeconds) || DEFAULT_IDLE_SECONDS)))
    };
  }
  if (patch.interaction) {
    config.interaction = {
      ...config.interaction,
      passthrough: Boolean(patch.interaction.passthrough)
    };
    applyMousePassthrough();
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

ipcMain.handle("pet:set-passthrough", (_event, passthrough) => {
  config.interaction = {
    ...config.interaction,
    passthrough: Boolean(passthrough)
  };
  petInteractive = false;
  applyMousePassthrough();
  saveConfig();
  broadcastConfig();
  return publicConfig();
});

ipcMain.handle("pet:set-interactive", (_event, interactive) => {
  petInteractive = Boolean(interactive);
  applyMousePassthrough();
  return true;
});
