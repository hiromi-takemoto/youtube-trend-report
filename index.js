#!/usr/bin/env node
// YouTubeトレンド分析レポート生成ツール
// 使い方: node index.js "キーワード" [--days 120] [--out フォルダ]
import fs from 'node:fs';
import path from 'node:path';
import { search, channels, quota } from './src/api.js';
import { summary, titleFormulas, bracketPhrases, keywords, opportunities } from './src/analyze.js';
import { buildReport } from './src/report.js';

function parseArgs(argv) {
  const opts = { days: 120, out: 'reports', max: 50 };
  const words = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--days') opts.days = Number(argv[++i]);
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--max') opts.max = Number(argv[++i]);
    else if (a === '--help' || a === '-h') opts.help = true;
    else words.push(a);
  }
  opts.query = words.join(' ').trim();
  return opts;
}

const HELP = `
YouTubeトレンド分析レポート生成ツール

  node index.js "キーワード" [オプション]

オプション
  --days <数>   何日前までの動画を対象にするか (既定: 120)
  --max  <数>   取得する動画の件数 1-50      (既定: 50)
  --out  <場所> レポートの保存先フォルダ      (既定: reports)

例
  node index.js "AI 副業 初心者"
  node index.js "せどり" --days 30
`;

// ファイル名に使えない文字を落とす
const safeName = (s) => s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_').slice(0, 60);

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || !opts.query) {
    console.log(HELP);
    process.exit(opts.query ? 0 : 1);
  }
  if (!Number.isFinite(opts.days) || opts.days < 1) {
    console.error('--days は1以上の数を指定してください');
    process.exit(1);
  }

  console.log(`\n「${opts.query}」を調べています (直近${opts.days}日)...`);

  const videos = await search({ query: opts.query, withinDays: opts.days, maxResults: opts.max });
  if (!videos.length) {
    console.error('\n動画が見つかりませんでした。キーワードを変えるか --days を増やしてみてください。');
    process.exit(1);
  }
  console.log(`  動画 ${videos.length}件を取得`);

  const channelMap = await channels(videos.map((v) => v.channelId));
  console.log(`  チャンネル ${channelMap.size}件を取得`);

  const html = buildReport({
    query: opts.query,
    generatedAt: new Date().toLocaleString('ja-JP'),
    videos,
    sum: summary(videos),
    formulas: titleFormulas(videos),
    brackets: bracketPhrases(videos),
    words: keywords(videos),
    opps: opportunities(videos, channelMap),
    quotaUsed: quota.used,
  });

  const outDir = path.resolve(opts.out);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${new Date().toISOString().slice(0, 10)}_${safeName(opts.query)}.html`);
  fs.writeFileSync(file, html, 'utf8');

  console.log(`\n完成しました:\n  ${file}`);
  console.log(`\nAPI消費: ${quota.used}ポイント (1日の上限 10,000)`);
  console.log('ブラウザで開くには:');
  console.log(`  start "" "${file}"\n`);
}

main().catch((e) => {
  console.error(`\nエラー: ${e.message}\n`);
  process.exit(1);
});
