// === SHZG Schoolprofiel Dashboard — Basislaag ===

const DATA_BASE = './data/';
const SCHOOL_YEARS = ['21-22', '22-23', '23-24', '24-25'];

const CSV_FILES = {
    adressen: 'adressen.csv',
    panel: 'panel.csv',
    examenresultaten: 'examenresultaten_vak.csv',
    geslaagden: 'geslaagden_gezakten.csv',
    tevredenheid: 'tevredenheid.csv',
    herkomst: 'herkomst_cbs.csv',
    leefbaarometer: 'leefbaarometer.csv',
    functiemix: 'functiemix.csv',
    financieel: 'financieel.csv',
    verzuim: 'verzuim.csv',
    zittenblijvers: 'zittenblijvers.csv',
    vakkenkeuze: 'vakkenkeuze.csv',
    inspectie_resultaten: 'inspectie_resultaten.csv',
    inspectie_oordelen: 'inspectie_oordelen.csv',
    vervolgopleidingen: 'vervolgopleidingen.csv',
    vervolgopleidingen_detail: 'vervolgopleidingen_detail.csv',
    aantal_leerlingen: 'aantal_leerlingen.csv',
    va_school: 'va_school.csv',
    va_vakgroep: 'va_vakgroep.csv',
};

const COLORS = {
    primary: 'rgba(26, 82, 118, 0.85)',
    primaryBg: 'rgba(26, 82, 118, 0.12)',
    accent: 'rgba(230, 126, 34, 0.85)',
    accentBg: 'rgba(230, 126, 34, 0.12)',
    success: 'rgba(39, 174, 96, 0.85)',
    red: 'rgba(231, 76, 60, 0.85)',
    grey: 'rgba(127, 140, 141, 0.5)',
    blue: '#2980b9',
    palette: ['#1a5276','#2980b9','#27ae60','#e67e22','#e74c3c','#8e44ad','#16a085','#d35400'],
};

// ===================== STATE =====================
let data = {};              // parsed CSV data
let schoolList = [];        // [{tSchool, name, city}]
let panelIndex = {};        // tSchool -> {year -> row}
let selectedSchool = null;
let selectedYear = SCHOOL_YEARS[SCHOOL_YEARS.length - 1]; // altijd laatste jaar
let charts = {};

// ===================== INITIALIZATION =====================
document.addEventListener('DOMContentLoaded', init);

async function init() {
    try {
        await loadAllData();
        buildSchoolSelector();
        setupEventListeners();
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('layout').classList.remove('hidden');
        // Check URL hash or auto-select first school
        const hash = parseHash();
        if (hash.school) {
            const match = schoolList.find(s => s.tSchool.includes(hash.school));
            if (match) {
                document.getElementById('school-select').value = match.tSchool;
                selectedSchool = match.tSchool;
            }
        }
        if (!selectedSchool && schoolList.length) {
            selectedSchool = schoolList[0].tSchool;
        }
        renderDashboard();
    } catch (e) {
        document.getElementById('loading').innerHTML =
            '<p style="color:#e74c3c">Fout bij laden: ' + e.message + '</p>';
        console.error(e);
    }
}

// ===================== DATA LOADING =====================
async function loadAllData() {
    const entries = Object.entries(CSV_FILES);
    const results = await Promise.all(entries.map(async ([key, file]) => {
        const resp = await fetch(DATA_BASE + file);
        const text = await resp.text();
        return [key, parseCSV(text)];
    }));
    results.forEach(([key, rows]) => { data[key] = rows; });
    buildSchoolList();
    buildPanelIndex();
}

// ===================== CSV PARSING =====================
function parseCSV(text, delimiter = ';') {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = splitCSVLine(lines[0], delimiter);
    return lines.slice(1).map(line => {
        const vals = splitCSVLine(line, delimiter);
        const obj = {};
        headers.forEach((h, i) => { obj[h.trim()] = (vals[i] || '').trim(); });
        return obj;
    });
}

function splitCSVLine(line, delimiter) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
            else { inQuotes = !inQuotes; }
        } else if (ch === delimiter && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

function num(val) {
    if (val === null || val === undefined || val === '') return null;
    const s = String(val).replace(',', '.').replace(/\s/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
}

function pct(val) {
    const n = num(val);
    return n !== null ? n : null;
}

function scaleGrade(val) {
    const n = num(val);
    if (n === null) return null;
    return Math.abs(n) > 100 ? n / 1000000 : n;
}

// ===================== DATA LOOKUPS =====================
function buildSchoolList() {
    schoolList = data.adressen.map(r => ({
        tSchool: r.tSchool,
        code: r.code,
        name: r.Schoolnaam,
        city: r.Woonplaats,
        address: r.Adres,
        postcode: r.Postcode,
        phone: r.Telefoon,
        email: r['E-mail adres'],
        web: r.Homepage,
    })).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

function buildPanelIndex() {
    panelIndex = {};
    data.panel.forEach(r => {
        if (!panelIndex[r.tSchool]) panelIndex[r.tSchool] = {};
        panelIndex[r.tSchool][r.Schooljaar] = r;
    });
}

function getPanelRow(tSchool, year) {
    return panelIndex[tSchool]?.[year] || null;
}

function getAllYears(tSchool) {
    return SCHOOL_YEARS.map(y => ({ year: y, ...(panelIndex[tSchool]?.[y] || {}) }));
}

function getDistribution(field, year) {
    const vals = [];
    schoolList.forEach(s => {
        const row = getPanelRow(s.tSchool, year);
        if (row) {
            const v = num(row[field]);
            if (v !== null) vals.push({ tSchool: s.tSchool, value: v });
        }
    });
    vals.sort((a, b) => a.value - b.value);
    const values = vals.map(v => v.value);
    const min = values.length ? values[0] : 0;
    const max = values.length ? values[values.length - 1] : 1;
    const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    return { vals, values, min, max, avg, n: values.length };
}

function getRank(tSchool, field, year, higherIsBetter = true) {
    const dist = getDistribution(field, year);
    const idx = dist.vals.findIndex(v => v.tSchool === tSchool);
    if (idx === -1) return { rank: null, of: dist.n, value: null };
    // rank 1 = best
    const rank = higherIsBetter ? dist.n - idx : idx + 1;
    return { rank, of: dist.n, value: dist.vals[idx].value };
}

function schoolDisplayName(tSchool) {
    const s = schoolList.find(s => s.tSchool === tSchool);
    return s ? s.name : tSchool;
}

// ===================== EVENT LISTENERS =====================
function setupEventListeners() {
    document.getElementById('school-select').addEventListener('change', e => {
        selectedSchool = e.target.value;
        updateHash();
        renderDashboard();
    });

    // Scroll spy
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => { updateScrollSpy(); ticking = false; });
            ticking = true;
        }
    });
}

function buildSchoolSelector() {
    const sel = document.getElementById('school-select');
    sel.innerHTML = schoolList.map(s =>
        `<option value="${s.tSchool}">${s.name} — ${s.city}</option>`
    ).join('');
}

function parseHash() {
    const h = location.hash.replace('#', '');
    const params = {};
    h.split('&').forEach(p => {
        const [k, v] = p.split('=');
        if (k && v) params[k] = decodeURIComponent(v);
    });
    return params;
}

function updateHash() {
    const code = selectedSchool ? selectedSchool.match(/\d{2}\w{2}/)?.[0] || '' : '';
    location.hash = `school=${code}`;
}

function updateScrollSpy() {
    const sections = document.querySelectorAll('.dashboard-section');
    const navLinks = document.querySelectorAll('#section-nav a');
    let current = '';
    sections.forEach(sec => {
        const rect = sec.getBoundingClientRect();
        if (rect.top <= 120) current = sec.id;
    });
    navLinks.forEach(a => {
        a.classList.toggle('active', a.dataset.section === current);
    });
}

// ===================== CHART MANAGEMENT =====================
function destroyCharts() {
    Object.values(charts).forEach(c => { if (c && c.destroy) c.destroy(); });
    charts = {};
}

function createLineChart(canvasId, labels, datasets, opts = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    const c = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: datasets.length > 1, position: 'top',
                    labels: { font: { size: 11 }, boxWidth: 12 } },
            },
            scales: {
                y: {
                    beginAtZero: opts.beginAtZero || false,
                    ticks: { font: { size: 11 } },
                    title: opts.yTitle ? { display: true, text: opts.yTitle, font: { size: 11 } } : {},
                },
                x: { ticks: { font: { size: 11 } } },
            },
        },
    });
    charts[canvasId] = c;
    return c;
}

function createBarChart(canvasId, labels, datasets, opts = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    const c = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: opts.horizontal ? 'y' : 'x',
            plugins: {
                legend: { display: datasets.length > 1, position: 'top',
                    labels: { font: { size: 11 }, boxWidth: 12 } },
            },
            scales: {
                y: {
                    beginAtZero: opts.beginAtZero !== false,
                    ticks: { font: { size: 11 } },
                    title: opts.yTitle ? { display: true, text: opts.yTitle, font: { size: 11 } } : {},
                },
                x: {
                    ticks: { font: { size: 11 } },
                    ...(opts.stacked ? { stacked: true } : {}),
                },
                ...(opts.stacked ? { y: { stacked: true, ticks: { font: { size: 11 } } } } : {}),
            },
        },
    });
    charts[canvasId] = c;
    return c;
}

function createDoughnutChart(canvasId, labels, values, colors) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    const c = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data: values, backgroundColor: colors, borderWidth: 1, borderColor: '#fff' }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } },
            },
        },
    });
    charts[canvasId] = c;
    return c;
}

// ===================== UI COMPONENTS =====================
function renderKPI(containerId, items) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = items.map(item => {
        const val = item.value !== null && item.value !== undefined ? item.value : '—';
        let trendHtml = '';
        if (item.trend !== undefined && item.trend !== null) {
            const dir = item.trend > 0 ? 'up' : item.trend < 0 ? 'down' : 'neutral';
            const arrow = item.trend > 0 ? '\u2191' : item.trend < 0 ? '\u2193' : '\u2192';
            const inv = item.invertTrend;
            const cls = inv ? (dir === 'up' ? 'down' : dir === 'down' ? 'up' : 'neutral') : dir;
            trendHtml = `<span class="trend ${cls}">${arrow}</span>`;
        }
        return `<div class="kpi-card">
            <div class="kpi-value">${val}${trendHtml}</div>
            <div class="kpi-label">${item.label}</div>
        </div>`;
    }).join('');
}

function renderDistributionStrips(containerId, items) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '<div class="strip-container">' + items.map(item => {
        if (item.value === null || item.value === undefined) return '';
        const dist = item.dist;
        if (!dist || dist.n < 3) return '';
        // Center average at 50% so all avg lines are vertically aligned
        const halfRange = Math.max(dist.avg - dist.min, dist.max - dist.avg) || 1;
        const pos = Math.max(0, Math.min(100, 50 + ((item.value - dist.avg) / (2 * halfRange)) * 100));
        const avgPos = 50;
        const hib = item.higherIsBetter !== false;
        const diff = item.value - dist.avg;
        const range = dist.max - dist.min || 1;
        const cls = item.neutral ? 'near'
                  : hib ? (diff > 0 ? 'above' : diff < -range * 0.05 ? 'below' : 'near')
                        : (diff < 0 ? 'above' : diff > range * 0.05 ? 'below' : 'near');
        // Rank
        const sorted = [...dist.values].sort((a, b) => a - b);
        const idx = sorted.indexOf(item.value);
        const rank = hib ? dist.n - idx : idx + 1;
        const rankText = rank + 'e/' + dist.n;
        return `<div class="distribution-strip">
            <span class="strip-label" title="${item.label}">${item.label}</span>
            <div class="strip-bar-wrapper">
                <div class="strip-bar">
                    <div class="strip-avg-line" style="left:${avgPos}%"></div>
                    <div class="strip-marker ${cls}" style="left:calc(${pos}% - 5px)"></div>
                </div>
            </div>
            <span class="strip-value">${item.fmt || formatNum(item.value, item.decimals)}</span>
            <span class="strip-rank">${rankText}</span>
        </div>`;
    }).join('') + '</div>';
}

function formatNum(val, dec = 1) {
    if (val === null || val === undefined) return '—';
    return Number(val).toFixed(dec).replace('.', ',');
}

function formatPct(val, dec = 1) {
    if (val === null || val === undefined) return '—';
    return Number(val).toFixed(dec).replace('.', ',') + '%';
}

function noData(containerId, msg = 'Geen data beschikbaar') {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `<div class="no-data">${msg}</div>`;
}

// ===================== RENDER ORCHESTRATOR =====================
function renderDashboard() {
    if (!selectedSchool) return;
    destroyCharts();
    renderProfiel();
    renderExamens();
    renderLeerlingen();
    renderTevredenheid();
    renderVervolg();
    renderContext();
    renderPersoneel();
    renderInspectie();
    renderBenchmark();
    renderKaart();
}

// ===================== SECTION 1: SCHOOLPROFIEL =====================
function renderProfiel() {
    const info = schoolList.find(s => s.tSchool === selectedSchool);
    const row = getPanelRow(selectedSchool, selectedYear);
    const prevRow = getPanelRow(selectedSchool, prevYear(selectedYear));
    const el = document.getElementById('school-info');

    if (!info) { el.innerHTML = '<div class="no-data">School niet gevonden</div>'; return; }

    // Determine type
    let type = 'gymnasium';
    let typeTag = '<span class="tag gymnasium">Gymnasium</span>';
    if (row) {
        const pctAth = num(row.pct_atheneum);
        const gem = num(row.gemengd);
        if (gem === 1) { type = 'gemengd'; typeTag = '<span class="tag gemengd">Gemengd</span>'; }
        else if (pctAth && pctAth > 50) { type = 'atheneum'; typeTag = '<span class="tag atheneum">Atheneum</span>'; }
    }
    const eenpitter = row && num(row.eenpitter) === 1;
    const eenTag = eenpitter ? ' <span class="tag eenpitter">Eenpitter</span>' : '';

    // Extract BRIN from code
    const brinMatch = info.code ? info.code.match(/(\d{4}-\d{2}\w{2})/) : null;
    const brin = brinMatch ? brinMatch[1] : info.code || '';

    el.innerHTML = `
        <div class="info-item"><span class="info-label">Schoolnaam</span><span class="info-value">${info.name}</span></div>
        <div class="info-item"><span class="info-label">Type</span><span class="info-value">${typeTag}${eenTag}</span></div>
        <div class="info-item"><span class="info-label">Adres</span><span class="info-value">${info.address}, ${info.postcode} ${info.city}</span></div>
        <div class="info-item"><span class="info-label">BRIN</span><span class="info-value">${brin}</span></div>
        <div class="info-item"><span class="info-label">Telefoon</span><span class="info-value">${info.phone || '—'}</span></div>
        <div class="info-item"><span class="info-label">E-mail</span><span class="info-value">${info.email || '—'}</span></div>
        <div class="info-item"><span class="info-label">Website</span><span class="info-value">${info.web ? '<a href="' + info.web + '" target="_blank">' + info.web.replace(/^https?:\/\//, '') + '</a>' : '—'}</span></div>
    `;

    // KPIs
    const leerlingen = row ? num(row.leerlingen_totaal) : null;
    const groei = row ? num(row.leerlingen_groei_pct) : null;
    const prevLl = prevRow ? num(prevRow.leerlingen_totaal) : null;

    renderKPI('profiel-kpis', [
        { value: leerlingen !== null ? Math.round(leerlingen) : '—', label: 'Leerlingen', trend: groei },
        { value: groei !== null ? formatPct(groei) : '—', label: 'Groei t.o.v. vorig jaar' },
        { value: row ? (num(row.examenkandidaten) || '—') : '—', label: 'Examenkandidaten' },
    ]);
}

// ===================== SECTION 2: EXAMENS =====================
function renderExamens() {
    const row = getPanelRow(selectedSchool, selectedYear);
    const prevRow = getPanelRow(selectedSchool, prevYear(selectedYear));

    // KPIs
    const ce = row ? num(row.ce_gem) : null;
    const slaag = row ? num(row.slaagpct) : null;
    const sece = row ? num(row.se_ce_verschil) : null;
    const prevCe = prevRow ? num(prevRow.ce_gem) : null;
    const prevSlaag = prevRow ? num(prevRow.slaagpct) : null;

    renderKPI('examens-kpis', [
        { value: ce !== null ? formatNum(ce, 2) : '—', label: 'CE gemiddeld', trend: ce && prevCe ? ce - prevCe : null },
        { value: slaag !== null ? formatPct(slaag) : '—', label: 'Slagingspercentage', trend: slaag && prevSlaag ? slaag - prevSlaag : null },
        { value: sece !== null ? formatNum(sece, 2) : '—', label: 'SE-CE verschil', invertTrend: true },
    ]);

    // CE trend chart
    const years = getAllYears(selectedSchool);
    const ceVals = years.map(y => num(y.ce_gem));
    const slaagVals = years.map(y => num(y.slaagpct));

    // SHZG averages per year
    const avgCe = SCHOOL_YEARS.map(y => {
        const d = getDistribution('ce_gem', y);
        return d.n > 0 ? d.avg : null;
    });
    const avgSlaag = SCHOOL_YEARS.map(y => {
        const d = getDistribution('slaagpct', y);
        return d.n > 0 ? d.avg : null;
    });

    createLineChart('chart-ce-trend', SCHOOL_YEARS, [
        { label: schoolDisplayName(selectedSchool), data: ceVals, borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg, tension: 0.3, pointRadius: 4 },
        { label: 'SHZG gemiddeld', data: avgCe, borderColor: COLORS.grey, borderDash: [5, 3], backgroundColor: 'transparent', tension: 0.3, pointRadius: 2 },
    ], { yTitle: 'CE gemiddeld' });

    createLineChart('chart-slaag-trend', SCHOOL_YEARS, [
        { label: schoolDisplayName(selectedSchool), data: slaagVals, borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg, tension: 0.3, pointRadius: 4 },
        { label: 'SHZG gemiddeld', data: avgSlaag, borderColor: COLORS.grey, borderDash: [5, 3], backgroundColor: 'transparent', tension: 0.3, pointRadius: 2 },
    ], { yTitle: '%', beginAtZero: false });

    // Per-vak table with year picker
    vakTableYear = selectedYear;
    buildVakYearPicker();
    renderVakTable();

    // Distribution strips
    if (row) {
        const ceDist = getDistribution('ce_gem', selectedYear);
        const slaagDist = getDistribution('slaagpct', selectedYear);
        const seceDist = getDistribution('se_ce_verschil', selectedYear);
        renderDistributionStrips('examens-strips', [
            { label: 'CE gemiddeld', value: ce, dist: ceDist, higherIsBetter: true, decimals: 2 },
            { label: 'Slagingspercentage', value: slaag, dist: slaagDist, higherIsBetter: true, fmt: formatPct(slaag) },
            { label: 'SE-CE verschil', value: sece, dist: seceDist, higherIsBetter: false, decimals: 2 },
        ]);
    } else {
        noData('examens-strips');
    }
}

let vakTableYear = null; // tracks selected year for vak table

function buildVakYearPicker() {
    const picker = document.getElementById('vak-year-picker');
    if (!picker) return;
    if (!vakTableYear) vakTableYear = selectedYear;
    picker.innerHTML = SCHOOL_YEARS.map(y =>
        `<button class="yr-btn${y === vakTableYear ? ' active' : ''}" data-year="${y}">${y}</button>`
    ).join('');
    picker.querySelectorAll('.yr-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            vakTableYear = btn.dataset.year;
            picker.querySelectorAll('.yr-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderVakTable();
        });
    });
}

function renderVakTable() {
    const container = document.getElementById('vak-table-container');
    const year = vakTableYear || selectedYear;
    // Filter exam data for this school + year + Type data == School
    const rows = data.examenresultaten.filter(r =>
        r.tSchool === selectedSchool &&
        r.Schooljaar === year &&
        r['Type data'] === 'School'
    );

    if (rows.length === 0) {
        container.innerHTML = '<div class="no-data">Geen vakgegevens voor ' + year + '</div>';
        return;
    }

    // Sort: Totaal first, then alphabetical
    rows.sort((a, b) => {
        if (a['Vak omschrijving'] === 'Totaal') return -1;
        if (b['Vak omschrijving'] === 'Totaal') return 1;
        return a['Vak omschrijving'].localeCompare(b['Vak omschrijving'], 'nl');
    });

    let html = `<table class="data-table">
        <thead><tr>
            <th>Vak</th>
            <th class="num">N</th>
            <th class="num">CE</th>
            <th class="num">SE</th>
            <th class="num">SE-CE</th>
            <th class="num">Perc. CE</th>
        </tr></thead><tbody>`;

    rows.forEach(r => {
        const isTotal = r['Vak omschrijving'] === 'Totaal';
        const ce = scaleGrade(r.tCentraal_examen || r['tCentraal examen']);
        const se = scaleGrade(r.tSchoolexamen || r['tSchoolexamen']);
        const sece = scaleGrade(r.tVerschilSeCe || r['tVerschilSeCe']);
        const percCe = num(r['Percentiel ce']);
        html += `<tr class="${isTotal ? 'total-row' : ''}">
            <td>${r['Vak omschrijving']}</td>
            <td class="num">${r['Aantal vak deelnemers'] || '—'}</td>
            <td class="num">${ce !== null ? formatNum(ce, 2) : '—'}</td>
            <td class="num">${se !== null ? formatNum(se, 2) : '—'}</td>
            <td class="num">${sece !== null ? formatNum(sece, 2) : '—'}</td>
            <td class="num">${percCe !== null ? Math.round(percCe) : '—'}</td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// ===================== SECTION 3: LEERLINGEN =====================
function renderLeerlingen() {
    const row = getPanelRow(selectedSchool, selectedYear);
    const prevRow = getPanelRow(selectedSchool, prevYear(selectedYear));

    const ll = row ? num(row.leerlingen_totaal) : null;
    const zb = row ? num(row.pct_zittenblijvers) : null;
    const af = row ? num(row.pct_afstromers) : null;
    const prevZb = prevRow ? num(prevRow.pct_zittenblijvers) : null;

    renderKPI('leerlingen-kpis', [
        { value: ll !== null ? Math.round(ll) : '—', label: 'Totaal leerlingen' },
        { value: zb !== null ? formatPct(zb) : '—', label: 'Zittenblijvers', trend: zb && prevZb ? zb - prevZb : null, invertTrend: true },
        { value: af !== null ? formatPct(af) : '—', label: 'Afstroom' },
    ]);

    // Trend chart
    const years = getAllYears(selectedSchool);
    const llVals = years.map(y => num(y.leerlingen_totaal));
    const avgLl = SCHOOL_YEARS.map(y => {
        const d = getDistribution('leerlingen_totaal', y);
        return d.n > 0 ? d.avg : null;
    });

    createLineChart('chart-leerlingen-trend', SCHOOL_YEARS, [
        { label: schoolDisplayName(selectedSchool), data: llVals, borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg, tension: 0.3, pointRadius: 4 },
        { label: 'SHZG gemiddeld', data: avgLl, borderColor: COLORS.grey, borderDash: [5, 3], backgroundColor: 'transparent', tension: 0.3, pointRadius: 2 },
    ], { yTitle: 'Leerlingen', beginAtZero: false });

    // Klassieke talen chart
    const grVals = years.map(y => num(y.n_deelnemers_grieks));
    const laVals = years.map(y => num(y.n_deelnemers_latijn));
    createBarChart('chart-klassiek', SCHOOL_YEARS, [
        { label: 'Grieks', data: grVals, backgroundColor: COLORS.primary },
        { label: 'Latijn', data: laVals, backgroundColor: COLORS.accent },
    ], { yTitle: 'Deelnemers' });

    // Distribution strips
    if (row) {
        renderDistributionStrips('leerlingen-strips', [
            { label: 'Leerlingen totaal', value: ll, dist: getDistribution('leerlingen_totaal', selectedYear), decimals: 0 },
            { label: 'Zittenblijvers %', value: zb, dist: getDistribution('pct_zittenblijvers', selectedYear), higherIsBetter: false, fmt: formatPct(zb) },
            { label: 'Afstroom %', value: af, dist: getDistribution('pct_afstromers', selectedYear), higherIsBetter: false, fmt: formatPct(af) },
        ]);
    } else {
        noData('leerlingen-strips');
    }
}

// ===================== SECTION 4: TEVREDENHEID =====================
function renderTevredenheid() {
    // Get tevredenheid data for this school & year
    const tRow = data.tevredenheid.find(r =>
        r.tSchool === selectedSchool &&
        r.Schooljaar === selectedYear &&
        r['Type data'] === 'School'
    );
    const panelRow = getPanelRow(selectedSchool, selectedYear);
    const prevPanel = getPanelRow(selectedSchool, prevYear(selectedYear));

    const tevLl = tRow ? num(tRow['Tevredenheid leerlingen']) : (panelRow ? num(panelRow.tevredenheid_ll) : null);
    const tevOu = tRow ? num(tRow['Tevredenheid ouders']) : (panelRow ? num(panelRow.tevredenheid_ouders) : null);
    const prevTevLl = prevPanel ? num(prevPanel.tevredenheid_ll) : null;

    renderKPI('tevredenheid-kpis', [
        { value: tevLl !== null ? formatNum(tevLl, 1) : '—', label: 'Leerlingtevredenheid', trend: tevLl && prevTevLl ? tevLl - prevTevLl : null },
        { value: tevOu !== null ? formatNum(tevOu, 1) : '—', label: 'Oudertevredenheid' },
    ]);

    // School vs benchmark bar chart
    if (tRow) {
        const metrics = [
            { label: 'Tevredenheid ll', school: num(tRow['Tevredenheid leerlingen']), bench: num(tRow['Benchmark tevredenheid leerlingen']) },
            { label: 'Sfeer', school: num(tRow.Sfeer), bench: num(tRow['Benchmark sfeer']) },
            { label: 'Veiligheid', school: num(tRow.Veiligheid), bench: num(tRow['Benchmark veiligheid']) },
            { label: 'Tevredenheid ouders', school: num(tRow['Tevredenheid ouders']), bench: num(tRow['Benchmark tevredenheid ouders']) },
        ].filter(m => m.school !== null);

        createBarChart('chart-tevr-vergelijk',
            metrics.map(m => m.label),
            [
                { label: 'School', data: metrics.map(m => m.school), backgroundColor: COLORS.primary },
                { label: 'Benchmark', data: metrics.map(m => m.bench), backgroundColor: COLORS.grey },
            ],
            { yTitle: 'Rapportcijfer' }
        );
    } else {
        noData('chart-tevr-vergelijk', 'Geen tevredenheidsdata voor dit jaar');
    }

    // Trend chart
    const tRows = data.tevredenheid.filter(r =>
        r.tSchool === selectedSchool && r['Type data'] === 'School'
    );
    if (tRows.length > 0) {
        const tYears = tRows.map(r => r.Schooljaar).sort();
        const tevLlTrend = tYears.map(y => {
            const r = tRows.find(t => t.Schooljaar === y);
            return r ? num(r['Tevredenheid leerlingen']) : null;
        });
        const tevOuTrend = tYears.map(y => {
            const r = tRows.find(t => t.Schooljaar === y);
            return r ? num(r['Tevredenheid ouders']) : null;
        });

        createLineChart('chart-tevr-trend', tYears, [
            { label: 'Leerlingen', data: tevLlTrend, borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg, tension: 0.3, pointRadius: 4 },
            { label: 'Ouders', data: tevOuTrend, borderColor: COLORS.accent, backgroundColor: COLORS.accentBg, tension: 0.3, pointRadius: 4 },
        ], { yTitle: 'Rapportcijfer' });
    }

    // Distribution strips
    if (panelRow) {
        renderDistributionStrips('tevredenheid-strips', [
            { label: 'Tevredenheid ll', value: tevLl, dist: getDistribution('tevredenheid_ll', selectedYear), decimals: 1 },
            { label: 'Tevredenheid ouders', value: tevOu, dist: getDistribution('tevredenheid_ouders', selectedYear), decimals: 1 },
        ].filter(s => s.value !== null));
    } else {
        noData('tevredenheid-strips');
    }
}

// ===================== SECTION 5: DOORSTROOM =====================
function renderVervolg() {
    const row = getPanelRow(selectedSchool, selectedYear);
    // Also check vervolgopleidingen for the matching year
    // Vervolgopleidingen uses calendar year (Jaar), panel uses schooljaar
    const calYear = '20' + selectedYear.split('-')[1]; // "24-25" -> "2025"
    const vRow = data.vervolgopleidingen.find(r =>
        r.tSchool === selectedSchool && r['Type data'] === 'School' && r.Jaar === calYear
    );
    // Fallback to previous year
    const prevCalYear = String(parseInt(calYear) - 1);
    const vRowFallback = vRow || data.vervolgopleidingen.find(r =>
        r.tSchool === selectedSchool && r['Type data'] === 'School' && r.Jaar === prevCalYear
    );

    const pctWo = row ? num(row.pct_wo) : (vRowFallback ? num(vRowFallback['Pct WO']) : null);
    const pctHbo = row ? num(row.pct_hbo) : null;

    renderKPI('vervolg-kpis', [
        { value: pctWo !== null ? formatPct(pctWo) : '—', label: '% naar WO' },
        { value: pctHbo !== null ? formatPct(pctHbo) : '—', label: '% naar HBO' },
    ]);

    // Doughnut chart
    if (vRowFallback) {
        const wo = num(vRowFallback['Naar WO']) || 0;
        const hbo = num(vRowFallback['Naar HBO']) || 0;
        const mbo = num(vRowFallback['Naar MBO']) || 0;
        const vavo = num(vRowFallback['Naar VAVO']) || 0;
        const geen = num(vRowFallback['Geen bekostigd onderwijs']) || 0;
        const total = wo + hbo + mbo + vavo + geen;
        if (total > 0) {
            createDoughnutChart('chart-vervolg-doughnut',
                ['WO', 'HBO', 'MBO', 'VAVO', 'Geen bekostigd'],
                [wo, hbo, mbo, vavo, geen],
                [COLORS.palette[0], COLORS.palette[1], COLORS.palette[2], COLORS.palette[3], COLORS.palette[4]]
            );
        }
    } else {
        noData('chart-vervolg-doughnut', 'Geen doorstroomdata');
    }

    // Distribution strips
    if (row && pctWo !== null) {
        renderDistributionStrips('vervolg-strips', [
            { label: '% naar WO', value: pctWo, dist: getDistribution('pct_wo', selectedYear), fmt: formatPct(pctWo) },
            { label: '% geen bekostigd', value: num(row.pct_geen_bekostigd), dist: getDistribution('pct_geen_bekostigd', selectedYear), higherIsBetter: false, fmt: formatPct(num(row.pct_geen_bekostigd)) },
        ].filter(s => s.value !== null));
    } else {
        noData('vervolg-strips');
    }
}

// ===================== SECTION 6: CONTEXT =====================
function renderContext() {
    const row = getPanelRow(selectedSchool, selectedYear);
    const cbsRow = data.herkomst.find(r =>
        r.tSchool === selectedSchool && r['Type data'] === 'School'
    );

    const ses = cbsRow ? num(cbsRow['SES-WOA totaalscore']) : (row ? num(row.ses_woa) : null);
    const sted = cbsRow ? num(cbsRow.Stedelijkheid) : (row ? num(row.stedelijkheid) : null);

    renderKPI('context-kpis', [
        { value: ses !== null ? formatNum(ses, 2) : '—', label: 'SES-WOA score' },
        { value: sted !== null ? formatNum(sted, 1) : '—', label: 'Stedelijkheid' },
    ]);

    // Leefbaarometer chart — only show deviation dimensions (exclude absolute score)
    const leefRow = data.leefbaarometer.find(r =>
        r.tSchool === selectedSchool && r['Type data'] === 'School'
    );
    if (leefRow) {
        const skipFields = ['Type data', 'tSchool', '', 'Leefbaarheidsscore'];
        const metrics = [];
        const fields = Object.keys(leefRow).filter(k =>
            !skipFields.includes(k) && leefRow[k] !== ''
        );
        fields.forEach(f => {
            const v = num(leefRow[f]);
            if (v !== null) metrics.push({ label: f, value: v });
        });
        if (metrics.length > 0) {
            createBarChart('chart-leefbaar',
                metrics.map(m => m.label),
                [{ label: 'Afwijking', data: metrics.map(m => m.value), backgroundColor: metrics.map(m => m.value >= 0 ? COLORS.success : COLORS.red) }],
                { yTitle: 'Afwijking t.o.v. landelijk gemiddelde' }
            );
        }
    } else {
        noData('chart-leefbaar', 'Geen leefbaarometer data');
    }

    // Distribution strips for CBS data
    if (row) {
        const cbsMetrics = [
            { label: 'SES-WOA', field: 'ses_woa' },
            { label: 'Inkomen percentiel', field: 'inkomen_gem_pctgrp' },
            { label: '% inkomen P80-100', field: 'pct_inkomen_p80_100' },
            { label: 'Vermogen percentiel', field: 'vermogen_gem_pctgrp' },
            { label: '% koopwoning', field: 'pct_koopwoning' },
            { label: 'Stedelijkheid', field: 'stedelijkheid', higherIsBetter: false },
            { label: '% migratie', field: 'pct_migratie' },
            { label: '% niet-westers', field: 'pct_niet_westers' },
        ].map(m => ({
            label: m.label,
            value: num(row[m.field]),
            dist: getDistribution(m.field, selectedYear),
            higherIsBetter: m.higherIsBetter !== undefined ? m.higherIsBetter : true,
            neutral: true,  // all context metrics are neutral (no good/bad direction)
            decimals: m.field === 'ses_woa' ? 2 : 1,
        })).filter(m => m.value !== null);

        renderDistributionStrips('context-strips', cbsMetrics);
    } else {
        noData('context-strips');
    }
}

// ===================== SECTION 7: PERSONEEL & FINANCIEEL =====================
function renderPersoneel() {
    const row = getPanelRow(selectedSchool, selectedYear);
    const prevRow = getPanelRow(selectedSchool, prevYear(selectedYear));

    // Use latestAvailable fallback for metrics that may be missing in recent years
    const llrData = latestAvailable(selectedSchool, 'leerling_leraar_ratio', selectedYear);
    const loonsomData = latestAvailable(selectedSchool, 'gem_loonsom_op', selectedYear);
    const verzuim = row ? num(row.verzuimpct) : null;
    const prevVerzuim = prevRow ? num(prevRow.verzuimpct) : null;

    const llr = llrData.value;
    const loonsom = loonsomData.value;
    const llrNote = llrData.year && llrData.year !== selectedYear ? ' (' + llrData.year + ')' : '';
    const loonsomNote = loonsomData.year && loonsomData.year !== selectedYear ? ' (' + loonsomData.year + ')' : '';

    renderKPI('personeel-kpis', [
        { value: llr !== null ? formatNum(llr, 1) : '—', label: 'Leerling-leraar ratio' + llrNote },
        { value: loonsom !== null ? '\u20AC' + Math.round(loonsom).toLocaleString('nl') : '—', label: 'Gem. loonsom OP' + loonsomNote },
        { value: verzuim !== null ? formatPct(verzuim) : '—', label: 'Ziekteverzuim', trend: verzuim && prevVerzuim ? verzuim - prevVerzuim : null, invertTrend: true },
    ]);

    // Functiemix chart — use latest available year with functiemix data
    const fmData = latestAvailable(selectedSchool, 'pct_schaal_lc', selectedYear);
    const fmRow = fmData.row;
    if (fmRow) {
        const lc = num(fmRow.pct_schaal_lc) || 0;
        const ld = num(fmRow.pct_schaal_ld) || 0;
        const lb = Math.max(0, 100 - lc - ld);

        createBarChart('chart-functiemix',
            ['Functiemix' + (fmData.year !== selectedYear ? ' (' + fmData.year + ')' : '')],
            [
                { label: 'LB', data: [lb], backgroundColor: '#3498db' },
                { label: 'LC', data: [lc], backgroundColor: '#2ecc71' },
                { label: 'LD+', data: [ld], backgroundColor: '#e67e22' },
            ],
            { stacked: true, horizontal: true, yTitle: '%' }
        );
    } else {
        noData('chart-functiemix', 'Geen functiemix data');
    }

    // Verzuim trend
    const years = getAllYears(selectedSchool);
    const verzuimVals = years.map(y => num(y.verzuimpct));
    const avgVerzuim = SCHOOL_YEARS.map(y => {
        const d = getDistribution('verzuimpct', y);
        return d.n > 0 ? d.avg : null;
    });

    createLineChart('chart-verzuim', SCHOOL_YEARS, [
        { label: schoolDisplayName(selectedSchool), data: verzuimVals, borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg, tension: 0.3, pointRadius: 4 },
        { label: 'SHZG gemiddeld', data: avgVerzuim, borderColor: COLORS.grey, borderDash: [5, 3], backgroundColor: 'transparent', tension: 0.3, pointRadius: 2 },
    ], { yTitle: '%', beginAtZero: true });

    // Financial table
    renderFinancieelTable();

    // Distribution strips — use best available year for each metric
    const stripYear = fmData.year || selectedYear;
    const stripRow = fmRow || row;
    const stripItems = [];
    if (llr !== null) stripItems.push({ label: 'Leerling-leraar ratio', value: llr, dist: getDistribution('leerling_leraar_ratio', llrData.year), higherIsBetter: false, decimals: 1 });
    if (loonsom !== null) stripItems.push({ label: 'Gem. loonsom OP', value: loonsom, dist: getDistribution('gem_loonsom_op', loonsomData.year), decimals: 0 });
    if (verzuim !== null) stripItems.push({ label: 'Ziekteverzuim %', value: verzuim, dist: getDistribution('verzuimpct', selectedYear), higherIsBetter: false, fmt: formatPct(verzuim) });
    if (stripRow) {
        const lc = num(stripRow.pct_schaal_lc);
        const ld = num(stripRow.pct_schaal_ld);
        if (lc !== null) stripItems.push({ label: '% schaal LC+', value: lc, dist: getDistribution('pct_schaal_lc', stripYear), fmt: formatPct(lc) });
        if (ld !== null) stripItems.push({ label: '% schaal LD+', value: ld, dist: getDistribution('pct_schaal_ld', stripYear), fmt: formatPct(ld) });
    }
    if (stripItems.length > 0) {
        renderDistributionStrips('personeel-strips', stripItems);
    } else {
        noData('personeel-strips');
    }
}

function renderFinancieelTable() {
    const container = document.getElementById('financieel-table-container');
    // Find financial data for this school's bestuur
    const finRow = data.financieel.find(r => {
        if (r['Type data'] !== 'Bestuur') return false;
        const scholen = r.Scholen || '';
        return scholen.includes(selectedSchool);
    });

    if (!finRow) {
        container.innerHTML = '<div class="no-data">Geen financiele data gevonden</div>';
        return;
    }

    // Compute SHZG averages across all besturen
    const allFin = data.financieel.filter(r => r['Type data'] === 'Bestuur');
    function finAvg(field) {
        const vals = allFin.map(r => num(r[field])).filter(v => v !== null);
        return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    }

    const metrics = [
        { label: 'Solvabiliteit I', value: num(finRow['Solvabiliteit I']), avg: finAvg('Solvabiliteit I'), unit: '%' },
        { label: 'Solvabiliteit II', value: num(finRow['Solvabiliteit II']), avg: finAvg('Solvabiliteit II'), unit: '%' },
        { label: 'Liquiditeit current', value: num(finRow['Liquiditeit current']), avg: finAvg('Liquiditeit current'), unit: '' },
        { label: 'Weerstandsvermogen', value: num(finRow.Weerstandsvermogen), avg: finAvg('Weerstandsvermogen'), unit: '%' },
        { label: 'Kapitalisatiefactor', value: num(finRow.Kapitalisatiefactor), avg: finAvg('Kapitalisatiefactor'), unit: '%' },
        { label: 'Rentabiliteit', value: num(finRow.Rentabiliteit), avg: finAvg('Rentabiliteit'), unit: '%' },
        { label: 'Huisvestingsratio', value: num(finRow.Huisvestingsratio), avg: finAvg('Huisvestingsratio'), unit: '%' },
    ];

    let html = `<table class="data-table">
        <thead><tr><th>Indicator</th><th class="num">Bestuur</th><th class="num">SHZG gem.</th></tr></thead><tbody>`;
    metrics.forEach(m => {
        html += `<tr>
            <td>${m.label}</td>
            <td class="num">${m.value !== null ? formatNum(m.value, 1) + m.unit : '—'}</td>
            <td class="num" style="color:var(--text-light)">${m.avg !== null ? formatNum(m.avg, 1) + m.unit : '—'}</td>
        </tr>`;
    });
    html += `</tbody></table>
        <p style="font-size:0.75rem;color:var(--text-light);margin-top:0.4rem">
        Bestuur: ${finRow['Bevoegd gezag naam'] || '—'}</p>`;
    container.innerHTML = html;
}

// ===================== SECTION 8: INSPECTIE =====================
function renderInspectie() {
    const iRow = data.inspectie_resultaten.find(r =>
        r.tSchool === selectedSchool && r['Type data'] === 'School'
    );
    const oRow = data.inspectie_oordelen.find(r =>
        r.tSchool === selectedSchool && r['Type data'] === 'School'
    );

    // KPI: berekend oordeel
    const oordeel = iRow ? iRow['Berekend oordeel'] : (oRow ? oRow['Kwaliteit onderwijs'] : null);
    let oordeelClass = 'onbekend';
    if (oordeel) {
        const lower = oordeel.toLowerCase();
        if (lower === 'goed') oordeelClass = 'goed';
        else if (lower === 'voldoende') oordeelClass = 'voldoende';
        else if (lower.includes('tenzij')) oordeelClass = 'tenzij';
        else if (lower.includes('onvoldoende')) oordeelClass = 'onvoldoende';
    }

    renderKPI('inspectie-kpis', [
        { value: oordeel ? `<span class="oordeel-badge ${oordeelClass}">${oordeel}</span>` : '—', label: 'Berekend oordeel' },
    ]);

    // Inspectie indicators
    const indEl = document.getElementById('inspectie-indicatoren');
    if (iRow) {
        const indicators = [
            { label: 'Onderbouwsnelheid 3jr', value: iRow['Obsnelheid gem 3jr'], oordeel: iRow['Obsnelheid oordeel'] },
            { label: 'Bovenbouwsucces 3jr', value: iRow['Bbsucces gem 3jr'], oordeel: iRow['Bbsucces oordeel'] },
            { label: 'CE gemiddeld 3jr', value: iRow['CE gem 3jr'], oordeel: iRow['CE oordeel'] },
            { label: 'SE-CE verschil 3jr', value: iRow['SECE gem 3jr'], oordeel: iRow['SECE oordeel'] },
            { label: 'Advies 3jr', value: iRow['Advies gem 3jr'], oordeel: iRow['Advies oordeel'] },
        ];

        indEl.innerHTML = '<div class="inspectie-grid">' + indicators.map(ind => {
            const v = num(ind.value);
            let badgeCls = 'onbekend';
            if (ind.oordeel) {
                const o = ind.oordeel.toLowerCase();
                if (o.includes('boven')) badgeCls = 'goed';
                else if (o.includes('onder')) badgeCls = 'onvoldoende';
                else badgeCls = 'voldoende';
            }
            return `<div class="inspectie-item">
                <div class="metric-value">${v !== null ? formatNum(v, 1) : '—'}</div>
                <div class="metric-label">${ind.label}</div>
                <div class="metric-oordeel"><span class="badge ${badgeCls}">${ind.oordeel || '—'}</span></div>
            </div>`;
        }).join('') + '</div>';
    } else {
        indEl.innerHTML = '<div class="no-data">Geen inspectie-indicatoren</div>';
    }

    // Oordelen table
    const oordelenEl = document.getElementById('inspectie-oordelen-table');
    if (oRow) {
        const standaarden = ['OP2 Zicht op ontwikkeling', 'OP3 Pedagogisch klimaat',
            'VS1 Visie en ambitie', 'OR1 Resultaten',
            'SKA1 Kwaliteitszorg', 'SKA2 Kwaliteitscultuur', 'SKA3 Verantwoording'];

        let html = `<table class="data-table">
            <thead><tr><th>Standaard</th><th>Oordeel</th></tr></thead><tbody>`;
        standaarden.forEach(s => {
            const val = oRow[s] || '—';
            const cls = val.toLowerCase().includes('goed') ? 'goed' :
                        val.toLowerCase().includes('onvoldoende') ? 'onvoldoende' :
                        val.toLowerCase().includes('voldoende') ? 'voldoende' : 'onbekend';
            // Shorten label
            const shortLabel = s.replace(/^(OP\d|VS\d|OR\d|SKA\d)\s*/, '$1 ');
            html += `<tr><td>${shortLabel}</td><td><span class="badge ${cls}">${val}</span></td></tr>`;
        });

        // Metadata
        const type = oRow['Type onderzoek'] || '';
        const datum = oRow.Vaststellingsdatum || '';
        const datumClean = datum.replace(',0', '');
        const datumFmt = datumClean.length === 8 ?
            datumClean.substring(6, 8) + '-' + datumClean.substring(4, 6) + '-' + datumClean.substring(0, 4) : datumClean;

        html += `</tbody></table>
        <p style="font-size:0.75rem;color:var(--text-light);margin-top:0.5rem">
            ${type}${datumFmt ? ' — vastgesteld ' + datumFmt : ''}</p>`;
        oordelenEl.innerHTML = html;
    } else {
        oordelenEl.innerHTML = '<div class="no-data">Geen inspectie-oordelen</div>';
    }
}

// ===================== UTILITIES =====================
function prevYear(year) {
    const idx = SCHOOL_YEARS.indexOf(year);
    return idx > 0 ? SCHOOL_YEARS[idx - 1] : null;
}

// Find the latest year that has a non-null value for a given field
function latestAvailable(tSchool, field, maxYear) {
    const maxIdx = maxYear ? SCHOOL_YEARS.indexOf(maxYear) : SCHOOL_YEARS.length - 1;
    for (let i = maxIdx; i >= 0; i--) {
        const row = getPanelRow(tSchool, SCHOOL_YEARS[i]);
        if (row && num(row[field]) !== null) {
            return { year: SCHOOL_YEARS[i], value: num(row[field]), row };
        }
    }
    return { year: null, value: null, row: null };
}

// ===================== SECTION 9: EERLIJKE BENCHMARK (VA) =====================
const VAKGROEPEN = ['Klassiek', 'Beta', 'Wiskunde', 'Talen', 'Gamma'];
const VAKGROEP_COLORS = {
    Klassiek: '#8e44ad',
    Beta:     '#27ae60',
    Wiskunde: '#2980b9',
    Talen:    '#e67e22',
    Gamma:    '#e74c3c',
};

function getVASchoolRows(tSchool) {
    return (data.va_school || []).filter(r => r.tSchool === tSchool);
}

function getVAVakgroepRows(tSchool) {
    return (data.va_vakgroep || []).filter(r => r.tSchool === tSchool);
}

function getVADistribution(year) {
    // VA values for all schools for a given year
    const rows = (data.va_school || []).filter(r => r.Schooljaar === year);
    const vals = rows.map(r => ({ tSchool: r.tSchool, value: num(r.va_ce) }))
                     .filter(v => v.value !== null);
    vals.sort((a, b) => a.value - b.value);
    const values = vals.map(v => v.value);
    const min = values.length ? values[0] : 0;
    const max = values.length ? values[values.length - 1] : 1;
    const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    return { vals, values, min, max, avg, n: values.length };
}

function getVAVakgroepAvg(year) {
    // Average VA per vakgroep across all schools for a year
    const result = {};
    VAKGROEPEN.forEach(vg => {
        const rows = (data.va_vakgroep || []).filter(r => r.Schooljaar === year && r.vakgroep === vg);
        const vals = rows.map(r => num(r.va)).filter(v => v !== null);
        result[vg] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    });
    return result;
}

function renderBenchmark() {
    // Explainer text
    const explainer = document.getElementById('va-explainer');
    if (explainer) {
        explainer.innerHTML = `
            <h4>Wat is een eerlijke benchmark?</h4>
            <p>Niet alle scholen opereren onder dezelfde omstandigheden. Factoren als de
            sociaaleconomische achtergrond van leerlingen (SES), de stedelijkheid van het
            verzorgingsgebied en de leefbaarheid van de buurt be&iuml;nvloeden de
            examenresultaten, maar vallen buiten de invloedssfeer van de school.</p>
            <p>De eerlijke benchmark corrigeert hiervoor met een statistisch model.
            Het <span class="va-highlight">verwachte CE-cijfer</span> is wat een
            gemiddelde school zou scoren onder dezelfde omstandigheden. Het verschil
            tussen werkelijk en verwacht cijfer is de
            <span class="va-highlight">toegevoegde waarde</span>:
            een <span class="va-plus">positieve</span> waarde betekent dat de school
            beter presteert dan verwacht, een <span class="va-minus">negatieve</span>
            waarde slechter.</p>
            <p>Dezelfde correctie wordt ook per <strong>vakgroep</strong> toegepast.
            De vijf groepen zijn gekozen zodat elk voldoende examenkandidaten bevat voor een
            betrouwbaar model: <em>Klassiek</em> (Grieks, Latijn),
            <em>B&egrave;ta</em> (natuurkunde, scheikunde, biologie),
            <em>Wiskunde</em> (A en B), <em>Talen</em> (Nederlands, Engels, Frans, Duits)
            en <em>Gamma</em> (geschiedenis, aardrijkskunde, economie, filosofie).
            Zo wordt zichtbaar waar de school relatief sterk of zwak presteert.</p>
        `;
    }

    const vaRows = getVASchoolRows(selectedSchool);
    const vakRows = getVAVakgroepRows(selectedSchool);

    if (vaRows.length === 0) {
        noData('benchmark-kpis', 'Geen VA-data beschikbaar voor deze school');
        return;
    }

    // KPIs: latest year VA
    const latestVA = vaRows.find(r => r.Schooljaar === selectedYear);
    const prevVA = vaRows.find(r => r.Schooljaar === prevYear(selectedYear));
    const avgVA = vaRows.length > 0
        ? vaRows.reduce((s, r) => s + num(r.va_ce), 0) / vaRows.length
        : null;

    const vaVal = latestVA ? num(latestVA.va_ce) : null;
    const ceRaw = latestVA ? num(latestVA.ce_raw) : null;
    const cePred = latestVA ? num(latestVA.ce_predicted) : null;
    const prevVaVal = prevVA ? num(prevVA.va_ce) : null;

    renderKPI('benchmark-kpis', [
        {
            value: vaVal !== null ? (vaVal >= 0 ? '+' : '') + formatNum(vaVal, 3) : '—',
            label: 'Toegevoegde waarde ' + selectedYear,
            trend: vaVal !== null && prevVaVal !== null ? vaVal - prevVaVal : null,
        },
        {
            value: ceRaw !== null ? formatNum(ceRaw, 2) : '—',
            label: 'CE werkelijk',
        },
        {
            value: cePred !== null ? formatNum(cePred, 2) : '—',
            label: 'CE verwacht',
        },
        {
            value: avgVA !== null ? (avgVA >= 0 ? '+' : '') + formatNum(avgVA, 3) : '—',
            label: 'Gem. VA (alle jaren)',
        },
    ]);

    // Chart 1: CE raw vs predicted trend
    const ceRawVals = SCHOOL_YEARS.map(y => {
        const r = vaRows.find(v => v.Schooljaar === y);
        return r ? num(r.ce_raw) : null;
    });
    const cePredVals = SCHOOL_YEARS.map(y => {
        const r = vaRows.find(v => v.Schooljaar === y);
        return r ? num(r.ce_predicted) : null;
    });

    createLineChart('chart-va-ce', SCHOOL_YEARS, [
        {
            label: 'CE werkelijk',
            data: ceRawVals,
            borderColor: COLORS.primary,
            backgroundColor: COLORS.primaryBg,
            tension: 0.3,
            pointRadius: 5,
            pointHoverRadius: 7,
            borderWidth: 2.5,
        },
        {
            label: 'CE verwacht (gecorrigeerd)',
            data: cePredVals,
            borderColor: COLORS.accent,
            backgroundColor: COLORS.accentBg,
            borderDash: [6, 3],
            tension: 0.3,
            pointRadius: 4,
            borderWidth: 2,
        },
    ], { yTitle: 'CE gemiddeld' });

    // Chart 2: VA residual trend (bar chart with 0-line)
    const vaVals = SCHOOL_YEARS.map(y => {
        const r = vaRows.find(v => v.Schooljaar === y);
        return r ? num(r.va_ce) : null;
    });
    const vaColors = vaVals.map(v =>
        v === null ? 'transparent' : v >= 0 ? 'rgba(39, 174, 96, 0.7)' : 'rgba(231, 76, 60, 0.7)'
    );
    const vaBorders = vaVals.map(v =>
        v === null ? 'transparent' : v >= 0 ? 'rgba(39, 174, 96, 1)' : 'rgba(231, 76, 60, 1)'
    );

    const ctxResid = document.getElementById('chart-va-resid');
    if (ctxResid) {
        const c = new Chart(ctxResid, {
            type: 'bar',
            data: {
                labels: SCHOOL_YEARS,
                datasets: [{
                    label: 'Toegevoegde waarde',
                    data: vaVals,
                    backgroundColor: vaColors,
                    borderColor: vaBorders,
                    borderWidth: 1.5,
                    borderRadius: 4,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (item) => {
                                const v = item.raw;
                                if (v === null) return 'Geen data';
                                return 'VA: ' + (v >= 0 ? '+' : '') + formatNum(v, 3);
                            }
                        }
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { font: { size: 11 } },
                        title: { display: true, text: 'Toegevoegde waarde (CE-punten)', font: { size: 11 } },
                    },
                    x: { ticks: { font: { size: 11 } } },
                },
            },
        });
        charts['chart-va-resid'] = c;
    }

    // Chart 3: Vakgroep profile (bar chart: VA per vakgroep, average over all years)
    renderVakgroepProfile(vakRows);

    // Chart 4: Vakgroep trend (multi-line)
    renderVakgroepTrend(vakRows);

    // Distribution strips for VA
    renderVAStrips(vaVal);
}

function renderVakgroepProfile(vakRows) {
    const ctx = document.getElementById('chart-va-vakgroep');
    if (!ctx) return;

    // Average VA per vakgroep for this school over all years
    const schoolAvgVA = VAKGROEPEN.map(vg => {
        const rows = vakRows.filter(r => r.vakgroep === vg);
        const vals = rows.map(r => num(r.va)).filter(v => v !== null);
        return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    });

    const bgColors = VAKGROEPEN.map((vg, i) => {
        const v = schoolAvgVA[i];
        return v === null ? '#ccc' : v >= 0 ? 'rgba(39, 174, 96, 0.6)' : 'rgba(231, 76, 60, 0.6)';
    });
    const borderColors = VAKGROEPEN.map((vg, i) => {
        const v = schoolAvgVA[i];
        return v === null ? '#999' : v >= 0 ? 'rgba(39, 174, 96, 1)' : 'rgba(231, 76, 60, 1)';
    });

    const c = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: VAKGROEPEN,
            datasets: [{
                label: 'Gem. toegevoegde waarde',
                data: schoolAvgVA,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 1.5,
                borderRadius: 4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (item) => {
                            const v = item.raw;
                            if (v === null) return 'Geen data';
                            return 'VA: ' + (v >= 0 ? '+' : '') + formatNum(v, 3);
                        }
                    }
                },
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { font: { size: 11 } },
                    title: { display: true, text: 'Toegevoegde waarde (CE-punten)', font: { size: 11 } },
                },
                y: {
                    ticks: { font: { size: 11, weight: 'bold' } },
                },
            },
        },
    });
    charts['chart-va-vakgroep'] = c;
}

function renderVakgroepTrend(vakRows) {
    const ctx = document.getElementById('chart-va-vakgroep-trend');
    if (!ctx) return;

    const datasets = VAKGROEPEN.map(vg => {
        const lineData = SCHOOL_YEARS.map(y => {
            const r = vakRows.find(v => v.Schooljaar === y && v.vakgroep === vg);
            return r ? num(r.va) : null;
        });
        return {
            label: vg,
            data: lineData,
            borderColor: VAKGROEP_COLORS[vg],
            backgroundColor: VAKGROEP_COLORS[vg] + '22',
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.2,
            spanGaps: true,
        };
    });

    // Zero line is already built-in with beginAtZero
    const c = new Chart(ctx, {
        type: 'line',
        data: {
            labels: SCHOOL_YEARS,
            datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { font: { size: 10 }, boxWidth: 12, usePointStyle: true },
                },
                tooltip: {
                    callbacks: {
                        label: (item) => {
                            const v = item.raw;
                            if (v === null) return item.dataset.label + ': geen data';
                            return item.dataset.label + ': ' + (v >= 0 ? '+' : '') + formatNum(v, 3);
                        }
                    }
                },
            },
            scales: {
                y: {
                    ticks: { font: { size: 11 } },
                    title: { display: true, text: 'VA (CE-punten)', font: { size: 11 } },
                },
                x: { ticks: { font: { size: 11 } } },
            },
        },
    });
    charts['chart-va-vakgroep-trend'] = c;
}

function renderVAStrips(currentVA) {
    const dist = getVADistribution(selectedYear);
    if (dist.n < 3 || currentVA === null) {
        noData('benchmark-strips', 'Onvoldoende data voor positiebepaling');
        return;
    }

    // Also show average VA over all years as a strip
    const vaRows = getVASchoolRows(selectedSchool);
    const avgVA = vaRows.length > 0
        ? vaRows.reduce((s, r) => s + num(r.va_ce), 0) / vaRows.length
        : null;

    // Build distribution for average VA (across all years per school)
    const schoolAvgs = {};
    (data.va_school || []).forEach(r => {
        if (!schoolAvgs[r.tSchool]) schoolAvgs[r.tSchool] = [];
        const v = num(r.va_ce);
        if (v !== null) schoolAvgs[r.tSchool].push(v);
    });
    const avgVals = Object.entries(schoolAvgs).map(([ts, vals]) => ({
        tSchool: ts,
        value: vals.reduce((s, v) => s + v, 0) / vals.length,
    })).sort((a, b) => a.value - b.value);
    const avgValues = avgVals.map(v => v.value);
    const avgDist = {
        vals: avgVals,
        values: avgValues,
        min: avgValues[0] || 0,
        max: avgValues[avgValues.length - 1] || 1,
        avg: avgValues.reduce((s, v) => s + v, 0) / (avgValues.length || 1),
        n: avgValues.length,
    };

    const items = [
        { label: 'VA ' + selectedYear, value: currentVA, dist: dist, higherIsBetter: true, decimals: 3 },
    ];
    if (avgVA !== null && avgDist.n >= 3) {
        items.push({ label: 'Gem. VA (alle jaren)', value: avgVA, dist: avgDist, higherIsBetter: true, decimals: 3 });
    }

    // Add vakgroep strips for latest year
    VAKGROEPEN.forEach(vg => {
        const vgRow = (data.va_vakgroep || []).find(r =>
            r.tSchool === selectedSchool && r.Schooljaar === selectedYear && r.vakgroep === vg
        );
        const vgVal = vgRow ? num(vgRow.va) : null;
        if (vgVal === null) return;

        // Distribution for this vakgroep in this year
        const vgRows = (data.va_vakgroep || []).filter(r =>
            r.Schooljaar === selectedYear && r.vakgroep === vg
        );
        const vgVals = vgRows.map(r => ({ tSchool: r.tSchool, value: num(r.va) }))
                             .filter(v => v.value !== null)
                             .sort((a, b) => a.value - b.value);
        const vgValues = vgVals.map(v => v.value);
        if (vgValues.length < 3) return;
        const vgDist = {
            vals: vgVals, values: vgValues,
            min: vgValues[0], max: vgValues[vgValues.length - 1],
            avg: vgValues.reduce((s, v) => s + v, 0) / vgValues.length,
            n: vgValues.length,
        };
        items.push({ label: 'VA ' + vg, value: vgVal, dist: vgDist, higherIsBetter: true, decimals: 3 });
    });

    renderDistributionStrips('benchmark-strips', items);
}

// ===================== SECTION 10: SCHOLENKAART =====================

let mapInstance = null;
let mapMarkers = [];
let mapLabels = [];
let coordsCache = null;
let herkomstCache = null;
let pc4Cache = null;
let choroplethLayer = null;
let heatmapVisible = false;

async function loadCoordinates() {
    if (coordsCache) return coordsCache;
    try {
        const resp = await fetch(DATA_BASE + 'coordinates.json');
        coordsCache = await resp.json();
    } catch (e) {
        coordsCache = {};
    }
    return coordsCache;
}

async function renderKaart() {
    const coords = await loadCoordinates();
    if (!coords || Object.keys(coords).length === 0) return;

    const container = document.getElementById('map-container');
    if (!container) return;

    // Initialize map only once
    if (!mapInstance) {
        mapInstance = L.map('map-container', {
            scrollWheelZoom: true,
            zoomControl: true,
        }).setView([52.2, 5.3], 7);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap',
            maxZoom: 18,
        }).addTo(mapInstance);

        // Show/hide labels based on zoom level
        mapInstance.on('zoomend', updateMapLabels);

        // Zoom button — zoom out a bit when heatmap is visible
        const btn = document.getElementById('map-zoom-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                const c = coords[selectedSchool];
                if (c) mapInstance.flyTo([c.lat, c.lng], heatmapVisible ? 10 : 13, { duration: 0.8 });
            });
        }

        // Heatmap toggle button
        const heatBtn = document.getElementById('map-heatmap-btn');
        if (heatBtn) {
            heatBtn.addEventListener('click', () => toggleHeatmap());
        }
    }

    // Clear existing markers & labels
    mapMarkers.forEach(m => mapInstance.removeLayer(m));
    mapLabels.forEach(l => mapInstance.removeLayer(l));
    mapMarkers = [];
    mapLabels = [];

    const latestYear = SCHOOL_YEARS[SCHOOL_YEARS.length - 1];

    // Add markers for all schools
    schoolList.forEach(s => {
        const c = coords[s.tSchool];
        if (!c) return;

        const isSelected = s.tSchool === selectedSchool;
        const row = getPanelRow(s.tSchool, latestYear);

        // Build popup content
        let popupHtml = `<div style="min-width:180px">
            <strong style="font-size:13px">${s.name}</strong><br>
            <span style="color:#666;font-size:11px">${s.city}</span><br>
            <span style="color:#888;font-size:11px">${s.address}, ${s.postcode}</span>`;

        if (row) {
            const ll = num(row.leerlingen_totaal);
            const ce = num(row.ce_gem);
            const sp = num(row.slaagpct);
            popupHtml += `<hr style="margin:6px 0;border:none;border-top:1px solid #eee">`;
            if (ll !== null) popupHtml += `<span style="font-size:12px">Leerlingen: <b>${Math.round(ll)}</b></span><br>`;
            if (ce !== null) popupHtml += `<span style="font-size:12px">CE gemiddeld: <b>${ce.toFixed(2)}</b></span><br>`;
            if (sp !== null) popupHtml += `<span style="font-size:12px">Slagings%: <b>${sp.toFixed(1)}%</b></span><br>`;
        }
        popupHtml += `</div>`;

        // Circle marker
        const marker = L.circleMarker([c.lat, c.lng], {
            radius: isSelected ? 10 : 6,
            fillColor: isSelected ? '#e67e22' : '#1a5276',
            color: isSelected ? '#d35400' : '#0e3a5c',
            weight: isSelected ? 3 : 1.5,
            fillOpacity: isSelected ? 0.95 : 0.8,
            zIndexOffset: isSelected ? 1000 : 0,
        }).addTo(mapInstance);

        marker.bindPopup(popupHtml);
        marker.bindTooltip(s.name, {
            direction: 'top',
            offset: [0, -8],
            className: 'map-label',
        });

        // Click on marker → select that school
        marker.on('click', () => {
            const sel = document.getElementById('school-select');
            if (sel) {
                sel.value = s.tSchool;
                sel.dispatchEvent(new Event('change'));
            }
        });

        marker._tSchool = s.tSchool;
        marker._isSelected = isSelected;
        mapMarkers.push(marker);

        // Permanent label (only shown at certain zoom levels)
        const labelClass = isSelected ? 'map-label-selected' : 'map-label';
        const label = L.tooltip({
            permanent: true,
            direction: 'right',
            offset: [isSelected ? 14 : 10, 0],
            className: labelClass,
        });
        label.setContent(s.name);
        label.setLatLng([c.lat, c.lng]);
        label._tSchool = s.tSchool;
        label._isSelected = isSelected;
        mapLabels.push(label);
    });

    updateMapLabels();

    // Update choropleth if visible
    if (heatmapVisible && choroplethLayer) {
        updateChoropleth();
    }

    // Ensure map renders correctly (fix for container resize)
    setTimeout(() => { if (mapInstance) mapInstance.invalidateSize(); }, 200);
}

function updateMapLabels() {
    if (!mapInstance) return;
    const zoom = mapInstance.getZoom();

    mapLabels.forEach(label => {
        if (label._isSelected) {
            // Selected school label: always visible
            if (!mapInstance.hasLayer(label)) label.addTo(mapInstance);
        } else if (zoom >= 10) {
            // Other labels: only at zoom >= 10
            if (!mapInstance.hasLayer(label)) label.addTo(mapInstance);
        } else {
            // Hide labels at low zoom
            if (mapInstance.hasLayer(label)) mapInstance.removeLayer(label);
        }
    });
}

/* ===== Leerlingherkomst Heatmap ===== */

async function loadHerkomst() {
    if (herkomstCache) return herkomstCache;
    try {
        const resp = await fetch(DATA_BASE + 'herkomst.json');
        herkomstCache = await resp.json();
    } catch (e) {
        herkomstCache = {};
    }
    return herkomstCache;
}

async function loadPC4Boundaries() {
    if (pc4Cache) return pc4Cache;
    try {
        const resp = await fetch(DATA_BASE + 'pc4_grenzen.topojson.json');
        pc4Cache = await resp.json();
    } catch (e) {
        pc4Cache = null;
    }
    return pc4Cache;
}

function getHeatColor(count, maxCount) {
    if (!count || count <= 0) return { fillColor: '#fef6ec', fillOpacity: 0 };
    // Use sqrt scale so that a few large values don't dominate all color
    const t = Math.sqrt(count) / Math.sqrt(maxCount);
    const clamped = Math.min(Math.max(t, 0), 1);
    // Interpolate from light (#fbc68b) through mid (#e67e22) to dark (#d35400)
    const r = Math.round(251 - clamped * (251 - 211));
    const g = Math.round(198 - clamped * (198 - 84));
    const b = Math.round(139 - clamped * (139 - 0));
    const opacity = 0.15 + clamped * 0.65;
    return { fillColor: `rgb(${r},${g},${b})`, fillOpacity: opacity };
}

async function toggleHeatmap() {
    const btn = document.getElementById('map-heatmap-btn');
    const legend = document.getElementById('map-legend');
    const note = document.getElementById('map-source-note');

    if (heatmapVisible) {
        // Turn off
        heatmapVisible = false;
        if (btn) { btn.textContent = 'Toon leerlingherkomst'; btn.classList.remove('active'); }
        if (legend) legend.style.display = 'none';
        if (note) note.style.display = 'none';
        if (choroplethLayer && mapInstance) {
            mapInstance.removeLayer(choroplethLayer);
        }
        return;
    }

    // Turn on — lazy-load data
    if (btn) { btn.textContent = 'Laden...'; btn.disabled = true; }

    const [herkomst, topo] = await Promise.all([loadHerkomst(), loadPC4Boundaries()]);

    if (!topo || !herkomst) {
        if (btn) { btn.textContent = 'Toon leerlingherkomst'; btn.disabled = false; }
        return;
    }

    heatmapVisible = true;
    if (btn) { btn.textContent = 'Verberg leerlingherkomst'; btn.disabled = false; btn.classList.add('active'); }
    if (legend) legend.style.display = 'block';
    if (note) note.style.display = 'block';

    // Build choropleth layer (once) from TopoJSON
    if (!choroplethLayer) {
        const objectKey = Object.keys(topo.objects)[0];
        const geojson = topojson.feature(topo, topo.objects[objectKey]);

        choroplethLayer = L.geoJson(geojson, {
            style: () => ({
                fillColor: '#fef6ec',
                fillOpacity: 0,
                color: '#c0c0c0',
                weight: 0.5,
                opacity: 0.4,
            }),
            onEachFeature: (feature, layer) => {
                layer.on({
                    mouseover: highlightPC4,
                    mouseout: resetPC4,
                });
            },
        });
    }

    // Add choropleth below markers
    choroplethLayer.addTo(mapInstance);
    choroplethLayer.bringToBack();

    // Color it for current school
    updateChoropleth();
}

function updateChoropleth() {
    if (!choroplethLayer || !herkomstCache) return;

    const schoolData = herkomstCache[selectedSchool] || {};
    const counts = Object.values(schoolData);
    const maxCount = counts.length > 0 ? Math.max(...counts) : 1;

    // Update legend max
    const legendMax = document.getElementById('map-legend-max');
    if (legendMax) legendMax.textContent = maxCount > 0 ? maxCount : '?';

    // Update polygon styles
    choroplethLayer.eachLayer(layer => {
        const pc4 = String(layer.feature.properties.postcode);
        const count = schoolData[pc4] || 0;
        const { fillColor, fillOpacity } = getHeatColor(count, maxCount);

        layer.setStyle({
            fillColor,
            fillOpacity,
            color: count > 0 ? '#b87333' : '#c0c0c0',
            weight: count > 0 ? 0.8 : 0.3,
            opacity: count > 0 ? 0.6 : 0.2,
        });

        // Update tooltip content
        if (count > 0) {
            const total = counts.reduce((a, b) => a + b, 0);
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '?';
            const approx = count === 2 ? ' (geschat)' : '';
            layer.unbindTooltip();
            layer.bindTooltip(
                `<b>PC4 ${pc4}</b><br>${count} leerling${count !== 1 ? 'en' : ''}${approx} (${pct}%)`,
                { sticky: true, className: 'map-label' }
            );
        } else {
            layer.unbindTooltip();
        }
    });
}

function highlightPC4(e) {
    const layer = e.target;
    const pc4 = String(layer.feature.properties.postcode);
    const schoolData = herkomstCache ? (herkomstCache[selectedSchool] || {}) : {};
    const count = schoolData[pc4] || 0;
    if (count > 0) {
        layer.setStyle({
            weight: 2.5,
            color: '#d35400',
            opacity: 0.9,
        });
        layer.bringToFront();
        // Re-bring markers to front
        mapMarkers.forEach(m => m.bringToFront());
    }
}

function resetPC4(e) {
    const layer = e.target;
    const pc4 = String(layer.feature.properties.postcode);
    const schoolData = herkomstCache ? (herkomstCache[selectedSchool] || {}) : {};
    const count = schoolData[pc4] || 0;
    layer.setStyle({
        color: count > 0 ? '#b87333' : '#c0c0c0',
        weight: count > 0 ? 0.8 : 0.3,
        opacity: count > 0 ? 0.6 : 0.2,
    });
}
