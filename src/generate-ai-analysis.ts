import OpenAI from 'openai';
import { existsSync } from 'fs';
import { mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import process from 'process';

interface OpenAIAnalysisConfig {
  api_key_env: string;
  base_url: string;
  model: string;
  enable_thinking: boolean;
  stream: boolean;
  stream_include_usage: boolean;
  temperature: number;
  max_events: number;
  request_timeout_ms: number;
  output_max_chars?: number;
}

interface AnalysisConfig {
  enabled: boolean;
  openai: OpenAIAnalysisConfig;
  input_path: string;
  prompt_path: string;
  output_markdown_path?: string;
  output_path?: string;
}

interface AnalysisInputPayload {
  generated_at: string;
  generated_at_local: string;
  window_hours: number;
  top_events: unknown[];
}

interface RecentPostSummary {
  date: string;
  title: string;
  subtitle: string | null;
  main_point: string | null;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}

function extractSection(markdown: string, heading: string): string | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^##\\s*${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`, 'm');
  const match = markdown.match(pattern);
  if (!match) return null;
  return match[1].trim() || null;
}

function firstMeaningfulParagraph(section: string | null): string | null {
  if (!section) return null;
  const lines = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('###') && !line.startsWith('- ') && !line.startsWith('* '));
  const text = lines.join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function extractRecentPostSummary(markdown: string, date: string): RecentPostSummary | null {
  const titleMatch = markdown.match(/^#\s*(.+)$/m);
  if (!titleMatch) return null;

  const subtitleMatch = markdown.match(/^>\s*(.+)$/m);
  const mainPoint =
    firstMeaningfulParagraph(extractSection(markdown, '主编判断')) ||
    firstMeaningfulParagraph(extractSection(markdown, '总结')) ||
    firstMeaningfulParagraph(extractSection(markdown, '今日结论'));

  return {
    date,
    title: titleMatch[1].trim(),
    subtitle: subtitleMatch ? subtitleMatch[1].trim() : null,
    main_point: mainPoint,
  };
}

async function loadRecentPosts(currentDate: string, maxDays: number = 7): Promise<RecentPostSummary[]> {
  const backupsRoot = resolve('data/backups/ai-output-md');
  if (!existsSync(backupsRoot)) return [];

  const entries = await readdir(backupsRoot, { withFileTypes: true });
  const dates = entries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name) && entry.name < currentDate)
    .map((entry) => entry.name)
    .sort()
    .slice(-maxDays);

  const results: RecentPostSummary[] = [];
  for (const date of dates) {
    const filePath = join(backupsRoot, date, 'ai-analysis-24h.md');
    if (!existsSync(filePath)) continue;
    try {
      const markdown = await readFile(filePath, 'utf-8');
      const summary = extractRecentPostSummary(markdown, date);
      if (summary) results.push(summary);
    } catch {
      // ignore malformed backups
    }
  }

  return results;
}

function removeSourceLines(markdown: string): string {
  return markdown
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) {
        return true;
      }
      // Remove any explicit source/reference markers in list or plain lines.
      return !/^(?:[-*]\s*)?(?:\*{0,2})?(?:来源|参考链接|数据来源)(?:\*{0,2})?\s*[：:]/.test(t);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeChineseSpacing(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('```') ||
        trimmed.startsWith('`')
      ) {
        return line;
      }

      return line
        .replace(/([\u4e00-\u9fff])\s+([A-Za-z0-9])/g, '$1$2')
        .replace(/([A-Za-z0-9])\s+([\u4e00-\u9fff])/g, '$1$2')
        .replace(/\s+([，。！？；：、）】》])/g, '$1')
        .replace(/([（【《])\s+/g, '$1');
    })
    .join('\n');
}

function hasRequiredSections(markdown: string): boolean {
  const text = markdown || '';
  if (!/#\s*AI\s*24小时：/.test(text)) {
    return false;
  }

  const supportedSectionSets: RegExp[][] = [
    [/^##\s*今日结论/m, /^##\s*关键事件/m, /^##\s*趋势观察/m],
    [/^##\s*先说结论/m, /^##\s*今天最值得看的(?:\s*\d+(?:\s*-\s*\d+)?)?\s*件事/m, /^##\s*主编判断/m],
    [/^##\s*先划重点/m, /^##\s*这件事为什么值得看/m, /^##\s*主编判断/m],
  ];

  return supportedSectionSets.some((required) => required.every((pattern) => pattern.test(text)));
}

async function compressMarkdownIfNeeded(
  openai: OpenAI,
  config: OpenAIAnalysisConfig,
  markdown: string
): Promise<string> {
  const maxChars = config.output_max_chars;
  if (!maxChars || markdown.length <= maxChars) {
    return markdown;
  }

  const compressPrompt = [
    `请把下面这篇中文 Markdown 公众号文章压缩到 ${maxChars} 个字符以内。`,
    '要求：',
    '1. 保留 Markdown 结构和标题层级。',
    '2. 保留以下章节：标题、副标题、先说结论、今天最值得看的几件事、主编判断、总结。',
    '3. 可以删减次要背景、重复解释、弱信息补充，但不要删掉主线判断。',
    '4. 语言保持自然，像真人主编写作，不要写成摘要提纲。',
    '5. 不要添加任何解释，不要输出代码块，只输出压缩后的 Markdown 正文。',
    '',
    markdown,
  ].join('\n');

  const request = {
    model: config.model,
    temperature: 0.1,
    messages: [{ role: 'user', content: compressPrompt }],
    enable_thinking: false,
    timeout: config.request_timeout_ms,
  } as unknown as Parameters<typeof openai.chat.completions.create>[0];

  const completion = (await openai.chat.completions.create(request)) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return completion.choices?.[0]?.message?.content?.trim() || markdown;
}

async function main(): Promise<number> {
  const configPath = resolve('config/ai-analysis.config.json');
  if (!existsSync(configPath)) {
    console.log(`ℹ️ Skip AI analysis: config not found at ${configPath}`);
    return 0;
  }

  const config = JSON.parse(await readFile(configPath, 'utf-8')) as AnalysisConfig;
  if (!config.enabled) {
    console.log('ℹ️ Skip AI analysis: enabled=false');
    return 0;
  }

  const inputPath = resolve(config.input_path);
  const promptPath = resolve(config.prompt_path);
  const outputPath = resolve(
    config.output_markdown_path || config.output_path || 'data/ai-output-md/ai-analysis-24h.md',
  );
  if (!existsSync(inputPath)) {
    throw new Error(`analysis input not found: ${inputPath}`);
  }
  if (!existsSync(promptPath)) {
    throw new Error(`prompt template not found: ${promptPath}`);
  }

  const apiKey = process.env[config.openai.api_key_env];
  if (!apiKey) {
    throw new Error(`missing env: ${config.openai.api_key_env}`);
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: config.openai.base_url,
  });

  const input = JSON.parse(await readFile(inputPath, 'utf-8')) as AnalysisInputPayload;
  const compactInput = {
    ...input,
    top_events: (input.top_events || []).slice(0, config.openai.max_events),
  };
  const currentDate = (compactInput.generated_at_local || '').slice(0, 10) || 'unknown-date';
  const recentPosts = await loadRecentPosts(currentDate, 7);
  const promptTemplate = await readFile(promptPath, 'utf-8');
  const prompt = renderTemplate(promptTemplate, {
    window_hours: String(compactInput.window_hours),
    source_generated_at: compactInput.generated_at || '',
    source_generated_at_local: compactInput.generated_at_local || '',
    recent_posts: JSON.stringify(recentPosts, null, 2),
    analysis_json: JSON.stringify(compactInput, null, 2),
  });

  let reasoningContent = '';
  let answerContent = '';
  let isAnswering = false;

  if (config.openai.stream) {
    const streamRequest = {
      model: config.openai.model,
      temperature: config.openai.temperature,
      messages: [{ role: 'user', content: prompt }],
      enable_thinking: config.openai.enable_thinking,
      stream: true,
      stream_options: {
        include_usage: config.openai.stream_include_usage,
      },
      timeout: config.openai.request_timeout_ms,
    } as unknown as Parameters<typeof openai.chat.completions.create>[0];

    const stream = (await openai.chat.completions.create(streamRequest)) as AsyncIterable<{
      choices?: Array<{ delta?: { reasoning_content?: string; content?: string } }>;
    }>;

    for await (const chunk of stream) {
      if (!chunk.choices?.length) {
        continue;
      }
      const delta = chunk.choices[0].delta as {
        reasoning_content?: string;
        content?: string;
      };
      if (delta.reasoning_content) {
        reasoningContent += delta.reasoning_content;
      }
      if (delta.content) {
        isAnswering = true;
        answerContent += delta.content;
      }
    }
  } else {
    const request = {
      model: config.openai.model,
      temperature: config.openai.temperature,
      messages: [{ role: 'user', content: prompt }],
      enable_thinking: config.openai.enable_thinking,
      timeout: config.openai.request_timeout_ms,
    } as unknown as Parameters<typeof openai.chat.completions.create>[0];

    const completion = (await openai.chat.completions.create(request)) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    answerContent = completion.choices?.[0]?.message?.content?.trim() || '';
  }

  if (!isAnswering && !answerContent.trim()) {
    throw new Error('empty AI response content');
  }

  let cleanedContent = normalizeChineseSpacing(removeSourceLines(answerContent.trim()));
  cleanedContent = normalizeChineseSpacing(
    removeSourceLines(await compressMarkdownIfNeeded(openai, config.openai, cleanedContent))
  );
  if (!hasRequiredSections(cleanedContent)) {
    const debugPath = resolve('data/ai-output-md/ai-analysis-24h.debug.md');
    await mkdir(dirname(debugPath), { recursive: true });
    await writeFile(debugPath, answerContent.trim() || '(empty response)', 'utf-8');
    throw new Error('AI response missing required sections');
  }

  const markdownDocument =
    `<!-- source_generated_at: ${compactInput.generated_at} -->\n` +
    `<!-- source_generated_at_local: ${compactInput.generated_at_local} -->\n` +
    `<!-- model: ${config.openai.model} -->\n` +
    `<!-- reasoning_chars: ${reasoningContent.length} -->\n\n` +
    cleanedContent +
    '\n';

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdownDocument, 'utf-8');
  console.log(`✅ ${outputPath}`);

  const backupDate = currentDate;
  const backupPath = resolve(join('data/backups/ai-output-md', backupDate, 'ai-analysis-24h.md'));
  await mkdir(dirname(backupPath), { recursive: true });
  await writeFile(backupPath, markdownDocument, 'utf-8');
  console.log(`✅ ${backupPath}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
