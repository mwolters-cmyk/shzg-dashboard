// === SHZG Dashboard — Vergelijking (Laag 2) ===

const DATA_BASE = './data/';
const SCHOOL_YEARS = ['21-22', '22-23', '23-24', '24-25'];

const CSV_FILES = {
    adressen: 'adressen.csv',
    panel: 'panel.csv',
    inspectie_resultaten: 'inspectie_resultaten.csv',
    inspectie_oordelen: 'inspectie_oordelen.csv',
    va_school: 'va_school.csv',
    va_vakgroep: 'va_vakgroep.csv',
};

const COLORS = {
    primary: 'rgba(26, 82, 118, 0.85)',
    grey: 'rgba(127, 140, 141, 0.5)',
    palette: ['#1a5276','#2980b9','#27ae60','#e67e22','#e74c3c','#8e44ad','#16a085','#d35400'],
};

const MAX_SCHOOLS = 6;
const MIN_SCHOOLS = 2;

// ===================== METRIC CONFIG =====================
// Declarative config: each metric becomes a multi-line chart (all years)
const METRIC_GROUPS = [
    {
        section: 'examens',
        gridId: 'grid-examens',
        metrics: [
            { field: 'ce_gem',          label: 'CE gemiddeld',       decimals: 2 },
            { field: 'slaagpct',        label: 'Slagingspercentage', decimals: 1, suffix: '%' },
            { field: 'se_ce_verschil',  label: 'SE-CE verschil',     decimals: 2 },
        ],
    },
    {
        section: 'leerlingen',
        gridId: 'grid-leerlingen',
        metrics: [
            { field: 'leerlingen_totaal',  label: 'Leerlingen totaal', decimals: 0 },
            { field: 'pct_zittenblijvers', label: '% Zittenblijvers',  decimals: 1, suffix: '%' },
            { field: 'pct_afstromers',     label: '% Afstromers',      decimals: 1, suffix: '%' },
        ],
    },
    {
        section: 'profielen',
        gridId: 'grid-profielen',
        metrics: [
            { field: 'pct_natuur', label: '% Natuur (bovenbouw)', decimals: 1, suffix: '%' },
        ],
    },
    {
        section: 'gender',
        gridId: 'grid-gender',
        metrics: [
            { field: 'pct_meisjes', label: '% Meisjes', decimals: 1, suffix: '%' },
        ],
    },
    {
        section: 'tevredenheid',
        gridId: 'grid-tevredenheid',
        metrics: [
            { field: 'tevredenheid_ll',     label: 'Tevredenheid leerlingen', decimals: 1 },
            { field: 'tevredenheid_ouders', label: 'Tevredenheid ouders',     decimals: 1 },
        ],
    },
    {
        section: 'doorstroom',
        gridId: 'grid-doorstroom',
        metrics: [
            { field: 'pct_wo',              label: '% WO',              decimals: 1, suffix: '%' },
            { field: 'pct_hbo',             label: '% HBO',             decimals: 1, suffix: '%' },
            { field: 'pct_geen_bekostigd',  label: '% Geen bekostigd',  decimals: 1, suffix: '%' },
        ],
    },
    {
        section: 'context',
        gridId: 'grid-context',
        type: 'table',
        metrics: [
            { field: 'ses_woa',        label: 'SES-WOA',               decimals: 2 },
            { field: 'stedelijkheid',  label: 'Stedelijkheid',          decimals: 1 },
            { field: 'pct_migratie',   label: '% Migratieachtergrond',  decimals: 1, suffix: '%' },
            { field: 'pct_koopwoning', label: '% Koopwoning',           decimals: 1, suffix: '%' },
        ],
    },
    {
        section: 'personeel',
        gridId: 'grid-personeel',
        metrics: [
            { field: 'leerling_leraar_ratio', label: 'Leerling-leraar ratio', decimals: 1 },
            { field: 'pct_schaal_ld',         label: '% Schaal LD',           decimals: 1, suffix: '%' },
            { field: 'verzuimpct',            label: 'Verzuim %',             decimals: 1, suffix: '%' },
        ],
    },
];

// ===================== STATE =====================
let data = {};
let schoolList = [];
let panelIndex = {};
let selectedSchools = [];   // array of tSchool codes
let schoolColors = {};      // tSchool -> color
let charts = {};
let colorPool = [...COLORS.palette];
const LATEST_YEAR = SCHOOL_YEARS[SCHOOL_YEARS.length - 1]; // for inspectie table

// ===================== INITIALIZATION =====================
document.addEventListener('DOMContentLoaded', init);

async function init() {
    try {
        await loadAllData();
        buildSchoolPicker();
        setupEventListeners();
        document.getElementById('loading').classList.add('hidden');

        // Restore from URL hash
        restoreFromHash();

        renderAll();
    } catch (e) {
        document.getElementById('loading').innerHTML =
            '<p style="color:#e74c3c">Fout bij laden: ' + e.message + '</p>';
        console.error(e);
    }
}

// ===================== DATA LOADING (duplicated from dashboard.js) =====================
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

function scaleGrade(val) {
    const n = num(val);
    if (n === null) return null;
    return Math.abs(n) > 100 ? n / 1000000 : n;
}

function buildSchoolList() {
    schoolList = data.adressen.map(r => ({
        tSchool: r.tSchool,
        name: r.Schoolnaam,
        city: r.Woonplaats,
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

function schoolDisplayName(tSchool) {
    const s = schoolList.find(s => s.tSchool === tSchool);
    return s ? s.name : tSchool;
}

function shortName(name) {
    // Shorten long school names for chart labels
    if (name.length <= 22) return name;
    // Try to abbreviate common patterns
    return name.replace(/Stedelijk Gymnasium /i, 'St. Gym. ')
               .replace(/Gymnasium /i, 'Gym. ')
               .replace(/Christelijk /i, 'Chr. ')
               .substring(0, 22);
}

function formatNum(val, dec = 1) {
    if (val === null || val === undefined) return '\u2014';
    return Number(val).toFixed(dec).replace('.', ',');
}

// ===================== SHZG AVERAGE =====================
function getSHZGAverage(field, year) {
    let sum = 0, count = 0;
    schoolList.forEach(s => {
        const row = getPanelRow(s.tSchool, year);
        if (row) {
            const v = num(row[field]);
            if (v !== null) { sum += v; count++; }
        }
    });
    return count > 0 ? sum / count : null;
}

// ===================== SCHOOL PICKER =====================
function buildSchoolPicker() {
    const list = document.getElementById('picker-list');
    list.innerHTML = schoolList.map(s => {
        return `<label class="picker-item" data-tschool="${s.tSchool}">
            <input type="checkbox" value="${s.tSchool}">
            <span class="school-name">${s.name}</span>
            <span class="school-city">${s.city}</span>
        </label>`;
    }).join('');
}

function toggleSchool(tSchool) {
    const idx = selectedSchools.indexOf(tSchool);
    if (idx >= 0) {
        // Remove
        selectedSchools.splice(idx, 1);
        const color = schoolColors[tSchool];
        if (color) colorPool.push(color);
        delete schoolColors[tSchool];
    } else {
        if (selectedSchools.length >= MAX_SCHOOLS) return;
        // Add
        selectedSchools.push(tSchool);
        const color = colorPool.shift() || COLORS.palette[selectedSchools.length % COLORS.palette.length];
        schoolColors[tSchool] = color;
    }
    syncPickerState();
    renderChipBar();
    updatePickerButton();
    updateHash();
    renderAll();
}

function syncPickerState() {
    document.querySelectorAll('.picker-item').forEach(el => {
        const ts = el.dataset.tschool;
        const cb = el.querySelector('input');
        const isSelected = selectedSchools.includes(ts);
        cb.checked = isSelected;
        el.classList.toggle('selected', isSelected);
        // Disable unchecked items if at max
        if (!isSelected && selectedSchools.length >= MAX_SCHOOLS) {
            el.classList.add('disabled');
            cb.disabled = true;
        } else {
            el.classList.remove('disabled');
            cb.disabled = false;
        }
    });
}

function updatePickerButton() {
    const btn = document.getElementById('picker-btn');
    const n = selectedSchools.length;
    btn.textContent = n === 0 ? 'Selecteer scholen...' :
                      n === 1 ? '1 school geselecteerd' :
                      n + ' scholen geselecteerd';
}

function renderChipBar() {
    const bar = document.getElementById('chip-bar');
    bar.innerHTML = selectedSchools.map(ts => {
        const color = schoolColors[ts];
        const name = schoolDisplayName(ts);
        return `<span class="school-chip" style="background:${color}" data-tschool="${ts}">
            <span class="chip-dot"></span>
            ${shortName(name)}
            <button class="chip-remove" title="Verwijder">&times;</button>
        </span>`;
    }).join('');
}

// ===================== EVENT LISTENERS =====================
function setupEventListeners() {
    // Toggle picker dropdown
    document.getElementById('picker-btn').addEventListener('click', () => {
        const dd = document.getElementById('picker-dropdown');
        dd.classList.toggle('hidden');
        if (!dd.classList.contains('hidden')) {
            document.getElementById('picker-search').focus();
        }
    });

    // Close picker on outside click
    document.addEventListener('click', (e) => {
        const picker = document.getElementById('school-picker');
        if (!picker.contains(e.target)) {
            document.getElementById('picker-dropdown').classList.add('hidden');
        }
    });

    // Search filter
    document.getElementById('picker-search').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.picker-item').forEach(el => {
            const name = el.querySelector('.school-name').textContent.toLowerCase();
            const city = el.querySelector('.school-city').textContent.toLowerCase();
            el.style.display = (name.includes(q) || city.includes(q)) ? '' : 'none';
        });
    });

    // Checkbox clicks in picker
    document.getElementById('picker-list').addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            const ts = e.target.value;
            toggleSchool(ts);
        }
    });

    // Select all / clear all
    document.getElementById('btn-select-all').addEventListener('click', () => {
        const visible = [...document.querySelectorAll('.picker-item')]
            .filter(el => el.style.display !== 'none')
            .map(el => el.dataset.tschool)
            .filter(ts => !selectedSchools.includes(ts));
        visible.slice(0, MAX_SCHOOLS - selectedSchools.length).forEach(ts => {
            selectedSchools.push(ts);
            const color = colorPool.shift() || COLORS.palette[selectedSchools.length % COLORS.palette.length];
            schoolColors[ts] = color;
        });
        syncPickerState();
        renderChipBar();
        updatePickerButton();
        updateHash();
        renderAll();
    });

    document.getElementById('btn-clear-all').addEventListener('click', () => {
        selectedSchools.forEach(ts => {
            const color = schoolColors[ts];
            if (color) colorPool.push(color);
        });
        selectedSchools = [];
        schoolColors = {};
        colorPool = [...COLORS.palette];
        syncPickerState();
        renderChipBar();
        updatePickerButton();
        updateHash();
        renderAll();
    });

    // Chip bar remove
    document.getElementById('chip-bar').addEventListener('click', (e) => {
        const btn = e.target.closest('.chip-remove');
        if (btn) {
            const chip = btn.closest('.school-chip');
            toggleSchool(chip.dataset.tschool);
        }
    });

    // Sidebar scroll spy
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => { updateScrollSpy(); ticking = false; });
            ticking = true;
        }
    });

    // Sidebar click: smooth scroll to section
    document.querySelectorAll('#section-nav a').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.getElementById(a.dataset.section);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
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

// ===================== URL HASH =====================
function updateHash() {
    window.location.hash = selectedSchools.length ? 'schools=' + selectedSchools.join(',') : '';
}

function restoreFromHash() {
    const hash = decodeURIComponent(window.location.hash.replace('#', ''));
    if (!hash) return;
    const params = {};
    hash.split('&').forEach(part => {
        const [k, v] = part.split('=');
        if (k && v) params[k] = v;
    });
    if (params.schools) {
        const codes = params.schools.split(',');
        codes.slice(0, MAX_SCHOOLS).forEach(ts => {
            if (schoolList.find(s => s.tSchool === ts) && !selectedSchools.includes(ts)) {
                selectedSchools.push(ts);
                const color = colorPool.shift() || COLORS.palette[selectedSchools.length % COLORS.palette.length];
                schoolColors[ts] = color;
            }
        });
        syncPickerState();
        renderChipBar();
        updatePickerButton();
    }
}

// ===================== RENDER ORCHESTRATOR =====================
function renderAll() {
    const layout = document.getElementById('compare-layout');
    const placeholder = document.getElementById('placeholder');

    if (selectedSchools.length < MIN_SCHOOLS) {
        layout.classList.add('hidden');
        placeholder.classList.remove('hidden');
        destroyCharts();
        return;
    }
    placeholder.classList.add('hidden');
    layout.classList.remove('hidden');

    destroyCharts();

    // Render each metric group
    METRIC_GROUPS.forEach(group => renderMetricGroup(group));

    // Render benchmark comparison
    renderBenchmarkComparison();

    // Render inspectie comparison table
    renderInspectieTable();
}

function destroyCharts() {
    Object.values(charts).forEach(c => { if (c && c.destroy) c.destroy(); });
    charts = {};
}

// ===================== MULTI-LINE TREND CHARTS =====================
function renderMetricGroup(group) {
    const grid = document.getElementById(group.gridId);
    if (!grid) return;

    // Clear old content
    grid.innerHTML = '';

    // Table mode: render a comparison table instead of charts
    if (group.type === 'table') {
        if (group.section === 'context') {
            const explainer = document.createElement('div');
            explainer.className = 'chart-card context-explainer';
            explainer.innerHTML = `
                <h4>Toelichting contextkenmerken</h4>
                <p><strong>SES-WOA</strong> &mdash; sociaaleconomische status van het verzorgingsgebied (welvaart, opleidingsniveau, arbeidsmarkt). Hoger = hoger opgeleid/welvarender.
                <strong>Stedelijkheid</strong> &mdash; CBS-maat (1 = zeer sterk stedelijk, 5 = niet stedelijk).
                <strong>% Migratieachtergrond</strong> &mdash; aandeel leerlingen met een migratieachtergrond.
                <strong>% Koopwoning</strong> &mdash; aandeel koopwoningen in het verzorgingsgebied (indicator welvaart).
                Deze kenmerken be&iuml;nvloeden schoolprestaties maar vallen buiten de invloedssfeer van de school.</p>
            `;
            grid.appendChild(explainer);
        }
        renderComparisonTable(grid, group.metrics);
        return;
    }

    // Create one multi-line chart per metric (all years, one line per school)
    group.metrics.forEach(metric => {
        const card = document.createElement('div');
        card.className = 'chart-card';
        const canvasId = `line-${metric.field}`;
        card.innerHTML = `<h3>${metric.label}</h3>
            <div class="chart-container"><canvas id="${canvasId}"></canvas></div>`;
        grid.appendChild(card);

        renderMetricLine(canvasId, metric);
    });
}

function renderComparisonTable(container, metrics) {
    const card = document.createElement('div');
    card.className = 'chart-card';

    // Use latest year that has data for any selected school
    const useYear = SCHOOL_YEARS.slice().reverse().find(y =>
        selectedSchools.some(ts => {
            const row = getPanelRow(ts, y);
            return row && metrics.some(m => num(row[m.field]) !== null);
        })
    ) || LATEST_YEAR;

    let html = `<table class="context-compare-table data-table"><thead><tr>`;
    html += `<th>School</th>`;
    metrics.forEach(m => { html += `<th>${m.label}</th>`; });
    html += `</tr></thead><tbody>`;

    selectedSchools.forEach(ts => {
        const row = getPanelRow(ts, useYear);
        const name = shortName(schoolDisplayName(ts));
        const color = schoolColors[ts];
        html += `<tr><td class="school-col" style="border-left: 4px solid ${color}">${name}</td>`;
        metrics.forEach(m => {
            const v = row ? num(row[m.field]) : null;
            const suffix = m.suffix || '';
            html += `<td class="num">${v !== null ? formatNum(v, m.decimals) + suffix : '\u2014'}</td>`;
        });
        html += `</tr>`;
    });

    // SHZG average row
    html += `<tr class="total-row"><td class="school-col">SHZG gemiddelde</td>`;
    metrics.forEach(m => {
        const avg = getSHZGAverage(m.field, useYear);
        const suffix = m.suffix || '';
        html += `<td class="num">${avg !== null ? formatNum(avg, m.decimals) + suffix : '\u2014'}</td>`;
    });
    html += `</tr>`;

    html += `</tbody></table>`;
    card.innerHTML = html;
    container.appendChild(card);
}

function renderMetricLine(canvasId, metric) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const datasets = [];
    const suffix = metric.suffix || '';

    // One line per selected school
    selectedSchools.forEach(ts => {
        const lineData = SCHOOL_YEARS.map(y => {
            const row = getPanelRow(ts, y);
            if (!row) return null;
            return metric.field === 'ce_gem' ? scaleGrade(row[metric.field]) : num(row[metric.field]);
        });
        datasets.push({
            label: shortName(schoolDisplayName(ts)),
            data: lineData,
            borderColor: schoolColors[ts],
            backgroundColor: schoolColors[ts] + '22',
            borderWidth: 2.5,
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.2,
            spanGaps: true,
        });
    });

    // SHZG average as dashed grey line
    const avgData = SCHOOL_YEARS.map(y => getSHZGAverage(metric.field, y));
    datasets.push({
        label: 'SHZG gem.',
        data: avgData,
        borderColor: 'rgba(127, 140, 141, 0.6)',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0.2,
        spanGaps: true,
    });

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
                            return item.dataset.label + ': ' + formatNum(v, metric.decimals) + suffix;
                        }
                    }
                },
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        font: { size: 11 },
                        callback: function(v) { return metric.suffix ? v + metric.suffix : v; },
                    },
                    title: { display: true, text: metric.label, font: { size: 11 } },
                },
                x: {
                    ticks: { font: { size: 11 } },
                },
            },
        },
    });
    charts[canvasId] = c;
}

// ===================== INSPECTIE COMPARISON TABLE =====================
function renderInspectieTable() {
    const container = document.getElementById('inspectie-compare-table');
    if (!container) return;

    // Show year label
    const yearLabel = document.getElementById('inspectie-year-label');
    if (yearLabel) yearLabel.textContent = `(${LATEST_YEAR})`;

    const indicators = [
        { field: 'inspectie_oordeel',       label: 'Oordeel' },
        { field: 'inspectie_obsnelheid_3jr', label: 'Onderbouwsnelheid' },
        { field: 'inspectie_bbsucces_3jr',  label: 'Bovenbouwsucces' },
        { field: 'inspectie_ce_3jr',        label: 'CE-cijfer 3jr' },
        { field: 'inspectie_sece_3jr',      label: 'SE-CE verschil 3jr' },
        { field: 'inspectie_advies_3jr',    label: 'Verschil advies 3jr' },
    ];

    // Build table
    let html = '<table class="inspectie-compare-table data-table"><thead><tr>';
    html += '<th>School</th>';
    indicators.forEach(ind => { html += `<th>${ind.label}</th>`; });
    html += '</tr></thead><tbody>';

    selectedSchools.forEach(ts => {
        const row = getPanelRow(ts, LATEST_YEAR);
        const name = shortName(schoolDisplayName(ts));
        const color = schoolColors[ts];
        html += `<tr><td class="school-col" style="border-left: 4px solid ${color}">${name}</td>`;
        indicators.forEach(ind => {
            const val = row ? (row[ind.field] || '') : '';
            if (ind.field === 'inspectie_oordeel') {
                const cls = val.toLowerCase().includes('goed') ? 'goed' :
                            val.toLowerCase().includes('onvoldoende') ? 'onvoldoende' :
                            val.toLowerCase().includes('voldoende') ? 'voldoende' : 'onbekend';
                html += `<td><span class="badge ${cls}">${val || '\u2014'}</span></td>`;
            } else {
                const n = num(val);
                html += `<td class="num">${n !== null ? formatNum(n, 2) : '\u2014'}</td>`;
            }
        });
        html += '</tr>';
    });

    // SHZG average row
    html += '<tr class="total-row"><td class="school-col">SHZG gemiddelde</td>';
    indicators.forEach(ind => {
        if (ind.field === 'inspectie_oordeel') {
            html += '<td>\u2014</td>';
        } else {
            const avg = getSHZGAverage(ind.field, LATEST_YEAR);
            html += `<td class="num">${avg !== null ? formatNum(avg, 2) : '\u2014'}</td>`;
        }
    });
    html += '</tr>';

    html += '</tbody></table>';
    container.innerHTML = html;
}

// ===================== BENCHMARK COMPARISON =====================
const VAKGROEPEN = ['Klassiek', 'Beta', 'Wiskunde', 'Talen', 'Gamma'];
const VAKGROEP_COLORS = {
    Klassiek: '#8e44ad',
    Beta:     '#27ae60',
    Wiskunde: '#2980b9',
    Talen:    '#e67e22',
    Gamma:    '#e74c3c',
};

function renderBenchmarkComparison() {
    const grid = document.getElementById('grid-benchmark');
    if (!grid) return;
    grid.innerHTML = '';

    // Render explainer
    const explainerEl = document.getElementById('va-compare-explainer');
    if (explainerEl) {
        explainerEl.innerHTML = `
            <h4>Wat is de Eerlijke Benchmark?</h4>
            <p>De Eerlijke Benchmark (EB) corrigeert het CE-cijfer voor factoren die de school
            niet kan be&iuml;nvloeden: sociaaleconomische achtergrond (SES), stedelijkheid
            en leefbaarheid van het verzorgingsgebied.
            Een <strong style="color:#27ae60">positieve EB</strong> betekent dat de school
            beter presteert dan verwacht, een <strong style="color:#e74c3c">negatieve EB</strong> slechter.
            Dezelfde correctie wordt ook per vakgroep toegepast
            (Klassiek, B&egrave;ta, Wiskunde, Talen, Gamma).</p>
        `;
    }

    // Chart 1: VA school-level trend (multi-line, one per school)
    const card1 = document.createElement('div');
    card1.className = 'chart-card';
    const canvasId1 = 'cmp-va-school';
    card1.innerHTML = `<h3>Eerlijke Benchmark (school)</h3>
        <div class="chart-container"><canvas id="${canvasId1}"></canvas></div>`;
    grid.appendChild(card1);
    renderVASchoolLine(canvasId1);

    // Chart 2: CE raw vs predicted (multi-line)
    const card2 = document.createElement('div');
    card2.className = 'chart-card';
    const canvasId2 = 'cmp-va-ce-raw';
    card2.innerHTML = `<h3>CE werkelijk vs verwacht</h3>
        <div class="chart-container"><canvas id="${canvasId2}"></canvas></div>`;
    grid.appendChild(card2);
    renderVACERawPred(canvasId2);

    // Charts per vakgroep: one chart per vakgroep showing VA per school
    VAKGROEPEN.forEach(vg => {
        const card = document.createElement('div');
        card.className = 'chart-card';
        const canvasId = `cmp-va-${vg.toLowerCase()}`;
        card.innerHTML = `<h3>EB ${vg}</h3>
            <div class="chart-container"><canvas id="${canvasId}"></canvas></div>`;
        grid.appendChild(card);
        renderVAVakgroepLine(canvasId, vg);
    });
}

function renderVASchoolLine(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const datasets = [];
    selectedSchools.forEach(ts => {
        const lineData = SCHOOL_YEARS.map(y => {
            const r = (data.va_school || []).find(v => v.tSchool === ts && v.Schooljaar === y);
            return r ? num(r.va_ce) : null;
        });
        datasets.push({
            label: shortName(schoolDisplayName(ts)),
            data: lineData,
            borderColor: schoolColors[ts],
            backgroundColor: schoolColors[ts] + '22',
            borderWidth: 2.5,
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.2,
            spanGaps: true,
        });
    });

    // Zero reference line as a subtle dataset
    datasets.push({
        label: 'Verwachting (0)',
        data: SCHOOL_YEARS.map(() => 0),
        borderColor: 'rgba(127, 140, 141, 0.4)',
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
    });

    const c = new Chart(ctx, {
        type: 'line',
        data: { labels: SCHOOL_YEARS, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: {
                    display: true, position: 'top',
                    labels: { font: { size: 10 }, boxWidth: 12, usePointStyle: true },
                },
                tooltip: {
                    callbacks: {
                        label: (item) => {
                            const v = item.raw;
                            if (v === null) return item.dataset.label + ': geen data';
                            if (item.dataset.label === 'Verwachting (0)') return null;
                            return item.dataset.label + ': ' + (v >= 0 ? '+' : '') + formatNum(v, 3);
                        }
                    }
                },
            },
            scales: {
                y: {
                    ticks: { font: { size: 11 } },
                    title: { display: true, text: 'EB (CE-punten)', font: { size: 11 } },
                },
                x: { ticks: { font: { size: 11 } } },
            },
        },
    });
    charts[canvasId] = c;
}

function renderVACERawPred(canvasId) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const datasets = [];
    selectedSchools.forEach(ts => {
        // Raw CE as solid line
        const rawData = SCHOOL_YEARS.map(y => {
            const r = (data.va_school || []).find(v => v.tSchool === ts && v.Schooljaar === y);
            return r ? num(r.ce_raw) : null;
        });
        datasets.push({
            label: shortName(schoolDisplayName(ts)),
            data: rawData,
            borderColor: schoolColors[ts],
            backgroundColor: schoolColors[ts] + '22',
            borderWidth: 2.5,
            pointRadius: 4,
            tension: 0.2,
            spanGaps: true,
        });
        // Predicted as dashed line (same color, thinner)
        const predData = SCHOOL_YEARS.map(y => {
            const r = (data.va_school || []).find(v => v.tSchool === ts && v.Schooljaar === y);
            return r ? num(r.ce_predicted) : null;
        });
        datasets.push({
            label: shortName(schoolDisplayName(ts)) + ' (verw.)',
            data: predData,
            borderColor: schoolColors[ts] + '88',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [5, 3],
            pointRadius: 2,
            tension: 0.2,
            spanGaps: true,
        });
    });

    const c = new Chart(ctx, {
        type: 'line',
        data: { labels: SCHOOL_YEARS, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: {
                    display: true, position: 'top',
                    labels: { font: { size: 9 }, boxWidth: 10, usePointStyle: true },
                },
                tooltip: {
                    callbacks: {
                        label: (item) => {
                            const v = item.raw;
                            if (v === null) return item.dataset.label + ': geen data';
                            return item.dataset.label + ': ' + formatNum(v, 2);
                        }
                    }
                },
            },
            scales: {
                y: {
                    ticks: { font: { size: 11 } },
                    title: { display: true, text: 'CE gemiddeld', font: { size: 11 } },
                },
                x: { ticks: { font: { size: 11 } } },
            },
        },
    });
    charts[canvasId] = c;
}

function renderVAVakgroepLine(canvasId, vakgroep) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const datasets = [];
    selectedSchools.forEach(ts => {
        const lineData = SCHOOL_YEARS.map(y => {
            const r = (data.va_vakgroep || []).find(v =>
                v.tSchool === ts && v.Schooljaar === y && v.vakgroep === vakgroep
            );
            return r ? num(r.va) : null;
        });
        datasets.push({
            label: shortName(schoolDisplayName(ts)),
            data: lineData,
            borderColor: schoolColors[ts],
            backgroundColor: schoolColors[ts] + '22',
            borderWidth: 2.5,
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.2,
            spanGaps: true,
        });
    });

    // Zero reference
    datasets.push({
        label: 'Verwachting',
        data: SCHOOL_YEARS.map(() => 0),
        borderColor: 'rgba(127, 140, 141, 0.4)',
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
    });

    const c = new Chart(ctx, {
        type: 'line',
        data: { labels: SCHOOL_YEARS, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: {
                    display: true, position: 'top',
                    labels: { font: { size: 10 }, boxWidth: 12, usePointStyle: true },
                },
                tooltip: {
                    callbacks: {
                        label: (item) => {
                            const v = item.raw;
                            if (v === null) return item.dataset.label + ': geen data';
                            if (item.dataset.label === 'Verwachting') return null;
                            return item.dataset.label + ': ' + (v >= 0 ? '+' : '') + formatNum(v, 3);
                        }
                    }
                },
            },
            scales: {
                y: {
                    ticks: { font: { size: 11 } },
                    title: { display: true, text: 'EB ' + vakgroep, font: { size: 11 } },
                },
                x: { ticks: { font: { size: 11 } } },
            },
        },
    });
    charts[canvasId] = c;
}
