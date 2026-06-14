// ── VARIABEL GLOBAL ──────────────────────────────────────────
let rawData          = [];
let filteredData     = [];
let summaryStats     = {};
let currentAnomalies = {};

// ── LOAD DATA ────────────────────────────────────────────────
d3.csv('sales.csv').then(function(data) {

  rawData = data.map(d => ({
    orderId:   d['SalesOrderID'],
    orderDate: new Date(d['OrderDate']),
    category:  d['Category'],
    subcat:    d['SubCategory'],
    territory: d['Territory'],
    segment:   d['Segment'],
    product:   d['ProductName'],
    qty:       +d['Qty'],
    unitPrice: +d['UnitPrice'],
    sales:     +d['Sales'],
    discount:  +d['Discount'],
    cost:      +d['ProductCost'],
    profit:    +d['Profit']
  })).filter(d => !isNaN(d.sales) && !isNaN(d.profit) && d.orderDate);

  // Isi dropdown territory dari data
  populateTerritoryFilter();

  // Set filtered data = semua data awal
  filteredData = rawData;

  // Render semua
  renderAll(filteredData);

  // AI narasi (async — tidak blocking)
  runAI(filteredData);

}).catch(err => {
  console.error('Gagal load CSV:', err);
  document.getElementById('narrative-title').textContent =
    'Gagal memuat data. Pastikan file sales.csv ada di folder yang sama.';
});

// ── POPULATE FILTER TERRITORY ────────────────────────────────
function populateTerritoryFilter() {
  const territories = [...new Set(rawData.map(d => d.territory))].sort();
  const sel = document.getElementById('filter-territory');
  territories.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    sel.appendChild(opt);
  });
}

// ── APPLY FILTERS ────────────────────────────────────────────
function applyFilters() {
  const cat  = document.getElementById('filter-category').value;
  const terr = document.getElementById('filter-territory').value;
  const seg  = document.getElementById('filter-segment').value;

  filteredData = rawData.filter(d => {
    if (cat  && d.category  !== cat)  return false;
    if (terr && d.territory !== terr) return false;
    if (seg  && d.segment   !== seg)  return false;
    return true;
  });

  renderAll(filteredData);
}

// ── RESET FILTERS ────────────────────────────────────────────
function resetFilters() {
  document.getElementById('filter-category').value  = '';
  document.getElementById('filter-territory').value = '';
  document.getElementById('filter-segment').value   = '';
  filteredData = rawData;
  renderAll(filteredData);
}

// ── RENDER ALL ───────────────────────────────────────────────
function renderAll(data) {
  // Bersihkan chart lama
  ['chart-category','chart-scatter','chart-trend',
   'chart-territory','chart-top-products'].forEach(id => {
    document.getElementById(id).innerHTML = '';
  });

  // Hitung summary
  summaryStats = computeSummary(data);

  // Render komponen
  renderKPICards(summaryStats);
  renderCategoryTable(summaryStats);
  renderCategoryChart(data);
  renderScatterPlot(data);
  renderTrendChart(data);
  renderTerritoryChart(data);
  renderTopProductsChart(data);

  // Anomaly detection
  currentAnomalies = detectAllAnomalies(data);
  renderAlertList(currentAnomalies);
}

// ── COMPUTE SUMMARY ──────────────────────────────────────────
function computeSummary(data) {
  const totalSales  = d3.sum(data, d => d.sales);
  const totalProfit = d3.sum(data, d => d.profit);
  const totalQty    = d3.sum(data, d => d.qty);
  const margin      = totalSales > 0
    ? (totalProfit / totalSales * 100).toFixed(1)
    : '0.0';

  const byCategory = d3.rollups(data,
    v => ({
      sales:  d3.sum(v, d => d.sales),
      profit: d3.sum(v, d => d.profit),
      qty:    d3.sum(v, d => d.qty)
    }),
    d => d.category
  ).map(([cat, v]) => ({
    category: cat,
    sales:    v.sales,
    profit:   v.profit,
    qty:      v.qty,
    margin:   v.sales > 0 ? (v.profit / v.sales * 100).toFixed(1) : '0.0'
  })).sort((a, b) => b.sales - a.sales);

  const byTerritory = d3.rollups(data,
    v => ({
      sales:  d3.sum(v, d => d.sales),
      profit: d3.sum(v, d => d.profit)
    }),
    d => d.territory
  ).map(([t, v]) => ({
    territory: t,
    sales:     v.sales,
    profit:    v.profit,
    margin:    v.sales > 0 ? (v.profit / v.sales * 100).toFixed(1) : '0.0'
  })).sort((a, b) => b.sales - a.sales);

  const byMonth = d3.rollups(data,
    v => ({
      sales:  d3.sum(v, d => d.sales),
      profit: d3.sum(v, d => d.profit)
    }),
    d => {
      const dt = d.orderDate;
      return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
    }
  ).map(([m, v]) => ({ month: m, ...v }))
   .sort((a, b) => a.month.localeCompare(b.month));

  const sorted = [...byCategory].sort((a,b) => +b.margin - +a.margin);

  return {
    totalSales,
    totalProfit,
    totalQty,
    margin,
    totalOrders:  data.length,
    categories:   byCategory,
    territories:  byTerritory,
    monthly:      byMonth,
    bestCategory: sorted[0],
    worstCategory: sorted[sorted.length - 1]
  };
}

// ── RENDER KPI CARDS ─────────────────────────────────────────
function renderKPICards(stats) {
  const marginNum = parseFloat(stats.margin);
  const marginColor = marginNum >= 10 ? 'kpi-green'
                    : marginNum >= 0  ? 'kpi-yellow'
                    : 'kpi-red';

  const cards = [
    {
      label: 'Total Sales',
      value: `$${(stats.totalSales / 1000000).toFixed(2)}M`,
      sub:   `${stats.totalOrders.toLocaleString()} transaksi`,
      color: 'kpi-blue'
    },
    {
      label: 'Total Profit',
      value: `$${(stats.totalProfit / 1000).toFixed(0)}K`,
      sub:   stats.totalProfit >= 0 ? 'Overall positif' : '⚠ Overall negatif',
      color: stats.totalProfit >= 0 ? 'kpi-green' : 'kpi-red'
    },
    {
      label: 'Profit Margin',
      value: `${stats.margin}%`,
      sub:   marginNum >= 10 ? 'Sehat' : marginNum >= 0 ? 'Perlu perhatian' : 'Merugi',
      color: marginColor
    },
    {
      label: 'Total Qty Sold',
      value: stats.totalQty.toLocaleString(),
      sub:   'unit terjual',
      color: 'kpi-purple'
    },
    {
      label: 'Avg Order Value',
      value: `$${(stats.totalSales / stats.totalOrders).toFixed(0)}`,
      sub:   'per transaksi',
      color: 'kpi-yellow'
    }
  ];

  document.getElementById('kpi-cards').innerHTML = cards.map(c => `
    <div class="kpi-card ${c.color}">
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-value">${c.value}</div>
      <div class="kpi-sub">${c.sub}</div>
    </div>
  `).join('');
}

// ── RENDER CATEGORY TABLE ────────────────────────────────────
function renderCategoryTable(stats) {
  const rows = stats.categories.map(c => `
    <tr>
      <td>${c.category}</td>
      <td>$${(c.sales/1000).toFixed(0)}K</td>
      <td class="${c.profit >= 0 ? 'profit-pos' : 'profit-neg'}">
        $${(c.profit/1000).toFixed(0)}K
      </td>
      <td class="${parseFloat(c.margin) >= 0 ? 'profit-pos' : 'profit-neg'}">
        ${c.margin}%
      </td>
      <td>${c.qty.toLocaleString()}</td>
    </tr>
  `).join('');

  document.getElementById('category-table').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Sales</th>
          <th>Profit</th>
          <th>Margin</th>
          <th>Qty</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ── RENDER ALERT LIST ────────────────────────────────────────
function renderAlertList(anomalies) {
  const sevCount = countSeverity(anomalies);
  document.getElementById('badge-severe').textContent  = sevCount.severe  + ' Kritis';
  document.getElementById('badge-warning').textContent = sevCount.warning + ' Peringatan';

  const container = document.getElementById('alert-tab-raw');
  const items = [];

  anomalies.profitOutliers.forEach(a => items.push({
    severity: a.severity,
    label:    `Profit Margin Anomali: ${a.name}`,
    detail:   `margin ${a.margin}% | Z-score ${a.zScore} | ${a.direction === 'low' ? 'jauh di bawah' : 'jauh di atas'} rata-rata`
  }));

  anomalies.momSpikes.forEach(a => items.push({
    severity: a.severity,
    label:    `Revenue ${a.direction === 'drop' ? 'Turun' : 'Naik'} Drastis: ${a.month}`,
    detail:   `${a.changePct}% MoM | $${Number(a.current).toLocaleString()} vs $${Number(a.previous).toLocaleString()} bulan lalu`
  }));

  (anomalies.iqrOutliers?.bySubcat || []).forEach(a => items.push({
    severity: a.severity,
    label:    `Distribusi Tidak Normal: ${a.subcat}`,
    detail:   `${a.count} transaksi outlier | rata-rata $${Number(a.avgSales).toLocaleString()}`
  }));

  container.innerHTML = items.length === 0
    ? '<p class="placeholder-text">Tidak ada anomali signifikan.</p>'
    : items.map(i => `
        <div class="alert-item">
          <div class="ai-dot ${i.severity}"></div>
          <div>
            <div class="ai-label">${i.label}</div>
            <div class="ai-detail">${i.detail}</div>
          </div>
        </div>
      `).join('');
}

// ── TOMBOL NARASI AI ─────────────────────────────────────────
async function requestAlertNarration() {
  const btn    = document.getElementById('btn-narrate');
  const output = document.getElementById('ai-narration-output');
  btn.disabled    = true;
  btn.textContent = 'Memproses...';
  switchAlertTab('ai', document.querySelectorAll('.alert-tab')[1]);
  output.innerHTML = `<p><span class="spinner-inline"></span>Mengirim ke AI...</p>`;

  try {
    const narration = await narrateAllAlerts(currentAnomalies);
    output.innerHTML = narration
      .split('\n').filter(l => l.trim())
      .map(l => `<div class="narration-line">${l.replace(/\*\*/g,'')}</div>`)
      .join('');
  } catch(e) {
    output.innerHTML = `<p style="color:#dc2626">Error: ${e.message}</p>`;
  } finally {
    btn.disabled    = false;
    btn.textContent = '🤖 Narasi AI';
  }
}

function switchAlertTab(tab, btnEl) {
  document.querySelectorAll('.alert-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.alert-tab-content').forEach(c => c.style.display = 'none');
  if (btnEl) btnEl.classList.add('active');
  const t = document.getElementById('alert-tab-' + tab);
  if (t) t.style.display = 'block';
}

// ── TOMBOL INSIGHT ───────────────────────────────────────────
async function requestInsight() {
  const btn    = document.getElementById('btn-insight');
  const output = document.getElementById('insight-output');
  const q      = document.getElementById('custom-question').value.trim();
  btn.disabled    = true;
  btn.textContent = 'Memproses...';
  output.innerHTML = `<div class="insight-loading"><div class="spinner"></div><span>Mengirim ke AI...</span></div>`;

  try {
    const result = await getInsight(summaryStats, q);
    output.innerHTML = formatInsight(result);
  } catch(e) {
    output.innerHTML = `<p style="color:#dc2626">Error: ${e.message}</p>`;
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Kirim →';
  }
}

function quickAsk(q) {
  document.getElementById('custom-question').value = q;
  requestInsight();
}

// ── RUN AI (dipanggil sekali saat load) ──────────────────────
async function runAI(data) {
  try {
    const title = await generateTitle(summaryStats, currentAnomalies);
    const el = document.getElementById('narrative-title');
    el.textContent = title.trim();
    el.classList.add('loaded');
  } catch(e) {
    document.getElementById('narrative-title').textContent =
      'Sales Dashboard — Adventure Works 2001–2004';
    document.getElementById('narrative-title').classList.add('loaded');
  }

  try {
    const story = await generateStory(summaryStats, currentAnomalies);
    const scr   = parseStoryResponse(story);
    fillZone('setup-text',      scr.setup);
    fillZone('conflict-text',   scr.conflict);
    fillZone('resolution-text', scr.resolution);
  } catch(e) { console.warn('Story error:', e); }

  try {
    const insight = await getInsight(summaryStats, '');
    document.getElementById('insight-output').innerHTML = formatInsight(insight);
  } catch(e) { console.warn('Insight error:', e); }
}

function fillZone(id, text) {
  const el = document.getElementById(id);
  if (el && text) el.textContent = text;
}

// ── CHART 1: BAR CHART SALES PER CATEGORY ───────────────────
function renderCategoryChart(data) {
  const m = { top: 20, right: 20, bottom: 40, left: 100 };
  const w = 400 - m.left - m.right;
  const h = 220 - m.top  - m.bottom;

  const byCategory = d3.rollups(data,
    v => d3.sum(v, d => d.sales),
    d => d.category
  ).map(([cat, val]) => ({ category: cat, sales: val }))
   .sort((a, b) => b.sales - a.sales);

  const svg = d3.select('#chart-category')
    .append('svg')
    .attr('width',  w + m.left + m.right)
    .attr('height', h + m.top  + m.bottom)
    .append('g')
    .attr('transform', `translate(${m.left},${m.top})`);

  const x = d3.scaleLinear()
    .domain([0, d3.max(byCategory, d => d.sales)])
    .range([0, w]);

  const y = d3.scaleBand()
    .domain(byCategory.map(d => d.category))
    .range([0, h])
    .padding(0.3);

  const colors = { Bikes: '#2563eb', Clothing: '#16a34a', Accessories: '#d97706' };

  svg.selectAll('.bar')
    .data(byCategory)
    .enter().append('rect')
    .attr('class', 'bar')
    .attr('x', 0)
    .attr('y',      d => y(d.category))
    .attr('width',  d => x(d.sales))
    .attr('height', y.bandwidth())
    .attr('fill',   d => colors[d.category] || '#2563eb')
    .attr('rx', 3);

  // Label nilai di ujung bar
  svg.selectAll('.bar-label')
    .data(byCategory)
    .enter().append('text')
    .attr('x',  d => x(d.sales) + 4)
    .attr('y',  d => y(d.category) + y.bandwidth() / 2)
    .attr('dominant-baseline', 'central')
    .attr('font-size', 11)
    .attr('fill', '#374151')
    .text(d => `$${(d.sales/1000000).toFixed(2)}M`);

  svg.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).tickSize(0))
    .select('.domain').remove();

  svg.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x)
      .ticks(4)
      .tickFormat(d => `$${(d/1000000).toFixed(1)}M`));
}

// ── CHART 2: SCATTER PLOT SALES VS PROFIT ───────────────────
function renderScatterPlot(data) {
  const m = { top: 20, right: 140, bottom: 50, left: 80 };
  const w = 500 - m.left - m.right;
  const h = 300 - m.top  - m.bottom;

  const bySubcat = d3.rollups(data,
    v => ({
      sales:  d3.sum(v, d => d.sales),
      profit: d3.sum(v, d => d.profit)
    }),
    d => d.subcat
  ).map(([name, v]) => ({
    name,
    sales:  v.sales,
    profit: v.profit,
    margin: v.sales > 0 ? (v.profit / v.sales * 100).toFixed(1) : 0
  }));

  const svg = d3.select('#chart-scatter')
    .append('svg')
    .attr('width',  w + m.left + m.right)
    .attr('height', h + m.top  + m.bottom)
    .append('g')
    .attr('transform', `translate(${m.left},${m.top})`);

  // Pakai skala log supaya titik kecil tetap kelihatan
  const x = d3.scaleLog()
    .domain([
      d3.min(bySubcat, d => d.sales) * 0.5,
      d3.max(bySubcat, d => d.sales) * 1.5
    ])
    .range([0, w]);

  const yMin = d3.min(bySubcat, d => d.profit);
  const yMax = d3.max(bySubcat, d => d.profit);

  const y = d3.scaleLinear()
    .domain([yMin < 0 ? yMin * 1.2 : yMin * 0.5, yMax * 1.2])
    .range([h, 0]);

  // Garis break-even
  svg.append('line')
    .attr('x1', 0).attr('x2', w)
    .attr('y1', y(0)).attr('y2', y(0))
    .attr('stroke', '#dc2626')
    .attr('stroke-dasharray', '5,3')
    .attr('stroke-width', 1.5)
    .attr('opacity', 0.5);

  svg.append('text')
    .attr('x', w)
    .attr('y', y(0) - 5)
    .attr('text-anchor', 'end')
    .attr('font-size', 10)
    .attr('fill', '#dc2626')
    .text('break-even');

  // Warna per kategori
  const colorMap = {
    'Mountain Bikes':     '#2563eb',
    'Road Bikes':         '#7c3aed',
    'Caps':               '#16a34a',
    'Bottles and Cages':  '#d97706',
    'Tires and Tubes':    '#0891b2'
  };

  // Titik scatter
  const circles = svg.selectAll('circle')
    .data(bySubcat)
    .enter().append('circle')
    .attr('cx', d => x(d.sales))
    .attr('cy', d => y(d.profit))
    .attr('r', 10)
    .attr('fill',         d => colorMap[d.name] || '#94a3b8')
    .attr('opacity', 0.85)
    .attr('stroke', '#fff')
    .attr('stroke-width', 2);

  // Tooltip
  d3.select('#scatter-tooltip').remove();
  const tooltip = d3.select('body')
    .append('div')
    .attr('id', 'scatter-tooltip')
    .style('position', 'absolute')
    .style('background', '#ffffff')
    .style('border', '1px solid #e2e5ea')
    .style('border-radius', '8px')
    .style('padding', '10px 14px')
    .style('font-size', '12px')
    .style('pointer-events', 'none')
    .style('opacity', 0)
    .style('line-height', '1.8')
    .style('box-shadow', '0 4px 12px rgba(0,0,0,0.1)');

  circles
    .on('mousemove', function(event, d) {
      tooltip
        .style('opacity', 1)
        .html(`
          <div style="font-weight:600;margin-bottom:4px;color:#1a1d23">${d.name}</div>
          <div style="color:#2563eb">📈 Sales &nbsp;&nbsp;$${(d.sales/1000).toFixed(0)}K</div>
          <div style="color:${d.profit < 0 ? '#dc2626' : '#16a34a'}">
            💰 Profit &nbsp;$${(d.profit/1000).toFixed(0)}K
          </div>
          <div style="color:#6b7280;font-size:11px;margin-top:4px">
            Margin: ${d.margin}%
          </div>
        `)
        .style('left', (event.pageX + 16) + 'px')
        .style('top',  (event.pageY - 40) + 'px');
    })
    .on('mouseleave', () => tooltip.style('opacity', 0));

  // Label nama — digeser supaya tidak numpuk
  const labelOffset = {
    'Mountain Bikes':    { dx: 22, dy: 4  },
    'Road Bikes':        { dx: 22, dy: 4  },
    'Caps':              { dx: 22, dy: -8 },
    'Bottles and Cages': { dx: 22, dy: 8  },
    'Tires and Tubes':   { dx: 22, dy: 18 }
  };

  svg.selectAll('.dot-label')
    .data(bySubcat)
    .enter().append('text')
    .attr('class', 'dot-label')
    .attr('x', d => x(d.sales) + (labelOffset[d.name]?.dx || 14))
    .attr('y', d => y(d.profit) + (labelOffset[d.name]?.dy || 4))
    .attr('font-size', 10)
    .attr('fill', '#374151')
    .text(d => d.name);

  // Axis X — format log scale
  svg.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x)
      .ticks(5, d => `$${(d/1000).toFixed(0)}K`));

  svg.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).ticks(5)
      .tickFormat(d => `$${(d/1000).toFixed(0)}K`));

  // Label axis
  svg.append('text')
    .attr('x', w / 2).attr('y', h + 42)
    .attr('text-anchor', 'middle')
    .attr('font-size', 11).attr('fill', '#6b7280')
    .text('Total Sales (log scale)');

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -h / 2).attr('y', -65)
    .attr('text-anchor', 'middle')
    .attr('font-size', 11).attr('fill', '#6b7280')
    .text('Total Profit');

  // Legend
  const legend = svg.append('g')
    .attr('transform', `translate(${w + 10}, 0)`);

  bySubcat.forEach((d, i) => {
    legend.append('circle')
      .attr('cx', 6).attr('cy', i * 20)
      .attr('r', 5)
      .attr('fill', colorMap[d.name] || '#94a3b8');
    legend.append('text')
      .attr('x', 14).attr('y', i * 20 + 4)
      .attr('font-size', 10)
      .attr('fill', '#374151')
      .text(d.name);
  });
}

// ── CHART 3: LINE CHART TREN BULANAN ────────────────────────
function renderTrendChart(data) {
  const m = { top: 20, right: 80, bottom: 50, left: 80 };
  const w = 900 - m.left - m.right;
  const h = 260 - m.top  - m.bottom;

  const byMonth = d3.rollups(data,
    v => ({
      sales:  d3.sum(v, d => d.sales),
      profit: d3.sum(v, d => d.profit)
    }),
    d => {
      const dt = d.orderDate;
      return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
    }
  ).map(([m, v]) => ({ month: m, ...v }))
   .sort((a, b) => a.month.localeCompare(b.month));

  const svg = d3.select('#chart-trend')
    .append('svg')
    .attr('width',  w + m.left + m.right)
    .attr('height', h + m.top  + m.bottom)
    .append('g')
    .attr('transform', `translate(${m.left},${m.top})`);

  const parseMonth = d3.timeParse('%Y-%m');
  const months = byMonth.map(d => ({ ...d, date: parseMonth(d.month) }));

  const x = d3.scaleTime()
    .domain(d3.extent(months, d => d.date))
    .range([0, w]);

  const ySales = d3.scaleLinear()
    .domain([0, d3.max(months, d => d.sales) * 1.1])
    .range([h, 0]);

  const yProfit = d3.scaleLinear()
    .domain([
      d3.min(months, d => d.profit) * 1.2,
      d3.max(months, d => d.profit) * 1.2
    ])
    .range([h, 0]);

  // Area sales
  const areaSales = d3.area()
    .x(d => x(d.date))
    .y0(h)
    .y1(d => ySales(d.sales))
    .curve(d3.curveMonotoneX);

  svg.append('path')
    .datum(months)
    .attr('fill', '#2563eb')
    .attr('opacity', 0.1)
    .attr('d', areaSales);

  // Garis sales
  const lineSales = d3.line()
    .x(d => x(d.date))
    .y(d => ySales(d.sales))
    .curve(d3.curveMonotoneX);

  svg.append('path')
    .datum(months)
    .attr('fill', 'none')
    .attr('stroke', '#2563eb')
    .attr('stroke-width', 2)
    .attr('d', lineSales);

  // Garis profit (pakai axis kanan)
  const lineProfit = d3.line()
    .x(d => x(d.date))
    .y(d => yProfit(d.profit))
    .curve(d3.curveMonotoneX);

  svg.append('path')
    .datum(months)
    .attr('fill', 'none')
    .attr('stroke', '#16a34a')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '5,3')
    .attr('d', lineProfit);

  // Garis nol profit
  svg.append('line')
    .attr('x1', 0).attr('x2', w)
    .attr('y1', yProfit(0)).attr('y2', yProfit(0))
    .attr('stroke', '#dc2626')
    .attr('stroke-dasharray', '3,3')
    .attr('stroke-width', 1)
    .attr('opacity', 0.5);

  // Axis
  svg.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).tickFormat(d3.timeFormat('%Y-%m')).ticks(8));

  svg.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(ySales).ticks(5).tickFormat(d => `$${(d/1000).toFixed(0)}K`));

  svg.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(${w},0)`)
    .call(d3.axisRight(yProfit).ticks(5).tickFormat(d => `$${(d/1000).toFixed(0)}K`));

  // Legend
  const legend = svg.append('g').attr('transform', `translate(${w - 160}, 0)`);
  legend.append('line').attr('x1',0).attr('x2',20).attr('y1',8).attr('y2',8)
    .attr('stroke','#2563eb').attr('stroke-width',2);
  legend.append('text').attr('x',24).attr('y',12)
    .attr('font-size',11).attr('fill','#374151').text('Sales');
  legend.append('line').attr('x1',60).attr('x2',80).attr('y1',8).attr('y2',8)
    .attr('stroke','#16a34a').attr('stroke-width',2).attr('stroke-dasharray','5,3');
  legend.append('text').attr('x',84).attr('y',12)
    .attr('font-size',11).attr('fill','#374151').text('Profit');

  // ── TOOLTIP ─────────────────────────────────────────────
  const tooltip = d3.select('body')
    .append('div')
    .attr('id', 'trend-tooltip')
    .style('position', 'absolute')
    .style('background', '#ffffff')
    .style('border', '1px solid #e2e5ea')
    .style('border-radius', '8px')
    .style('padding', '10px 14px')
    .style('font-size', '12px')
    .style('color', '#374151')
    .style('box-shadow', '0 4px 12px rgba(0,0,0,0.1)')
    .style('pointer-events', 'none')
    .style('opacity', 0)
    .style('line-height', '1.8')
    .style('min-width', '160px');

  // Garis vertikal saat hover
  const hoverLine = svg.append('line')
    .attr('class', 'hover-line')
    .attr('y1', 0)
    .attr('y2', h)
    .attr('stroke', '#94a3b8')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '4,3')
    .style('opacity', 0);

  // Area transparan untuk menangkap mouse
  svg.append('rect')
    .attr('width', w)
    .attr('height', h)
    .attr('fill', 'none')
    .attr('pointer-events', 'all')
    .on('mousemove', function(event) {
      const [mx] = d3.pointer(event, this);

      // Cari data point terdekat
      const bisect   = d3.bisector(d => d.date).left;
      const x0       = x.invert(mx);
      const idx      = bisect(months, x0, 1);
      const d0       = months[idx - 1];
      const d1       = months[idx];
      if (!d0 && !d1) return;
      const d        = !d1 ? d0 : !d0 ? d1
                     : (x0 - d0.date) < (d1.date - x0) ? d0 : d1;

      // Format bulan dan kuartal
      const dt       = d.date;
      const bulan    = dt.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
      const quarter  = `Q${Math.ceil((dt.getMonth() + 1) / 3)}`;
      const xPos     = x(d.date);

      // Geser garis vertikal
      hoverLine
        .attr('x1', xPos)
        .attr('x2', xPos)
        .style('opacity', 1);

      // Tampilkan tooltip
      tooltip
        .style('opacity', 1)
        .html(`
          <div style="font-weight:600; margin-bottom:4px; color:#1a1d23">
            ${bulan} · ${quarter}
          </div>
          <div style="color:#2563eb">
            📈 Sales &nbsp;&nbsp; $${d.sales.toLocaleString('en-US', {maximumFractionDigits:0})}
          </div>
          <div style="color:${d.profit >= 0 ? '#16a34a' : '#dc2626'}">
            💰 Profit &nbsp; $${d.profit.toLocaleString('en-US', {maximumFractionDigits:0})}
          </div>
          <div style="color:#6b7280; font-size:11px; margin-top:4px">
            Margin: ${d.sales > 0 ? (d.profit/d.sales*100).toFixed(1) : 0}%
          </div>
        `)
        .style('left', (event.pageX + 16) + 'px')
        .style('top',  (event.pageY - 40) + 'px');
    })
    .on('mouseleave', function() {
      hoverLine.style('opacity', 0);
      tooltip.style('opacity', 0);
    });
}

// ── CHART 4: BAR CHART TERRITORY ────────────────────────────
function renderTerritoryChart(data) {
  const m = { top: 20, right: 20, bottom: 40, left: 110 };
  const w = 400 - m.left - m.right;
  const h = 300 - m.top  - m.bottom;

  const byTerritory = d3.rollups(data,
    v => ({
      sales:  d3.sum(v, d => d.sales),
      profit: d3.sum(v, d => d.profit)
    }),
    d => d.territory
  ).map(([t, v]) => ({
    territory: t,
    profit:    v.profit,
    sales:     v.sales
  })).sort((a, b) => b.profit - a.profit);

  const svg = d3.select('#chart-territory')
    .append('svg')
    .attr('width',  w + m.left + m.right)
    .attr('height', h + m.top  + m.bottom)
    .append('g')
    .attr('transform', `translate(${m.left},${m.top})`);

  const minVal = d3.min(byTerritory, d => d.profit);
  const maxVal = d3.max(byTerritory, d => d.profit);

  const x = d3.scaleLinear()
    .domain([Math.min(minVal * 1.1, 0), maxVal * 1.1])
    .range([0, w]);

  const y = d3.scaleBand()
    .domain(byTerritory.map(d => d.territory))
    .range([0, h])
    .padding(0.25);

  // Garis nol
  svg.append('line')
    .attr('x1', x(0)).attr('x2', x(0))
    .attr('y1', 0).attr('y2', h)
    .attr('stroke', '#94a3b8')
    .attr('stroke-dasharray', '4,3')
    .attr('stroke-width', 1);

  svg.selectAll('.bar')
    .data(byTerritory)
    .enter().append('rect')
    .attr('class', 'bar')
    .attr('x',      d => d.profit >= 0 ? x(0) : x(d.profit))
    .attr('y',      d => y(d.territory))
    .attr('width',  d => Math.abs(x(d.profit) - x(0)))
    .attr('height', y.bandwidth())
    .attr('fill',   d => d.profit >= 0 ? '#16a34a' : '#dc2626')
    .attr('rx', 3);

  // Tooltip
  svg.selectAll('.bar')
    .append('title')
    .text(d => `${d.territory}\nSales: $${(d.sales/1000).toFixed(0)}K\nProfit: $${(d.profit/1000).toFixed(0)}K`);

  svg.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).tickSize(0))
    .select('.domain').remove();

  svg.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(4).tickFormat(d => `$${(d/1000).toFixed(0)}K`));
}

// ── CHART 5: TOP 10 PRODUCTS ─────────────────────────────────
function renderTopProductsChart(data) {
  const m = { top: 20, right: 80, bottom: 40, left: 160 };
  const w = 400 - m.left - m.right;
  const h = 320 - m.top  - m.bottom;

  const byProduct = d3.rollups(data,
    v => d3.sum(v, d => d.sales),
    d => d.product
  ).map(([name, sales]) => ({ name, sales }))
   .sort((a, b) => b.sales - a.sales)
   .slice(0, 10);

  const svg = d3.select('#chart-top-products')
    .append('svg')
    .attr('width',  w + m.left + m.right)
    .attr('height', h + m.top  + m.bottom)
    .append('g')
    .attr('transform', `translate(${m.left},${m.top})`);

  const x = d3.scaleLinear()
    .domain([0, d3.max(byProduct, d => d.sales)])
    .range([0, w]);

  const y = d3.scaleBand()
    .domain(byProduct.map(d => d.name))
    .range([0, h])
    .padding(0.25);

  svg.selectAll('.bar')
    .data(byProduct)
    .enter().append('rect')
    .attr('class', 'bar')
    .attr('x', 0)
    .attr('y',      d => y(d.name))
    .attr('width',  d => x(d.sales))
    .attr('height', y.bandwidth())
    .attr('fill',   '#7c3aed')
    .attr('rx', 3);

  // Label nilai
  svg.selectAll('.bar-label')
    .data(byProduct)
    .enter().append('text')
    .attr('x',  d => x(d.sales) + 4)
    .attr('y',  d => y(d.name) + y.bandwidth() / 2)
    .attr('dominant-baseline', 'central')
    .attr('font-size', 10)
    .attr('fill', '#374151')
    .text(d => `$${(d.sales/1000).toFixed(0)}K`);

  // Nama produk dipotong kalau terlalu panjang
  svg.append('g')
    .attr('class', 'axis')
    .call(d3.axisLeft(y).tickSize(0).tickFormat(d => {
      return d.length > 20 ? d.substring(0, 20) + '...' : d;
    }))
    .select('.domain').remove();

  svg.append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(4).tickFormat(d => `$${(d/1000).toFixed(0)}K`));
}