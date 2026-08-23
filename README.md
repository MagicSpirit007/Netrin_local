# Netrin_local

**简体中文** | [English](README.en.md)

Netrin_local 是 Netrin 的本地优先版本：一款面向校园自然观察路线的移动端 PWA。地图、路线与字体可以随应用离线使用；路线草稿和下载内容默认保存在浏览器本地。Supabase 只是一项可选同步能力。

本仓库不接入高德 SDK 或高德 API，也不依赖在线地图服务完成核心导览。

## 当前能力

- MapLibre GL JS + 本地 PMTiles 离线底图
- 校园路网吸附与断网可用的直线回退
- 徒步路线录制、关键点、照片和物种笔记
- 逐站导航、路线选择持久化与中英双语界面
- 安装型 PWA；默认部署在站点根目录
- 可选 Supabase 匿名账户发布与下载

> v0.1.0 是首次公开版本。约 1.4 MB 的主 JavaScript 包仍有拆包优化空间，但不影响本地优先功能。

## 快速开始

要求 Node.js 22.12 或更高版本（CI 覆盖 Node 22 与 24）。

```bash
git clone https://github.com/MagicSpirit007/Netrin_local.git
cd Netrin_local
npm ci
npm run dev
```

质量检查与生产构建：

```bash
npm run check
npm run typecheck
npm test
npm run build
npm run smoke -- /
```

默认构建基路径为 `/`。部署到旧版 `/netrin/` 路径时，设置 `NETRIN_BASE_PATH=/netrin/` 后再运行构建。PowerShell 示例：

```powershell
$env:NETRIN_BASE_PATH = '/netrin/'
npm run build
npm run smoke -- /netrin/
```

## 本地优先与隐私

未配置后端时，地图、随包路线、路线创作与已下载路线仍可完整使用。浏览器数据存放在 IndexedDB；清除站点数据会删除这些本地内容。应用不含分析或广告 SDK。

定位仅用于设备上的记录与导航。只有用户主动发布路线时，路线文本、坐标和选定照片才会发送到其配置的 Supabase 项目。照片会在客户端重新编码为 JPEG，以移除原文件元数据并限制体积。详见 [PRIVACY.md](PRIVACY.md)。

## 可选 Supabase 同步

复制环境模板，并只填写公开的 anon/publishable key：

```bash
cp .env.local.example .env.local
```

`VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 均不设置时，应用自动保持本地模式。绝不要把 `service_role` key 放进前端环境变量。

[可移植示例迁移](supabase/migrations/0001_routes.sql)提供路线表、RLS、公开视图、发布 RPC 与 Storage 策略；它没有在任何真实服务器上自动执行。

## 项目结构

- `src/`：React 应用、导航状态机、本地存储与远端边界校验
- `data/`：随包路线与自然观察数据
- `public/maps/`：离线 PMTiles
- `public/data/`：校园路网与水体 GeoJSON
- `scripts/`：数据生成与构建烟测脚本
- `supabase/`：可选后端的可移植示例

本地存储键、WGS-84 约束与导出状态见 [docs/DATA_MODEL.md](docs/DATA_MODEL.md)。

## 数据与归属

应用代码使用 [MIT License](LICENSE)。地图和地理数据不因代码许可证而改变其各自条款：

- © OpenStreetMap contributors，数据依 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)；
- Protomaps Basemaps 中的 OSM 派生数据遵循其[许可与归属说明](https://github.com/protomaps/basemaps/blob/main/LICENSE.md)；
- Natural Earth 数据为公共领域。

完整资产清单见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。应用内地图持续显示 OpenStreetMap 归属。

## 参与和安全

请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。安全问题请不要公开提交 Issue，按 [SECURITY.md](SECURITY.md) 使用 GitHub 私密漏洞报告。
