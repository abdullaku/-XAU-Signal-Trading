// ===== پەیوەندی بە Supabase =====
const SUPABASE_URL = 'https://xekpxulamhgplnxfnczp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhla3B4dWxhbWhncGxueGZuY3pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MjEwMjYsImV4cCI6MjA4OTE5NzAyNn0.U-k2seLEQ9tMrMslmO-b81suWspCNFloozQn5PL5Zgc';

// ===== گۆڕاوە گشتییەکان =====
let allData = [];
let currentTable = 'closed';
let chartInstance = null;
let doughnutChart = null;
let currentTimeFilter = 'all';
let currentRoiPeriod = 'ALL';
let roiLineChart = null;

const $ = (id) => document.getElementById(id);

// ===== هێنانی داتاکان لە خشتەی 'signals' =====
async function fetchSignals() {
    try {
        const url = `${SUPABASE_URL}/rest/v1/signals?select=*&order=id.desc`;
        console.log('🔍 خوێندنی داتا لە:', url);
        const res = await fetch(url, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
            },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
        const data = await res.json();
        console.log('✅ داتا وەرگیرا:', data.length, 'ڕیکۆرد');
        return data;
    } catch (err) {
        console.error('❌ هەڵەی هێنانی داتا:', err);
        return [];
    }
}

// ===== گۆڕینی تاب =====
async function switchTable(table) {
    currentTable = table;
    document.querySelectorAll('.tabs button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.table === table);
    });
    applyFilters();
    updateROI();
}

// ===== ROI =====
function filterByRoiPeriod(data, period) {
    if (period === 'ALL') return data;
    const now = new Date();
    const cutoff = new Date(now);
    if (period === '1D') cutoff.setDate(now.getDate() - 1);
    else if (period === '1W') cutoff.setDate(now.getDate() - 7);
    else if (period === '1M') cutoff.setMonth(now.getMonth() - 1);
    else if (period === '3M') cutoff.setMonth(now.getMonth() - 3);
    else if (period === '6M') cutoff.setMonth(now.getMonth() - 6);
    return data.filter(r => {
        const d = new Date(r.closed_at || r.created_at);
        return !isNaN(d) && d >= cutoff;
    });
}

function updateROI() {
    renderRoiLineChart();
}

function renderRoiLineChart() {
    const closedData = allData.filter(r => r.closed_at !== null && r.closed_at !== undefined && r.closed_at !== '');
    const period = currentRoiPeriod;
    let filtered = filterByRoiPeriod(closedData, period);
    filtered = [...filtered].sort((a, b) =>
        new Date(a.closed_at || a.created_at) - new Date(b.closed_at || b.created_at)
    );

    let cumulativePips = 0;
    const labels = [];
    const values = [];

    filtered.forEach(row => {
        const p = getProfit(row);
        if (p === null) return;
        cumulativePips += p;
        labels.push(formatDate(row.closed_at || row.created_at));
        values.push(parseFloat(cumulativePips.toFixed(1)));
    });

    const finalPip = values.length ? values[values.length - 1] : 0;

    const roiEl = $('roiValue');
    roiEl.textContent = (finalPip >= 0 ? '+' : '') + finalPip.toFixed(1) + ' pip';
    roiEl.className = 'roi-value' + (finalPip < 0 ? ' negative' : '');
    $('roiChange').textContent = (finalPip >= 0 ? '+' : '') + finalPip.toFixed(1) + ' pip';
    $('roiPeriod').textContent = period === 'ALL' ? 'All Time' : period;

    const canvas = $('roiLineChart');
    const emptyMsg = $('roiChartEmpty');

    if (roiLineChart) { roiLineChart.destroy(); roiLineChart = null; }

    if (values.length === 0) {
        canvas.style.display = 'none';
        if (emptyMsg) emptyMsg.style.display = 'flex';
        return;
    }
    canvas.style.display = 'block';
    if (emptyMsg) emptyMsg.style.display = 'none';

    const isPositive = finalPip >= 0;
    const lineColor = isPositive ? '#2ecc71' : '#e74c3c';

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 130);
    gradient.addColorStop(0, isPositive ? 'rgba(46,204,113,0.35)' : 'rgba(231,76,60,0.35)');
    gradient.addColorStop(1, isPositive ? 'rgba(46,204,113,0)' : 'rgba(231,76,60,0)');

    roiLineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: values,
                borderColor: lineColor,
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHitRadius: 12,
                pointHoverBackgroundColor: lineColor,
                pointHoverBorderColor: '#0f1620',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0f1620',
                    titleColor: '#8892a8',
                    bodyColor: '#e8edf5',
                    borderColor: '#1f2a38',
                    borderWidth: 1,
                    padding: 8,
                    callbacks: {
                        label: (c) => {
                            const pip = c.parsed.y;
                            return (pip >= 0 ? '+' : '') + pip.toFixed(1) + ' pip';
                        }
                    }
                }
            },
            scales: {
                x: { display: false },
                y: { display: false }
            }
        }
    });
}

// ===== فیلتەرەکانی ROI =====
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('#roiFilters button').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#roiFilters button').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentRoiPeriod = this.dataset.period;
            renderRoiLineChart();
        });
    });
});

// ===== یارمەتییەکان =====
function getOutcome(row) {
    if (row.result && row.result.toUpperCase() === 'TP_HIT') return 'WIN';
    if (row.result && (row.result.toUpperCase() === 'SL_HIT' || row.result.toUpperCase() === 'TRAILING_SL_HIT')) return 'LOSS';
    if (row.status && row.status.toUpperCase() === 'OPEN') return 'OPEN';
    if (row.closed_at) return 'BE';
    return 'OPEN';
}

function getProfit(row) {
    if (row.result_pips !== null && row.result_pips !== undefined && row.result_pips !== '') {
        return parseFloat(row.result_pips) || 0;
    }
    if (row.entry_min && row.current_sl) {
        const entry = parseFloat(row.entry_min);
        const sl = parseFloat(row.current_sl);
        if (!isNaN(entry) && !isNaN(sl)) {
            return row.direction === 'BUY' ? sl - entry : entry - sl;
        }
    }
    return null;
}

function formatDate(iso) {
    if (!iso) return '-';
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch { return iso.slice(0, 16); }
}

function formatProfit(val) {
    if (val === null || val === undefined) return '-';
    const num = parseFloat(val);
    if (isNaN(num)) return '-';
    return (num > 0 ? '+' : '') + num.toFixed(1);
}

// ===== ئامارە زیادەکان =====
function calculateExtraStats(data) {
    const closed = data.filter(r => r.closed_at);
    const wins = closed.filter(r => getOutcome(r) === 'WIN');
    const losses = closed.filter(r => getOutcome(r) === 'LOSS');

    const dayMap = {};
    data.forEach(r => {
        const date = r.closed_at ? r.closed_at.slice(0, 10) : r.created_at?.slice(0, 10);
        if (!date) return;
        const profit = getProfit(r);
        if (profit === null) return;
        if (!dayMap[date]) dayMap[date] = 0;
        dayMap[date] += profit;
    });

    let bestDay = null, worstDay = null;
    let bestProfit = -Infinity, worstProfit = Infinity;
    for (const [date, profit] of Object.entries(dayMap)) {
        if (profit > bestProfit) { bestProfit = profit; bestDay = date; }
        if (profit < worstProfit) { worstProfit = profit; worstDay = date; }
    }

    let totalProfit = 0, count = 0;
    data.forEach(r => {
        const p = getProfit(r);
        if (p !== null) { totalProfit += p; count++; }
    });
    const avgProfit = count > 0 ? totalProfit / count : 0;

    let maxProfit = 0;
    data.forEach(r => {
        const p = getProfit(r);
        if (p !== null && p > maxProfit) maxProfit = p;
    });

    $('bestDay').textContent = bestDay || '-';
    $('worstDay').textContent = worstDay || '-';
    $('avgProfit').textContent = avgProfit.toFixed(1);
    $('maxProfit').textContent = maxProfit.toFixed(1);
}

// ===== پیشاندانی ئامارەکان =====
function renderStats(data) {
    const total = data.length;
    const closed = data.filter(r => r.closed_at);
    const open = data.filter(r => !r.closed_at);
    const wins = closed.filter(r => getOutcome(r) === 'WIN');
    const losses = closed.filter(r => getOutcome(r) === 'LOSS');
    const decided = wins.length + losses.length;
    const winRate = decided > 0 ? (wins.length / decided * 100) : 0;

    let totalProfit = 0;
    data.forEach(r => {
        const p = getProfit(r);
        if (p !== null) totalProfit += p;
    });

    $('totalSignals').textContent = total;
    $('openSignals').textContent = open.length;
    $('closedSignals').textContent = closed.length;
    $('winCount').textContent = wins.length;
    $('lossCount').textContent = losses.length;
    $('winRate').textContent = winRate.toFixed(1) + '%';
    $('totalProfit').textContent = (totalProfit > 0 ? '+' : '') + totalProfit.toFixed(1);

    updateDoughnutChart(wins.length, losses.length);
    calculateExtraStats(data);
    updateProfitChart(data);
    updateROI();
}

// ===== چارتی دەورە =====
function updateDoughnutChart(wins, losses) {
    const ctx = document.getElementById('doughnutChart').getContext('2d');
    if (doughnutChart) { doughnutChart.destroy(); doughnutChart = null; }
    doughnutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['WIN', 'LOSS'],
            datasets: [{
                data: [wins, losses],
                backgroundColor: ['#2ecc71', '#e74c3c'],
                borderColor: ['#0f1620', '#0f1620'],
                borderWidth: 3,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#8892a8',
                        padding: 12,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: { size: 11 }
                    }
                }
            },
            cutout: '65%',
        }
    });
}

// ===== چارتی باری قازانج =====
function updateProfitChart(data) {
    const ctx = document.getElementById('profitChart').getContext('2d');

    let filtered = [...data];
    const now = new Date();
    if (currentTimeFilter === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        filtered = data.filter(r => {
            const date = new Date(r.closed_at || r.created_at);
            return date >= weekAgo;
        });
    } else if (currentTimeFilter === 'month') {
        const monthAgo = new Date(now);
        monthAgo.setMonth(now.getMonth() - 1);
        filtered = data.filter(r => {
            const date = new Date(r.closed_at || r.created_at);
            return date >= monthAgo;
        });
    } else if (currentTimeFilter === '3months') {
        const threeMonthsAgo = new Date(now);
        threeMonthsAgo.setMonth(now.getMonth() - 3);
        filtered = data.filter(r => {
            const date = new Date(r.closed_at || r.created_at);
            return date >= threeMonthsAgo;
        });
    }

    const map = {};
    filtered.forEach(row => {
        const date = row.closed_at ? row.closed_at.slice(0, 10) : row.created_at?.slice(0, 10);
        if (!date) return;
        const profit = getProfit(row);
        if (profit === null) return;
        if (!map[date]) map[date] = 0;
        map[date] += profit;
    });

    const sortedDates = Object.keys(map).sort();
    const values = sortedDates.map(d => map[d]);

    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    if (sortedDates.length === 0) return;

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedDates,
            datasets: [{
                label: 'Profit / Loss (pips)',
                data: values,
                backgroundColor: values.map(v => v >= 0 ? 'rgba(46,204,113,0.7)' : 'rgba(231,76,60,0.7)'),
                borderColor: values.map(v => v >= 0 ? '#2ecc71' : '#e74c3c'),
                borderWidth: 2,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#5a6a7e', font: { size: 10 } }
                }
            },
            scales: {
                y: {
                    grid: { color: '#1a2330' },
                    ticks: { color: '#5a6a7e', font: { size: 9 } }
                },
                x: {
                    grid: { color: '#1a2330' },
                    ticks: { color: '#5a6a7e', font: { size: 9 }, maxTicksLimit: 10 }
                }
            }
        }
    });
}

// ===== فیلتەرەکانی کات =====
function applyTimeFilter() {
    currentTimeFilter = $('timeFilter').value;
    applyFilters();
}

function resetTimeFilter() {
    $('timeFilter').value = 'all';
    currentTimeFilter = 'all';
    applyFilters();
}

// ===== پڕکردنی خشتە =====
function renderTable(data) {
    const tbody = $('tableBody');
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:#5a6a7e;font-size:13px;">
            <i class="fas fa-inbox" style="font-size:20px;display:block;margin-bottom:6px;"></i>
            No signals found
        </td></tr>`;
        return;
    }

    let html = '';
    data.slice(0, 50).forEach(row => {
        const outcome = getOutcome(row);
        const profit = getProfit(row);

        let outcomeBadge = '';
        if (outcome === 'WIN') outcomeBadge = `<span class="badge-outcome-win">WIN</span>`;
        else if (outcome === 'LOSS') outcomeBadge = `<span class="badge-outcome-loss">LOSS</span>`;
        else if (outcome === 'BE') outcomeBadge = `<span class="badge-outcome-be">BE</span>`;
        else outcomeBadge = `<span class="badge-outcome-open">OPEN</span>`;

        const dirBadge = row.direction === 'BUY' ?
            `<span class="badge-direction badge-buy">BUY</span>` :
            `<span class="badge-direction badge-sell">SELL</span>`;

        const profitClass = (profit !== null && profit > 0) ? 'profit-positive' :
            (profit !== null && profit < 0) ? 'profit-negative' : 'text-muted';

        const entry = row.entry_min ?? '-';
        const sl = row.stop_loss ?? '-';
        let tp1 = '-', tp2 = '-';
        if (row.take_profits) {
            try {
                const tps = JSON.parse(row.take_profits);
                if (Array.isArray(tps) && tps.length >= 1) tp1 = tps[0];
                if (Array.isArray(tps) && tps.length >= 2) tp2 = tps[1];
            } catch (e) { /* دەستپێنەکە */ }
        }

        html += `<tr>
            <td><strong>${row.id || '-'}</strong></td>
            <td>${row.symbol || 'XAUUSD'}</td>
            <td>${dirBadge}</td>
            <td>${entry}</td>
            <td>${sl}</td>
            <td>${tp1}</td>
            <td>${tp2}</td>
            <td>${outcomeBadge}</td>
            <td class="${profitClass}">${formatProfit(profit)}</td>
            <td>${formatDate(row.closed_at || row.created_at)}</td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

// ===== فیلتەری گشتی =====
function getFilteredData() {
    const dir = $('filterDirection').value;
    const out = $('filterOutcome').value;
    const search = $('searchInput').value.toLowerCase().trim();

    let filtered = allData;

    if (currentTable === 'closed') {
        filtered = filtered.filter(r => r.closed_at !== null && r.closed_at !== undefined && r.closed_at !== '');
    } else if (currentTable === 'open') {
        filtered = filtered.filter(r => r.closed_at === null || r.closed_at === undefined || r.closed_at === '');
    }

    filtered = filtered.filter(row => {
        if (dir !== 'all' && row.direction !== dir) return false;
        if (out !== 'all') {
            const rowOut = getOutcome(row);
            if (out === 'OPEN' && rowOut !== 'OPEN') return false;
            if (out !== 'OPEN' && rowOut !== out) return false;
        }
        if (search) {
            const fields = [row.id, row.symbol, row.entry_min, row.stop_loss, row.take_profits, row.direction, row.result]
                .filter(Boolean).map(String);
            if (!fields.some(f => f.toLowerCase().includes(search))) return false;
        }
        return true;
    });

    return filtered;
}

function applyFilters() {
    const filtered = getFilteredData();
    renderStats(filtered);
    renderTable(filtered);
    $('lastUpdate').textContent = `Updated: ${new Date().toLocaleString()}`;
}

// ===== دەستپێکردن =====
async function init() {
    $('lastUpdate').textContent = 'Loading...';

    $('filterDirection').addEventListener('change', applyFilters);
    $('filterOutcome').addEventListener('change', applyFilters);
    $('searchInput').addEventListener('input', applyFilters);

    allData = await fetchSignals();
    console.log('📊 داتا ئامادەیە بۆ پیشاندان:', allData.length, 'ڕیکۆرد');
    applyFilters();
    updateROI();

    setInterval(async () => {
        const newData = await fetchSignals();
        if (newData.length !== allData.length) {
            allData = newData;
            applyFilters();
            updateROI();
        }
    }, 30000);
}

document.addEventListener('DOMContentLoaded', init);


let customStartDate=null;
let customEndDate=null;
function applyCustomDate(){
 customStartDate=document.getElementById('startDate').value;
 customEndDate=document.getElementById('endDate').value;
 document.getElementById('customDateModal').style.display='none';
 if(typeof renderDashboard==='function'){renderDashboard();}
}
