// 分析結果を1枚のHTMLレポートにする(外部ライブラリなし・オフラインで開ける)

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const jp = (n) => (n === null || n === undefined ? '—' : Math.round(n).toLocaleString('ja-JP'));
const pct = (n) => `${(n * 100).toFixed(0)}%`;

/** 横棒グラフ(勢いランキング) */
function barChart(rows, { width = 720, barH = 26, gap = 8 } = {}) {
  if (!rows.length) return '';
  const labelW = 260;
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  const chartW = width - labelW - 90;
  const height = rows.length * (barH + gap);

  const bars = rows
    .map((r, i) => {
      const y = i * (barH + gap);
      const w = Math.max((r.value / max) * chartW, 2);
      const label = r.label.length > 24 ? r.label.slice(0, 23) + '…' : r.label;
      return `
    <g>
      <title>${esc(r.label)}</title>
      <text x="${labelW - 10}" y="${y + barH * 0.7}" text-anchor="end" class="lbl">${esc(label)}</text>
      <rect x="${labelW}" y="${y}" width="${w}" height="${barH}" rx="4" class="bar"/>
      <text x="${labelW + w + 8}" y="${y + barH * 0.7}" class="val">${jp(r.value)}</text>
    </g>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" class="chart">${bars}</svg>`;
}

/** 散布図(登録者数 × 再生数)。両対数にしないと大手に潰されて何も見えない */
function scatter(points, { width = 720, height = 380 } = {}) {
  const valid = points.filter((p) => p.x > 0 && p.y > 0);
  if (valid.length < 2) return '<p class="note">データが足りず散布図は省略しました。</p>';

  const pad = { l: 62, r: 18, t: 18, b: 44 };
  const lx = valid.map((p) => Math.log10(p.x));
  const ly = valid.map((p) => Math.log10(p.y));
  const x0 = Math.floor(Math.min(...lx)), x1 = Math.ceil(Math.max(...lx));
  const y0 = Math.floor(Math.min(...ly)), y1 = Math.ceil(Math.max(...ly));
  const sx = (v) => pad.l + ((Math.log10(v) - x0) / (x1 - x0 || 1)) * (width - pad.l - pad.r);
  const sy = (v) => height - pad.b - ((Math.log10(v) - y0) / (y1 - y0 || 1)) * (height - pad.t - pad.b);

  const ticks = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => 10 ** (a + i));
  const gridX = ticks(x0, x1)
    .map((t) => `<line x1="${sx(t)}" y1="${pad.t}" x2="${sx(t)}" y2="${height - pad.b}" class="grid"/>
      <text x="${sx(t)}" y="${height - pad.b + 18}" text-anchor="middle" class="tick">${jp(t)}</text>`)
    .join('');
  const gridY = ticks(y0, y1)
    .map((t) => `<line x1="${pad.l}" y1="${sy(t)}" x2="${width - pad.r}" y2="${sy(t)}" class="grid"/>
      <text x="${pad.l - 8}" y="${sy(t) + 4}" text-anchor="end" class="tick">${jp(t)}</text>`)
    .join('');

  // y=x の線。この線より上 = 登録者数を超える再生が回った動画
  const lo = Math.max(10 ** x0, 10 ** y0), hi = Math.min(10 ** x1, 10 ** y1);
  const eq = lo < hi
    ? `<line x1="${sx(lo)}" y1="${sy(lo)}" x2="${sx(hi)}" y2="${sy(hi)}" class="eqline"/>`
    : '';

  const dots = valid
    .map(
      (p) =>
        `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="${p.hot ? 6 : 4}" class="${p.hot ? 'dot hot' : 'dot'}"><title>${esc(
          p.label
        )}\n登録者 ${jp(p.x)} / 再生 ${jp(p.y)}</title></circle>`
    )
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" class="chart">
    ${gridX}${gridY}${eq}${dots}
    <text x="${width / 2}" y="${height - 6}" text-anchor="middle" class="axis">チャンネル登録者数 →</text>
    <text x="14" y="${height / 2}" text-anchor="middle" transform="rotate(-90 14 ${height / 2})" class="axis">動画の再生数 →</text>
  </svg>`;
}

const CSS = `
:root{--bg:#fff;--fg:#1a1a1a;--muted:#666;--line:#e5e5e5;--card:#fafafa;--accent:#c4302b;--hot:#e8a13a;--good:#2e7d5b}
@media (prefers-color-scheme:dark){:root{--bg:#16181c;--fg:#e8e8e8;--muted:#9aa0a6;--line:#2c2f36;--card:#1e2126;--accent:#ff6b63;--hot:#ffc46b;--good:#5ec99a}}
*{box-sizing:border-box}
body{margin:0;padding:32px 20px 80px;background:var(--bg);color:var(--fg);
 font-family:"Hiragino Kaku Gothic ProN","Yu Gothic UI","Meiryo",system-ui,sans-serif;line-height:1.7}
.wrap{max-width:860px;margin:0 auto}
h1{font-size:26px;margin:0 0 4px;letter-spacing:.02em}
h2{font-size:19px;margin:44px 0 14px;padding-bottom:8px;border-bottom:2px solid var(--line)}
h3{font-size:15px;margin:24px 0 8px;color:var(--muted)}
.sub{color:var(--muted);font-size:13px;margin:0 0 8px}
.cards{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}
.card{flex:1 1 140px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.card .n{font-size:22px;font-weight:700}
.card .k{font-size:12px;color:var(--muted)}
table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}
th,td{padding:9px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:12px;white-space:nowrap}
td.num,th.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.scroll{overflow-x:auto}
.chart{display:block;margin:12px 0 4px}
.chart .bar{fill:var(--accent);opacity:.85}
.chart .lbl{font-size:11px;fill:var(--fg)}
.chart .val{font-size:11px;fill:var(--muted);font-variant-numeric:tabular-nums}
.chart .grid{stroke:var(--line);stroke-width:1}
.chart .tick,.chart .axis{font-size:10px;fill:var(--muted)}
.chart .dot{fill:var(--accent);opacity:.55}
.chart .dot.hot{fill:var(--hot);opacity:1;stroke:var(--bg);stroke-width:1.5}
.chart .eqline{stroke:var(--good);stroke-width:1.5;stroke-dasharray:5 4;opacity:.8}
.tag{display:inline-block;background:var(--card);border:1px solid var(--line);border-radius:20px;
 padding:3px 11px;margin:3px 4px 3px 0;font-size:12px}
.note{background:var(--card);border-left:3px solid var(--accent);padding:12px 14px;border-radius:0 8px 8px 0;
 font-size:13px;margin:14px 0;color:var(--muted)}
.ex{font-size:12px;color:var(--muted);margin:2px 0 0}
footer{margin-top:60px;padding-top:16px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
`;

export function buildReport({ query, generatedAt, videos, sum, formulas, brackets, words, opps, quotaUsed }) {
  const top20 = videos.slice(0, 20);

  const rankRows = top20
    .map(
      (v, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a>
        <div class="ex">${esc(v.channel)}${v.isShort ? ' ・ショート' : ''}</div></td>
      <td class="num">${jp(v.views)}</td>
      <td class="num">${jp(v.viewsPerDay)}</td>
      <td class="num">${v.daysOld}日</td>
    </tr>`
    )
    .join('');

  const oppRows = opps
    .map(
      (v) => `<tr>
      <td><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a>
        <div class="ex">${esc(v.channel)}（${v.channelStartedAt} 開始・${jp(v.channelVideoCount)}本）</div></td>
      <td class="num">${jp(v.subscribers)}</td>
      <td class="num">${jp(v.views)}</td>
      <td class="num"><strong>${v.viewsPerSub.toFixed(1)}倍</strong></td>
    </tr>`
    )
    .join('');

  const formulaRows = formulas
    .map(
      (f) => `<tr>
      <td>${esc(f.name)}<div class="ex">例: ${esc(f.examples[0] ?? '')}</div></td>
      <td class="num">${f.count}本</td>
      <td class="num">${pct(f.share)}</td>
      <td class="num">${jp(f.avgViewsPerDay)}</td>
    </tr>`
    )
    .join('');

  const bars = barChart(top20.slice(0, 15).map((v) => ({ label: v.title, value: v.viewsPerDay })));

  const hotIds = new Set(opps.slice(0, 8).map((o) => o.id));
  const points = opps.length
    ? opps.map((o) => ({ x: o.subscribers, y: o.views, label: o.title, hot: hotIds.has(o.id) }))
    : [];

  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>YouTubeトレンド分析 - ${esc(query)}</title>
<style>${CSS}</style></head><body><div class="wrap">

<h1>YouTubeトレンド分析レポート</h1>
<p class="sub">キーワード「<strong>${esc(query)}</strong>」 ／ 作成 ${esc(generatedAt)} ／ API消費 ${quotaUsed}ポイント</p>

<div class="cards">
  <div class="card"><div class="n">${jp(sum.total)}</div><div class="k">分析した動画</div></div>
  <div class="card"><div class="n">${jp(sum.channels)}</div><div class="k">チャンネル数</div></div>
  <div class="card"><div class="n">${jp(sum.medianViews)}</div><div class="k">再生数の中央値</div></div>
  <div class="card"><div class="n">${pct(sum.shortsShare)}</div><div class="k">ショート動画の割合</div></div>
  <div class="card"><div class="n">${sum.avgMinutes.toFixed(0)}分</div><div class="k">平均の長さ</div></div>
</div>

<h2>1. 勢いランキング</h2>
<p class="sub">「1日あたり再生数」＝ 再生数 ÷ 投稿からの日数。昔バズった動画に埋もれず、いま伸びているものが上に来ます。</p>
${bars}
<div class="scroll"><table>
<thead><tr><th class="num">#</th><th>動画</th><th class="num">再生数</th><th class="num">1日あたり</th><th class="num">経過</th></tr></thead>
<tbody>${rankRows}</tbody></table></div>

<h2>2. 狙い目チャンネル</h2>
<p class="sub">登録者数のわりに再生が回った動画。チャンネルの知名度ではなく<strong>ネタの力で伸びた</strong>ということなので、後発でも同じ土俵に立てる可能性があります。</p>
${scatter(points)}
<p class="note">緑の点線より上にある点＝登録者数を超える再生数が出た動画。オレンジは特に倍率が高いものです。</p>
<div class="scroll"><table>
<thead><tr><th>動画</th><th class="num">登録者</th><th class="num">再生数</th><th class="num">登録者比</th></tr></thead>
<tbody>${oppRows || '<tr><td colspan="4">該当なし</td></tr>'}</tbody></table></div>

<h2>3. タイトルの型</h2>
<p class="sub">どの型がよく使われ、どの型が伸びているか。「平均1日あたり」が高い型ほど効いています。</p>
<div class="scroll"><table>
<thead><tr><th>型</th><th class="num">本数</th><th class="num">割合</th><th class="num">平均1日あたり</th></tr></thead>
<tbody>${formulaRows}</tbody></table></div>

${brackets.length ? `<h3>【】でよく使われている語</h3><div>${brackets
    .slice(0, 20)
    .map((b) => `<span class="tag">【${esc(b.phrase)}】 ${b.count}</span>`)
    .join('')}</div>` : ''}

<h3>頻出キーワード</h3>
<div>${words.map((w) => `<span class="tag">${esc(w.word)} <strong>${w.count}</strong></span>`).join('')}</div>

<footer>
YouTube Data API v3 の実データを集計。数値は取得時点のものです。<br>
検索はチャンネル名にもマッチするため、キーワードと無関係な動画が混ざることがあります。
</footer>
</div></body></html>`;
}
