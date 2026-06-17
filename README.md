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
- 单击角色触发随机回复，悬停显示互动按钮。
- 右键角色或点击齿轮打开控制面板。
- 控制面板支持上传、切换、删除素材。
- 支持自定义互动按钮、随机回复、闲置自动消息和显示大小。
- 配置与上传素材存储在 Electron `userData` 目录，修改后实时生效。

## 文件

- `package.json`: Electron 启动脚本和依赖。
- `main.js`: 主进程、窗口管理、上传缓存和配置持久化。
- `preload.js`: 安全 IPC 桥接。
- `pet.html`: 透明桌面宠物窗口。
- `panel.html`: 控制面板。
- `sprite.webp`, `frame_front.webp`: 默认宠物素材。

## 素材建议

上传视频或 GIF 时，最好使用透明背景或稳定纯色背景预处理后的素材。用于方向 sprite 的素材应首尾 loop、角速度均匀，并把正脸中心帧单独保留。后续 Petsona Studio 生成的 `.petpack` 会作为标准素材包导入 Petsona Player。
