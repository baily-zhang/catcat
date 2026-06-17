const { contextBridge, ipcRenderer } = require("electron");

const petsonaApi = {
  getConfig: () => ipcRenderer.invoke("config:get"),
  openPanel: () => ipcRenderer.invoke("panel:open"),
  moveBy: (dx, dy) => ipcRenderer.invoke("pet:move-by", { dx, dy }),
  setSize: (size) => ipcRenderer.invoke("pet:set-size", size),
  uploadAssets: () => ipcRenderer.invoke("asset:upload"),
  selectAsset: (assetId) => ipcRenderer.invoke("asset:select", assetId),
  deleteAsset: (assetId) => ipcRenderer.invoke("asset:delete", assetId),
  updateSettings: (patch) => ipcRenderer.invoke("settings:update", patch),
  interact: (buttonId) => ipcRenderer.invoke("pet:interact", buttonId),
  randomReply: () => ipcRenderer.invoke("reply:random"),
  onConfigChanged: (callback) => {
    const handler = (_event, config) => callback(config);
    ipcRenderer.on("config:changed", handler);
    return () => ipcRenderer.removeListener("config:changed", handler);
  }
};

contextBridge.exposeInMainWorld("petsona", petsonaApi);
contextBridge.exposeInMainWorld("catcat", petsonaApi);
