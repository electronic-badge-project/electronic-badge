# USB 图片徽章 · 项目展示

此仓库保存 USB 图片徽章项目的中文静态介绍页和浏览器控制台，供独立组织的 GitHub Pages 发布；不包含固件源码、本机控制服务、设备照片或私有数据。

完整源码、安装与 AI 辅助部署说明见 [ocean-sudo/electronic-badge](https://github.com/ocean-sudo/electronic-badge)。

## 内容与来源

- `docs/index.html`：中文项目介绍。
- `docs/console/index.html`：静态 Web Serial 控制台。浏览器在用户本机直接连接徽章；Pages 仅托管静态文件，不提供云端中继。
- `docs/assets/`：样式、原创合成插画及离线界面截图。
- `.github/workflows/pages.yml`：固定官方 Actions 提交版本，发布 `docs/` 静态内容。

展示页面及工作流直接取自已审查的公开源码提交 [`b83c29882165152193028fdbec92a3e690c26e5e`](https://github.com/ocean-sudo/electronic-badge/tree/b83c29882165152193028fdbec92a3e690c26e5e)。

## 发布与边界

组织仓库采用 GitHub Free 的公开仓库与原生 GitHub Pages，不设置自定义域名或 `CNAME`。在仓库的 **Settings → Pages** 中选择 **GitHub Actions**，由工作流发布 `main` 分支中的 `docs/`。

页面由 GitHub Pages 静态托管。可在支持 Web Serial 的浏览器中打开 [`docs/console/`](docs/console/) 控制台，由浏览器在用户本机直接连接 USB 徽章；设备连接与数据传输不经过云端中继。
