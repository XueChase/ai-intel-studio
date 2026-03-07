# AI Intel Studio

[English](README.md)

> 一个独立的 AI24H 情报流水线：采集、排序、总结、发布。

AI Intel Studio 是一个面向 **AI 24 小时发展快报** 的独立项目。它将多源采集、质量过滤、事件级排序、Markdown 生成与静态站点发布串成完整闭环。

---

## 项目能力

- 从平台聚合源与 OPML RSS 订阅采集 AI 资讯。
- 过滤非 AI 噪声，并进行事件级去重。
- 构建质量可控、体积紧凑的分析输入数据集。
- 使用缓存与回退抓取补充事件摘要（`desc`）。
- 通过 LLM 生成结构化的中文 AI24H Markdown 报告。
- 通过 GitHub Actions 发布数据与前端产物。

---

## 核心原则

- **AI24H 优先**：覆盖模型、产品、开发者生态、基础设施、产业、政策/安全。
- **质量优先于数量**：避免低信息密度标题和纯市场噪声。
- **结构化输出**：各阶段输出稳定 JSON 契约。
- **可运维性**：工作流具备 rebase+重试推送、可选部署与缓存持久化。

---

## 架构

```text
Fetchers -> AI Filter -> Dedupe -> Bilingual/Desc Enrichment
       -> Analysis Input Builder -> LLM Markdown Generation
       -> Data Sync -> Optional Pages Deployment
```

关键目录：

- `src/`：数据流水线源码
- `prompts/`：AI 提示词模板
- `data/`：采集快照 / 分析输入 / Markdown 输出
- `ai-intel-studio/`：前端应用（静态站点）
- `.github/workflows/`：自动化工作流

---

## 快速开始

### 环境要求

- Node.js `>= 18`
- pnpm

### 安装

```bash
git clone https://github.com/XueAeon/ai-intel-studio.git
cd ai-intel-studio
pnpm install
```

### 本地运行

```bash
# 1) 采集并更新基础数据
pnpm fetch

# 2) 构建 AI24H 分析输入
pnpm build:analysis-input

# 3) 生成 AI24H Markdown（需要配置 API Key）
pnpm generate:analysis
```

---

## 常用命令

```bash
pnpm fetch                  # 全量采集
pnpm fetch:opml             # 测试 OPML 源
pnpm build:analysis-input   # 构建 AI24H 输入
pnpm generate:analysis      # 生成 AI24H 报告
pnpm test                   # 单测
pnpm typecheck              # TypeScript 检查
```

---

## 输出文件

### 采集输出（`data/collected/`）

- `latest-24h.json`：24 小时窗口结果
- `latest-7d.json`：7 天窗口结果
- `archive.json`：滚动归档
- `source-status.json`：采集源状态
- `waytoagi-7d.json`：WaytoAGI 更新快照
- `title-zh-cache.json`：标题翻译缓存
- `desc-cache.json`：URL 摘要缓存

### 分析输出

- `data/ai-input/analysis-input-24h.json`：LLM 输入事件集
- `data/ai-output-md/ai-analysis-24h.md`：AI24H 成稿

---

## 工作流

### 1) `update-ai-news.yml`

用途：周期采集 + 数据/站点更新。

- 触发：定时 / push / 手动
- 执行 `pnpm fetch`
- 支持手动 `desc` 质量检查
- 同步前端数据
- 构建并部署 Pages

### 2) `generate-ai-analysis.yml`

用途：AI24H 报告生成流程。

- 触发：定时 / 手动
- 构建分析输入并输出 `desc` 质量统计
- 生成 Markdown 报告
- 提交产物
- 可选 `deploy_pages=true` 立即部署

---

## AI24H 质量控制

当前已实现：

- AI 相关性过滤
- 宏观金融噪声抑制（无 AI 信号时过滤）
- 类别覆盖导向的事件排序
- 站点/来源配额限制
- `desc` 占位文案过滤
- 提示词术语保留规则（避免专业词误译）
- 输出结构校验（防止 Markdown 漂移）

---

## 前端

前端在 `ai-intel-studio/`：

```bash
cd ai-intel-studio
npm ci
npm run dev
```

线上通过 GitHub Pages 发布。

---

## 环境变量

AI 分析工作流需要在 GitHub Secrets 配置：

- `DASHSCOPE_API_KEY`（或你当前配置的模型服务密钥）

配置文件：

- `config/ai-analysis.config.json`

---

## License

MIT
