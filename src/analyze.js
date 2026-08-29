// 取得した動画データから「型」と「狙い目」を読み取る

/** タイトルの【】内に入っている語を集計する(日本語YouTubeで最頻出の装飾) */
export function bracketPhrases(videos, minCount = 2) {
  const counts = new Map();
  for (const v of videos) {
    for (const m of v.title.matchAll(/[【\[]([^】\]]{1,20})[】\]]/g)) {
      const key = m[1].trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1])
    .map(([phrase, count]) => ({ phrase, count }));
}

// よく使われるタイトルの構文。name は日本語での説明
const TITLE_FORMULAS = [
  { name: '数字で列挙(〇選 / TOP〇)', re: /\d+\s*(選|位|個|つ|本)|TOP\s*\d+|ランキング/i },
  { name: '金額を出す(月〇万 / 〇円)', re: /[0-9０-９]+\s*(万|億)?\s*円|月収|年収|月[0-9０-９]+万/ },
  { name: '初心者向けと明示', re: /初心者|入門|ゼロから|未経験|超初心者|基礎/ },
  { name: '最新・年号を入れる', re: /最新|20\d\d年|今すぐ|速報/ },
  { name: '完全・徹底で網羅を示す', re: /完全|徹底|全部|まとめ|保存版|決定版/ },
  { name: '限定感・煽り', re: /有料級|暴露|本当は|禁止|やばい|ヤバい|神回|必見|衝撃/ },
  { name: '方法・手順を約束', re: /方法|やり方|手順|ロードマップ|コツ|攻略/ },
  { name: '比較・検証', re: /比較|検証|試して|使ってみた|どっち|vs/i },
  { name: '疑問形で引く', re: /[?？]$|とは|なぜ|どうやって/ },
  { name: '実演・密着', re: /実演|密着|1日|ルーティン|やってみた/ },
];

/** どの「型」が何本使われているかを集計 */
export function titleFormulas(videos) {
  return TITLE_FORMULAS.map(({ name, re }) => {
    const hits = videos.filter((v) => re.test(v.title));
    const avgVpd = hits.length
      ? Math.round(hits.reduce((s, v) => s + v.viewsPerDay, 0) / hits.length)
      : 0;
    return {
      name,
      count: hits.length,
      share: videos.length ? hits.length / videos.length : 0,
      avgViewsPerDay: avgVpd,
      examples: hits.slice(0, 3).map((v) => v.title),
    };
  })
    .filter((f) => f.count > 0)
    .sort((a, b) => b.avgViewsPerDay - a.avgViewsPerDay);
}

// 助詞・記号など、数えても意味のない語
const STOP = new Set(
  ('これ それ あれ どれ こと もの ため よう そう ここ とき 場合 people the and for you your with' +
    ' this that how why what all get make your are can').split(/\s+/)
);

/** 頻出キーワードを抜く(形態素解析なしの簡易版: カタカナ語・漢字語・英単語を拾う) */
export function keywords(videos, top = 25) {
  const counts = new Map();
  for (const v of videos) {
    // 装飾記号を空白に潰してから単語を切り出す
    const cleaned = v.title.replace(/[【】\[\]（）()「」『』！!？?、。・\|｜/･:：〜~＆&#＃"'’]/g, ' ');
    const tokens = cleaned.match(/[ァ-ヴー]{2,}|[一-龠々]{2,}|[A-Za-z][A-Za-z0-9+.-]{1,}/g) ?? [];
    // 1本の動画内での重複は1回として数える(連呼で歪まないように)
    for (const t of new Set(tokens)) {
      const k = t.toLowerCase();
      if (STOP.has(k) || k.length < 2) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([word, count]) => ({ word, count }));
}

/**
 * 狙い目チャンネルを見つける。
 * 「登録者数のわりに再生が回っている」= チャンネルの知名度ではなく
 * ネタの力で伸びた ということ。つまり後発でも同じ土俵に立てる可能性が高い。
 */
export function opportunities(videos, channelMap, { minViews = 3000, limit = 15 } = {}) {
  const rows = [];
  for (const v of videos) {
    const c = channelMap.get(v.channelId);
    if (!c || c.hiddenSubscribers || !c.subscribers) continue;
    if (v.views < minViews) continue;
    rows.push({
      ...v,
      subscribers: c.subscribers,
      channelStartedAt: c.startedAt,
      channelVideoCount: c.videoCount,
      // 登録者1人あたり何回再生されたか
      viewsPerSub: v.views / c.subscribers,
    });
  }
  return rows.sort((a, b) => b.viewsPerSub - a.viewsPerSub).slice(0, limit);
}

/** 全体のざっくり統計 */
export function summary(videos) {
  if (!videos.length) return null;
  const sorted = [...videos].sort((a, b) => a.views - b.views);
  const median = sorted[Math.floor(sorted.length / 2)].views;
  const shorts = videos.filter((v) => v.isShort).length;
  const withDuration = videos.filter((v) => v.seconds > 0);
  const avgMin = withDuration.length
    ? withDuration.reduce((s, v) => s + v.seconds, 0) / withDuration.length / 60
    : 0;
  return {
    total: videos.length,
    medianViews: median,
    maxViews: Math.max(...videos.map((v) => v.views)),
    shortsShare: shorts / videos.length,
    avgMinutes: avgMin,
    channels: new Set(videos.map((v) => v.channelId)).size,
    newestDays: Math.min(...videos.map((v) => v.daysOld)),
  };
}
