async function getInsight(stats, focusQuestion = '') {
  const prompt = buildPrompt(stats, focusQuestion);
  return await callGroq(prompt);
}

function buildPrompt(stats, focusQuestion = '') {
  const catLines = stats.categories
    .map(c => `  - ${c.category}: Sales $${(c.sales/1000).toFixed(0)}K, Profit $${(c.profit/1000).toFixed(0)}K, Margin ${c.margin}%`)
    .join('\n');

  const terrLines = stats.territories.slice(0, 5)
    .map(t => `  - ${t.territory}: Sales $${(t.sales/1000).toFixed(0)}K`)
    .join('\n');

  const context = `
Data penjualan Adventure Works (2001–2004), bisnis sepeda dan aksesori:

KESELURUHAN:
  - Total Sales  : $${Number(stats.totalSales).toFixed(0)}
  - Total Profit : $${Number(stats.totalProfit).toFixed(0)}
  - Profit Margin: ${stats.margin}%
  - Total Qty    : ${stats.totalQty} unit
  - Total Orders : ${stats.totalOrders}

PERFORMA PER KATEGORI:
${catLines}

TOP 5 TERRITORY:
${terrLines}

Kategori margin terbaik : ${stats.bestCategory?.category} (${stats.bestCategory?.margin}%)
Kategori margin terburuk: ${stats.worstCategory?.category} (${stats.worstCategory?.margin}%)
`;

  const question = focusQuestion ||
    'Berikan 3 insight bisnis paling penting dan rekomendasi konkret untuk tiap poin. Gunakan Bahasa Indonesia.';

  return context + '\n---\nPertanyaan: ' + question;
}

async function callGroq(prompt) {
  const res = await fetch(CONFIG.GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: CONFIG.GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Kamu adalah analis bisnis senior yang memberi insight singkat, praktis, dan langsung ke poin. Gunakan Bahasa Indonesia.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 600,
      temperature: 0.3
    })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Groq error: ${err.error?.message || res.status}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function narrateAllAlerts(anomalies) {
  const allItems = [
    ...anomalies.profitOutliers,
    ...anomalies.momSpikes.slice(0, 3)
  ];

  if (allItems.length === 0) return 'Tidak ada anomali signifikan terdeteksi.';

  const itemLines = allItems.map((a, i) => {
    if (a.type === 'profit_outlier')
      return `${i+1}. [${a.severity.toUpperCase()}] Sub-kategori ${a.name}: margin ${a.margin}% (Z=${a.zScore})`;
    if (a.type === 'mom_spike')
      return `${i+1}. [${a.severity.toUpperCase()}] Revenue ${a.month}: ${a.changePct}% MoM`;
    return `${i+1}. [INFO] IQR outlier di ${a.subcat} (${a.count} transaksi)`;
  }).join('\n');

  const prompt = `Kamu adalah analis data bisnis yang memberi alert singkat dan actionable.
Berikut anomali yang terdeteksi di data penjualan Adventure Works:

${itemLines}

Untuk setiap anomali, tulis satu kalimat alert dalam Bahasa Indonesia.
Format: "• [nama/bulan]: [fakta mengejutkan] — [rekomendasi singkat]"
Urutkan dari yang paling kritis. Langsung ke list tanpa preamble.`;

  return await callGroq(prompt);
}

function formatInsight(text) {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,3}\s*/gm, '')
    .split('\n')
    .map(line => {
      line = line.trim();
      if (!line) return '<div class="insight-gap"></div>';
      if (/^\d+\.\s/.test(line)) return `<div class="insight-item">${line}</div>`;
      if (/^[•\-\*]\s/.test(line)) return `<div class="insight-bullet">• ${line.replace(/^[•\-\*]\s+/, '')}</div>`;
      return `<div class="insight-line">${line}</div>`;
    })
    .join('');
}