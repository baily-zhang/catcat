# Petsona Player

Petsona Player 是基于 Electron + HTML/CSS/JS 的 macOS 透明悬浮桌面陪伴播放器。默认使用当前目录里的 `sprite.webp` 和 `frame_front.webp`，也可以在控制面板上传 `webp`、`webm`、`mp4`、`mov`、`gif` 素材。

## 运行

```bash
npm install
npm run start
```

当前目录已经安装过依赖时，直接运行：

```bash
npm run start
```

## 打包

生成未压缩的 macOS `.app`：

```bash
npm run pack
```

输出路径：

```text
dist/mac-arm64/Petsona.app
```

生成可分发的 ZIP：

```bash
npm run dist
```

输出路径：

```text
dist/Petsona-0.1.0-arm64.zip
```

生成 DMG：

```bash
npm run dist:dmg
```

DMG 依赖 macOS `hdiutil`，如果本机环境不允许创建磁盘镜像，可以直接分发 ZIP。

## 功能

- 透明无边框桌面陪伴窗口，始终置顶并显示在所有桌面空间。
- 左键拖动角色移动位置，位置自动保存。
- 角色周围有透明命中区域，鼠标靠近时会变成 45 度小鱼光标并触发转头。
- 单击角色触发 `click` 动作和随机回复，按住拖动时触发 `drag` 动作。
- 右键角色或点击齿轮打开控制面板。
- 控制面板支持导入 `.petpack`、切换、删除 Pet Pack。
- 支持自定义互动按钮、随机回复、闲置触发、显示大小和鼠标穿透。
- 鼠标穿透开启后，按住 `Command/Ctrl` 可临时点击和拖拽宠物。
- 配置与导入的 Pet Pack 存储在 Electron `userData` 目录，修改后实时生效。

## 文件

- `package.json`: Electron 启动脚本和依赖。
- `main.js`: 主进程、窗口管理、Pet Pack 导入和配置持久化。
- `preload.js`: 安全 IPC 桥接。
- `pet.html`: 透明桌面宠物窗口。
- `panel.html`: 控制面板。
- `sprite.webp`, `frame_front.webp`: 默认宠物素材。

## Pet Pack 建议

Petsona Player 现在以 `.petpack` 作为正式导入入口。Pet Pack 至少需要 `idle` 动作；提供 `click` 和 `drag` 动作时，播放器会在点击和按住拖拽时自动切换，动作缺失时回退到 `idle`。
