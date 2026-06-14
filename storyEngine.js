async function generateTitle(summary, anomalies) {

  const severeCount =
    anomalies.profitOutliers.filter(a => a.severity === "severe").length +
    anomalies.momSpikes.filter(a => a.severity === "severe").length;

  const prompt = `
Kamu adalah Business Intelligence Analyst.

DATA:
- Total Sales: $${Number(summary.totalSales).toFixed(0)}
- Total Profit: $${Number(summary.totalProfit).toFixed(0)}
- Profit Margin: ${summary.margin}%
- Anomali Kritis: ${severeCount}

Tugas:
Buat SATU judul dashboard profesional.

Aturan:
- Bahasa Indonesia.
- Maksimal 12 kata.
- Gunakan angka bila relevan.
- Fokus pada insight bisnis.
- Hindari kata sensasional seperti:
  "melejit", "menggila", "terancam",
  "membengkak", "krisis", "spike".

Contoh yang baik:
- Penjualan Tumbuh 22%, Margin Profit Perlu Evaluasi
- Revenue Meningkat dengan Beberapa Anomali Operasional
- Bikes Mendominasi Penjualan namun Margin Lebih Rendah

Tulis judul saja.
`;

  return await callGroq(prompt);
}

// -----------------------------------------------------
// GENERATE STORY
// -----------------------------------------------------
async function generateStory(summary, anomalies) {
  const prompt = buildStoryPrompt(summary, anomalies);
  return await callGroq(prompt);
}

// -----------------------------------------------------
// BUILD PROMPT
// -----------------------------------------------------
function buildStoryPrompt(summary, anomalies) {

  const catLines = summary.categories
    .map(c =>
      `- ${c.category}: Sales $${(c.sales / 1000).toFixed(0)}K | Margin ${c.margin}%`
    )
    .join("\n");

  const profitLines =
    anomalies.profitOutliers.length > 0
      ? anomalies.profitOutliers
          .slice(0, 5)
          .map(
            a =>
              `- ${a.name}: Margin ${a.margin}% (Z=${a.zScore})`
          )
          .join("\n")
      : "- Tidak ditemukan anomali profit yang signifikan";

  const momLines =
    anomalies.momSpikes.length > 0
      ? anomalies.momSpikes
          .slice(0, 3)
          .map(
            a =>
              `- ${a.month}: ${a.changePct}% dibanding bulan sebelumnya`
          )
          .join("\n")
      : "- Tidak ditemukan lonjakan bulanan yang signifikan";

  return `
Kamu adalah Senior Business Analyst.

Buat ringkasan eksekutif berdasarkan data berikut.

================================================
RINGKASAN KINERJA
================================================

Total Sales:
$${Number(summary.totalSales).toFixed(0)}

Total Profit:
$${Number(summary.totalProfit).toFixed(0)}

Profit Margin:
${summary.margin}%

Total Orders:
${summary.totalOrders}

================================================
KATEGORI
================================================

${catLines}

================================================
ANOMALI PROFIT
================================================

${profitLines}

================================================
ANOMALI BULANAN
================================================

${momLines}

================================================
ATURAN PENULISAN
================================================

- Bahasa Indonesia formal.
- Maksimal 6 kalimat total.
- Fokus pada insight bisnis.
- Jangan menggunakan bahasa sensasional.
- Jangan mengarang data.
- Gunakan angka yang tersedia.
- Tulis seperti laporan manajemen.

FORMAT WAJIB:

SETUP
[1-2 kalimat]

CONFLICT
[1-2 kalimat]

RESOLUTION
[1-2 kalimat]
`;
}

// -----------------------------------------------------
// PARSE RESPONSE
// -----------------------------------------------------
function parseStoryResponse(text) {

  const result = {
    setup: "",
    conflict: "",
    resolution: "",
    raw: text
  };

  const setupMatch =
    text.match(
      /SETUP[^\n]*\n([\s\S]*?)(?=CONFLICT|RESOLUTION|$)/i
    );

  const conflictMatch =
    text.match(
      /CONFLICT[^\n]*\n([\s\S]*?)(?=RESOLUTION|SETUP|$)/i
    );

  const resolutionMatch =
    text.match(
      /RESOLUTION[^\n]*\n([\s\S]*?)(?=SETUP|CONFLICT|$)/i
    );

  if (setupMatch)
    result.setup = setupMatch[1].trim();

  if (conflictMatch)
    result.conflict = conflictMatch[1].trim();

  if (resolutionMatch)
    result.resolution = resolutionMatch[1].trim();

  if (
    !result.setup &&
    !result.conflict &&
    !result.resolution
  ) {
    result.setup = text.trim();
  }

  return result;
}