# AI Intel Studio

[中文文档](README.zh-CN.md)

> A standalone AI24H intelligence pipeline: collect, rank, summarize, publish.

AI Intel Studio is an independent project focused on one thing: producing a high-quality **AI 24h development briefing** every day.
It combines multi-source collection, quality filtering, event-level ranking, Markdown report generation, and optional static site deployment.

---

## What This Project Does

- Aggregates AI news/signals from platform feeds and OPML RSS subscriptions.
- Filters non-AI noise and deduplicates at event level.
- Builds a compact, quality-controlled analysis input dataset.
- Enriches event descriptions (`desc`) with cache + fallback extraction.
- Generates a structured Chinese AI24H Markdown briefing via LLM.
- Publishes data and site assets through GitHub Actions.

---

## Core Principles

- **AI24H-first**: prioritize model, product, developer ecosystem, infrastructure, industry, and policy/security signals.
- **Quality over volume**: avoid low-information headlines and pure market noise.
- **Structured output**: every stage writes stable JSON contracts.
- **Operational reliability**: workflows support rebase+retry push, optional deployment, and cache persistence.

---

## Architecture

```text
Fetchers -> AI Filter -> Dedupe -> Bilingual/Desc Enrichment
       -> Analysis Input Builder -> LLM Markdown Generation
       -> Data Sync -> Optional Pages Deployment
```

Key directories:

- `src/` : pipeline source code
- `prompts/` : AI prompt templates
- `data/` : collected snapshots / analysis input / output markdown
- `ai-intel-studio/` : frontend app (published static site)
- `.github/workflows/` : automation workflows

---

## Quick Start

### Requirements

- Node.js `>= 18`
- pnpm

### Install

```bash
git clone https://github.com/XueAeon/ai-intel-studio.git
cd ai-intel-studio
pnpm install
```

### Run pipeline locally

```bash
# 1) collect and update base datasets
pnpm fetch

# 2) build AI24H analysis input
pnpm build:analysis-input

# 3) generate AI24H markdown (requires API key env)
pnpm generate:analysis
```

---

## Commands

```bash
pnpm fetch                  # full collection pipeline
pnpm fetch:opml             # test OPML feeds
pnpm build:analysis-input   # build compact AI24H input
pnpm generate:analysis      # generate AI24H markdown
pnpm test                   # unit tests
pnpm typecheck              # TS type checks
```

---

## Data Outputs

### Collection outputs (`data/collected/`)

- `latest-24h.json` : latest 24h filtered items
- `latest-7d.json` : latest 7d filtered items
- `archive.json` : rolling archive
- `source-status.json` : source health/status
- `waytoagi-7d.json` : WaytoAGI updates snapshot
- `title-zh-cache.json` : title translation cache
- `desc-cache.json` : URL->desc extraction cache

### Analysis outputs

- `data/ai-input/analysis-input-24h.json` : compact ranked events for LLM
- `data/ai-output-md/ai-analysis-24h.md` : final AI24H markdown report

---

## Workflow Matrix

### 1) `update-ai-news.yml`

Purpose: periodic collection + data/site update.

- Trigger: schedule / push / manual
- Runs `pnpm fetch`
- Optional manual desc quality check
- Syncs frontend data
- Builds and deploys Pages

### 2) `generate-ai-analysis.yml`

Purpose: AI24H markdown generation pipeline.

- Trigger: schedule / manual
- Builds analysis input with desc quality stats
- Generates markdown report
- Commits output artifacts
- Optional `deploy_pages=true` for immediate site publish

---

## AI24H Quality Controls

Implemented in pipeline + prompt:

- Source-level AI relevance filtering.
- Macro finance noise suppression (unless true AI signal exists).
- Event scoring with category-aware coverage targets.
- Caps for site/source concentration.
- Desc quality rejection (placeholder/boilerplate text blocked).
- Terminology preservation rules in prompt (avoid unprofessional mistranslation).
- Output structure validation before markdown persistence.

---

## Frontend

Frontend app lives in `ai-intel-studio/`.

```bash
cd ai-intel-studio
npm ci
npm run dev
```

Production deployment uses GitHub Pages through Actions.

---

## Environment

For AI generation workflow, set required secret/API env in GitHub Actions:

- `DASHSCOPE_API_KEY` (or your configured provider key)

Config entry:

- `config/ai-analysis.config.json`

---

## License

MIT
