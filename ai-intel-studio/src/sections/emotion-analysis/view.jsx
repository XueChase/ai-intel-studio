import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';

import { paths } from 'src/routes/paths';

import { useTranslate } from 'src/locales';
import { DashboardContent } from 'src/layouts/dashboard';
import { useEmotionAnalysisMarkdown } from 'src/actions/emotion-feed';

import { toast } from 'src/components/snackbar';
import { Iconify } from 'src/components/iconify';
import { Markdown } from 'src/components/markdown';
import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

function normalizeEmotionAnalysisMarkdown(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/^\s*\d+\.\s+###\s*/gm, '### ')
    .replace(/^\s*[-*]\s*###\s*/gm, '### ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function createTopic(name) {
  return {
    name: name || '',
    opening: '',
    point: '',
    ask: '',
    crowd: '',
    resonance: '',
  };
}

function parseEmotionAnalysis(raw, fallbackTitle) {
  const text = normalizeEmotionAnalysisMarkdown(raw);
  const lines = text.split('\n');

  const title = lines.find((l) => l.trim().startsWith('# '))?.trim().replace(/^#\s*/, '') || fallbackTitle;
  const subtitle = lines.find((l) => l.trim().startsWith('> '))?.trim().replace(/^>\s*/, '') || '';

  const mainline = [];
  const risks = [];
  const avoidTopics = [];
  const avoidPhrases = [];
  const topics = [];
  const top3 = [];

  let section = '';
  let currentTopic = null;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    if (t.startsWith('## ')) {
      section = t.replace(/^##\s*/, '');
      currentTopic = null;
      continue;
    }

    if (t.startsWith('### ')) {
      const h3 = t.replace(/^###\s*/, '');
      if (section.includes('推荐话题') && !h3.includes('不建议碰') && !h3.includes('避雷')) {
        currentTopic = createTopic(h3);
        topics.push(currentTopic);
      } else {
        currentTopic = null;
        section = h3;
      }
      continue;
    }

    if (section.includes('今日情绪主线') && /^[-*]\s+/.test(t)) {
      mainline.push(t.replace(/^[-*]\s+/, ''));
      continue;
    }

    if (section.includes('风险提醒') && /^[-*0-9]+\s*/.test(t)) {
      risks.push(t.replace(/^[-*0-9.\s]+/, ''));
      continue;
    }

    if (section.includes('优先讲哪') && /^[0-9]+\.\s+/.test(t)) {
      top3.push(t.replace(/^[0-9]+\.\s+/, ''));
      continue;
    }

    if (section.includes('不建议碰') && /^[-*]\s+/.test(t)) {
      avoidTopics.push(t.replace(/^[-*]\s+/, ''));
      continue;
    }

    if (section.includes('避雷表达') && /^[-*]\s+/.test(t)) {
      avoidPhrases.push(t.replace(/^[-*]\s+/, ''));
      continue;
    }

    // Fallback: model outputs topic blocks without "### 话题名"
    if (section.includes('推荐话题') && /^[-*]\s+/.test(t)) {
      const item = t.replace(/^[-*]\s+/, '');
      const isPoint = /^\*{0,2}主观点\*{0,2}：/.test(item);
      const isOpening = /^\*{0,2}(?:开场话术|导语|开篇导语)\*{0,2}：/.test(item);
      const isAsk = /^\*{0,2}(?:互动提问|互动引导)\*{0,2}：/.test(item);
      const isCrowd = /^\*{0,2}适合人群\*{0,2}：/.test(item);
      const isResonance = /^\*{0,2}女性共鸣点\*{0,2}：/.test(item);
      if (!(isPoint || isOpening || isAsk || isCrowd || isResonance)) continue;

      if (!currentTopic || (isPoint && currentTopic.point)) {
        currentTopic = createTopic(`话题 ${topics.length + 1}`);
        topics.push(currentTopic);
      }

      if (isOpening) {
        currentTopic.opening = item
          .replace(/^\*{0,2}(?:开场话术|导语|开篇导语)\*{0,2}：/, '')
          .trim();
      } else if (isPoint) {
        currentTopic.point = item.replace(/^\*{0,2}主观点\*{0,2}：/, '').trim();
      } else if (isAsk) {
        currentTopic.ask = item.replace(/^\*{0,2}(?:互动提问|互动引导)\*{0,2}：/, '').trim();
      } else if (isCrowd) {
        currentTopic.crowd = item.replace(/^\*{0,2}适合人群\*{0,2}：/, '').trim();
      } else if (isResonance) {
        currentTopic.resonance = item.replace(/^\*{0,2}女性共鸣点\*{0,2}：/, '').trim();
      }
      continue;
    }
  }

  return { title, subtitle, mainline, topics, top3, avoidTopics, avoidPhrases, risks };
}

function buildTopicCopyPrompt(topic, idx, t) {
  const blocks = [
    `# ${t('copyPrompt.taskTitle')}`,
    t('copyPrompt.taskDesc'),
    '',
    `# ${t('copyPrompt.requirementsTitle')}`,
    t('copyPrompt.r1'),
    t('copyPrompt.r2'),
    t('copyPrompt.r3'),
    t('copyPrompt.r4'),
    '',
    `# ${t('copyPrompt.materialTitle', { index: idx + 1 })}`,
    `- ${t('copyPrompt.name')}：${topic.name || t('emotionAnalysis.topicDefaultName', { index: idx + 1 })}`,
    topic.opening ? `- ${t('copyPrompt.opening')}：${topic.opening}` : null,
    topic.point ? `- ${t('copyPrompt.point')}：${topic.point}` : null,
    topic.ask ? `- ${t('copyPrompt.ask')}：${topic.ask}` : null,
    topic.crowd ? `- ${t('copyPrompt.crowd')}：${topic.crowd}` : null,
    topic.resonance ? `- ${t('copyPrompt.resonance')}：${topic.resonance}` : null,
    '',
    `# ${t('copyPrompt.extraTitle')}`,
    t('copyPrompt.extraPlaceholder'),
  ];

  return blocks.filter(Boolean).join('\n').trim();
}

async function copyText(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('当前环境不支持复制');
  }

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();

  try {
    const ok = document.execCommand('copy');
    if (!ok) throw new Error('浏览器拒绝复制');
  } finally {
    document.body.removeChild(ta);
  }
}

export function EmotionAnalysisView() {
  const { t } = useTranslate('emotion');
  const {
    emotionAnalysisMarkdown,
    emotionAnalysisLoading,
    emotionAnalysisError,
    emotionAnalysisValidating,
    refreshEmotionAnalysis,
  } = useEmotionAnalysisMarkdown();
  const parsed = parseEmotionAnalysis(emotionAnalysisMarkdown, t('emotionAnalysis.heading'));
  const statItems = [
    { label: t('emotionAnalysis.statMainline'), value: parsed.mainline.length, icon: 'solar:heart-angle-bold' },
    { label: t('emotionAnalysis.statTopics'), value: parsed.topics.length, icon: 'solar:chat-round-like-bold' },
    { label: t('emotionAnalysis.statRisk'), value: parsed.risks.length, icon: 'solar:shield-warning-bold' },
  ];

  const copyTopicPrompt = async (topic, idx) => {
    try {
      const prompt = buildTopicCopyPrompt(topic, idx, t);
      await copyText(prompt);
      toast.success(t('emotionAnalysis.copied', { index: idx + 1 }));
    } catch (error) {
      toast.error(t('emotionAnalysis.copyFailed', { message: error instanceof Error ? error.message : String(error) }));
    }
  };

  return (
    <DashboardContent maxWidth="xl">
      <CustomBreadcrumbs
        heading={t('emotionAnalysis.heading')}
        links={[
          { name: t('home'), href: paths.dashboard.general.home },
          { name: t('emotionAnalysis.heading') },
        ]}
        action={
          <Button
            variant="contained"
            startIcon={<Iconify icon="solar:refresh-linear" />}
            onClick={() => refreshEmotionAnalysis()}
            disabled={emotionAnalysisLoading || emotionAnalysisValidating}
          >
            {t('refresh')}
          </Button>
        }
        sx={{ mb: 3 }}
      />

      {emotionAnalysisError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {t('loadFailed', { message: emotionAnalysisError?.message || String(emotionAnalysisError) })}
        </Alert>
      ) : null}

      {emotionAnalysisLoading ? (
        <Stack alignItems="center" sx={{ py: 8 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : null}

      {!emotionAnalysisLoading ? (
        <Grid container spacing={2.2}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Card
              sx={{
                mb: 2,
                color: 'common.white',
                borderRadius: 2.5,
                background:
                  'linear-gradient(120deg, rgba(17,24,39,1) 0%, rgba(30,64,175,1) 52%, rgba(14,116,144,1) 100%)',
              }}
            >
              <CardContent sx={{ py: 3 }}>
                <Typography variant="h4" sx={{ mb: 1.2, lineHeight: 1.3 }}>
                  {parsed.title}
                </Typography>
                {parsed.subtitle ? (
                  <Typography variant="body2" sx={{ opacity: 0.92, mb: 2 }}>
                    {parsed.subtitle}
                  </Typography>
                ) : null}
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {statItems.map((item) => (
                    <Chip
                      key={item.label}
                      icon={<Iconify icon={item.icon} />}
                      label={`${item.label} ${item.value}`}
                      sx={{
                        color: 'common.white',
                        bgcolor: 'rgba(255,255,255,0.12)',
                        border: '1px solid rgba(255,255,255,0.18)',
                      }}
                    />
                  ))}
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ mb: 2, borderRadius: 2 }}>
              <CardHeader
                title={t('emotionAnalysis.mainlineTitle')}
                subheader={t('emotionAnalysis.mainlineSubheader')}
              />
              <Divider />
              <CardContent sx={{ pt: 2 }}>
                <Stack spacing={1}>
                  {parsed.mainline.length ? (
                    parsed.mainline.map((line, idx) => (
                      <Stack
                        key={`${line}-${idx}`}
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{
                          p: 1.2,
                          borderRadius: 1.5,
                          bgcolor: idx % 2 === 0 ? 'var(--palette-background-neutral)' : 'transparent',
                        }}
                      >
                        <Chip size="small" color="primary" label={idx + 1} sx={{ minWidth: 34 }} />
                        <Typography variant="body2">{line}</Typography>
                      </Stack>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {t('emotionAnalysis.mainlineEmpty')}
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: 2 }}>
              <CardHeader
                title={t('emotionAnalysis.topicsTitle', { count: parsed.topics.length })}
                subheader={t('emotionAnalysis.topicsSubheader')}
              />
              <Divider />
              <CardContent sx={{ pt: 2 }}>
                <Stack spacing={1.8}>
                  {parsed.topics.length ? (
                    parsed.topics.map((topic, idx) => (
                      <Card
                        key={`${topic.name}-${idx}`}
                        variant="outlined"
                        sx={{
                          p: 1.6,
                          borderRadius: 2,
                          borderColor: 'divider',
                          boxShadow: '0 10px 20px rgba(15,23,42,0.05)',
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          justifyContent="space-between"
                          sx={{ mb: 1 }}
                        >
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Chip size="small" color="secondary" label={idx + 1} />
                            <Typography variant="subtitle2">
                              {topic.name || t('emotionAnalysis.topicDefaultName', { index: idx + 1 })}
                            </Typography>
                          </Stack>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<Iconify icon="solar:copy-bold" />}
                            onClick={() => copyTopicPrompt(topic, idx)}
                          >
                            {t('emotionAnalysis.copy')}
                          </Button>
                        </Stack>
                        {topic.opening ? <Markdown>{`- **${t('emotionAnalysis.fieldOpening')}：** ${topic.opening}`}</Markdown> : null}
                        {topic.point ? <Markdown>{`- **${t('emotionAnalysis.fieldPoint')}：** ${topic.point}`}</Markdown> : null}
                        {topic.ask ? (
                          <Box
                            sx={{
                              p: 1,
                              borderRadius: 1.5,
                              bgcolor: 'var(--palette-background-neutral)',
                              mb: 0.5,
                            }}
                          >
                            <Markdown>{`- **${t('emotionAnalysis.fieldAsk')}：** ${topic.ask}`}</Markdown>
                          </Box>
                        ) : null}
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                          {topic.crowd ? (
                            <Chip
                              size="small"
                              label={topic.crowd}
                              sx={{ bgcolor: 'rgba(37,99,235,0.1)', color: 'rgb(30,64,175)' }}
                            />
                          ) : null}
                          {topic.resonance ? <Chip size="small" variant="outlined" label={topic.resonance} /> : null}
                        </Stack>
                      </Card>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {t('emotionAnalysis.topicsEmpty')}
                    </Typography>
                  )}
                  {!parsed.topics.length ? (
                    <Markdown>{emotionAnalysisMarkdown || t('emotionAnalysis.rawMarkdownEmpty')}</Markdown>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ mb: 2, borderRadius: 2 }}>
              <CardHeader
                title={t('emotionAnalysis.panelStrategy')}
                subheader={t('emotionAnalysis.panelStrategySub')}
              />
              <Divider />
              <CardContent sx={{ pt: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  {t('emotionAnalysis.top3')}
                </Typography>
                <Stack spacing={0.8} sx={{ mb: 2 }}>
                  {parsed.top3.length ? (
                    parsed.top3.map((x, i) => (
                      <Alert key={`${x}-${i}`} severity="info" icon={false}>
                        {i + 1}. {x}
                      </Alert>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {t('empty')}
                    </Typography>
                  )}
                </Stack>

                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  {t('emotionAnalysis.avoidTopics')}
                </Typography>
                <Stack spacing={0.8} sx={{ mb: 2 }}>
                  {parsed.avoidTopics.length ? (
                    parsed.avoidTopics.map((x, i) => (
                      <Alert key={`${x}-${i}`} severity="warning" icon={false}>
                        {x}
                      </Alert>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {t('empty')}
                    </Typography>
                  )}
                </Stack>

                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  {t('emotionAnalysis.avoidPhrases')}
                </Typography>
                <Stack spacing={0.8}>
                  {parsed.avoidPhrases.length ? (
                    parsed.avoidPhrases.map((x, i) => (
                      <Alert key={`${x}-${i}`} severity="warning" icon={false}>
                        {x}
                      </Alert>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {t('empty')}
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: 2 }}>
              <CardHeader title={t('emotionAnalysis.risks')} />
              <Divider />
              <CardContent sx={{ pt: 2 }}>
                <Stack spacing={0.8}>
                  {parsed.risks.length ? (
                    parsed.risks.map((x, i) => (
                      <Alert key={`${x}-${i}`} severity="error" icon={false}>
                        {i + 1}. {x}
                      </Alert>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {t('empty')}
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      ) : null}
    </DashboardContent>
  );
}
