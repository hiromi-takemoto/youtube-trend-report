// YouTube Data API v3 クライアント
// 依存パッケージなし(Node.js 20+ の fetch を利用)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// APIキーの探索順: 環境変数 -> プロジェクト直下 -> 既存の共通置き場
const KEY_CANDIDATES = [
  path.join(__dirname, '..', 'apikey.txt'),
  path.join(os.homedir(), '.gemini', 'youtube-mcp', 'apikey.txt'),
];

function parseKeyFile(raw) {
  // 「#」で始まる行は説明メモとして無視する
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .join('')
    .replace(/^["']|["']$/g, '');
}

let cachedKey = null;

export function getApiKey() {
  if (cachedKey) return cachedKey;

  const fromEnv = process.env.YOUTUBE_API_KEY?.trim();
  if (fromEnv) return (cachedKey = fromEnv);

  for (const file of KEY_CANDIDATES) {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const key = parseKeyFile(raw);
    if (key) return (cachedKey = key);
  }

  throw new Error(
    'APIキーが見つかりません。次のいずれかを用意してください:\n' +
      `  1) ${KEY_CANDIDATES[0]} にAPIキーを1行書く\n` +
      '  2) 環境変数 YOUTUBE_API_KEY にセットする\n' +
      '取り方: https://console.cloud.google.com/ で「YouTube Data API v3」を有効化 -> 認証情報 -> APIキー'
  );
}

// 使ったAPIポイントを数えておく(無料枠は1日10,000)
export const quota = { used: 0 };

async function call(endpoint, params, cost) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  url.searchParams.set('key', getApiKey());

  const res = await fetch(url);
  quota.used += cost;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body?.error?.errors?.[0]?.reason ?? '';
    const msg = body?.error?.message ?? res.statusText;
    if (reason === 'quotaExceeded') {
      throw new Error('本日のAPI利用枠(10,000ポイント)を使い切りました。日本時間17時ごろにリセットされます。');
    }
    if (res.status === 403) {
      throw new Error(`APIキーが無効か、YouTube Data API v3 が有効化されていません。(${msg})`);
    }
    if (res.status === 400) {
      throw new Error(`リクエストが不正です。キーワードを見直してください。(${msg})`);
    }
    throw new Error(`YouTube APIエラー ${res.status}: ${msg}`);
  }
  return body;
}

const num = (v) => (v === undefined || v === null ? null : Number(v));

function daysSince(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  // 最低1日として扱う。0.5日等にすると投稿直後の動画だけ
  // 「1日あたり再生数 > 総再生数」という有り得ない値になり勢いが水増しされる
  return Math.max(d, 1);
}

// ISO8601形式の再生時間(PT1H2M3S)を秒に直す
export function parseDuration(iso) {
  if (!iso) return 0;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, mi, s] = m.map((x) => (x ? Number(x) : 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

function format(v) {
  const s = v.snippet ?? {};
  const st = v.statistics ?? {};
  const views = num(st.viewCount) ?? 0;
  const days = daysSince(s.publishedAt);
  const seconds = parseDuration(v.contentDetails?.duration);
  return {
    id: v.id,
    title: s.title ?? '',
    channel: s.channelTitle ?? '',
    channelId: s.channelId,
    publishedAt: s.publishedAt?.slice(0, 10) ?? '',
    daysOld: Math.round(days),
    views,
    likes: num(st.likeCount),
    comments: num(st.commentCount),
    viewsPerDay: Math.round(views / days), // 勢いの指標
    seconds,
    isShort: seconds > 0 && seconds <= 60,
    url: `https://www.youtube.com/watch?v=${v.id}`,
  };
}

// 動画IDの配列 -> 統計つきの整形済みリスト(videos.list は50件ずつ / 1ポイント)
async function hydrate(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await call(
      'videos',
      { part: 'snippet,statistics,contentDetails', id: ids.slice(i, i + 50).join(','), maxResults: 50 },
      1
    );
    out.push(...(r.items ?? []));
  }
  return out.map(format);
}

/** キーワード検索。search.list は100ポイントと高いので呼び過ぎ注意 */
export async function search({ query, withinDays = 120, maxResults = 50, order = 'viewCount', regionCode = 'JP' }) {
  const params = {
    part: 'id',
    q: query,
    type: 'video',
    order,
    regionCode,
    relevanceLanguage: 'ja',
    maxResults: Math.min(maxResults, 50),
  };
  if (withinDays) params.publishedAfter = new Date(Date.now() - withinDays * 86400000).toISOString();

  const r = await call('search', params, 100);
  const ids = (r.items ?? []).map((i) => i.id?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const videos = await hydrate(ids);
  return videos.sort((a, b) => b.viewsPerDay - a.viewsPerDay);
}

/** チャンネル情報をまとめて取得(channels.list は50件ずつ / 1ポイント) */
export async function channels(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map();
  for (let i = 0; i < unique.length; i += 50) {
    const r = await call(
      'channels',
      { part: 'snippet,statistics', id: unique.slice(i, i + 50).join(','), maxResults: 50 },
      1
    );
    for (const c of r.items ?? []) {
      out.set(c.id, {
        channelId: c.id,
        name: c.snippet?.title ?? '',
        startedAt: c.snippet?.publishedAt?.slice(0, 10) ?? '',
        subscribers: num(c.statistics?.subscriberCount),
        hiddenSubscribers: c.statistics?.hiddenSubscriberCount === true,
        totalViews: num(c.statistics?.viewCount),
        videoCount: num(c.statistics?.videoCount),
        url: `https://www.youtube.com/channel/${c.id}`,
      });
    }
  }
  return out;
}
