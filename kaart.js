// === SHZG Scholenkaart — Standalone pagina ===

const DATA_BASE = './data/';
const SCHOOL_YEARS = ['21-22', '22-23', '23-24', '24-25'];

// ===================== STATE =====================
let schoolList = [];
let panelIndex = {};
let selectedSchool = null;

let mapInstance = null;
let mapMarkers = [];
let mapLabels = [];
let coordsCache = null;
let herkomstCache = null;
let pc4Cache = null;
let choroplethLayer = null;
let heatmapVisible = false;

// "Alle scholen" (KNVB-style) state
let dominantCache = null;
let allSchoolsVisible = false;
let allSchoolsLayer = null;
let logoMarkerLayer = null;

// "Marktaandeel" state
let marktaandeelCache = null;
let marktaandeelVisible = false;
let marktaandeelLayer = null;

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

// ===================== DATA LOADING =====================
async function loadData() {
    const [adressenResp, panelResp] = await Promise.all([
        fetch(DATA_BASE + 'adressen.csv'),
        fetch(DATA_BASE + 'panel.csv'),
    ]);
    const adressenRows = parseCSV(await adressenResp.text());
    const panelRows = parseCSV(await panelResp.text());

    schoolList = adressenRows.map(r => ({
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

    panelIndex = {};
    panelRows.forEach(r => {
        if (!panelIndex[r.tSchool]) panelIndex[r.tSchool] = {};
        panelIndex[r.tSchool][r.Schooljaar] = r;
    });
}

function getPanelRow(tSchool, year) {
    return panelIndex[tSchool]?.[year] || null;
}

// ===================== SCHOOL SELECTOR =====================
function buildSchoolSelector() {
    const sel = document.getElementById('school-select');
    sel.innerHTML = '';
    schoolList.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.tSchool;
        opt.textContent = `${s.name} — ${s.city}`;
        sel.appendChild(opt);
    });
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
    const code = selectedSchool ? (selectedSchool.match(/\d{2}\w{2}/)?.[0] || '') : '';
    location.hash = `school=${code}`;
}

// ===================== INITIALIZATION =====================
document.addEventListener('DOMContentLoaded', init);

async function init() {
    try {
        await loadData();
        buildSchoolSelector();

        // School change event
        document.getElementById('school-select').addEventListener('change', e => {
            selectedSchool = e.target.value;
            updateHash();
            renderKaart();
        });

        document.getElementById('loading').classList.add('hidden');
        document.getElementById('kaart-page').classList.remove('hidden');

        // Check hash for school selection
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

        renderKaart();
    } catch (e) {
        document.getElementById('loading').innerHTML =
            '<p style="color:#e74c3c">Fout bij laden: ' + e.message + '</p>';
        console.error(e);
    }
}

// ===================== MAP: COORDINATES =====================
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

// ===================== MAP: RENDER =====================
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

        mapInstance.on('zoomend', updateMapLabels);

        // Zoom button
        const btn = document.getElementById('map-zoom-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                const c = coords[selectedSchool];
                if (c) mapInstance.flyTo([c.lat, c.lng], heatmapVisible ? 10 : 13, { duration: 0.8 });
            });
        }

        // Heatmap toggle
        const heatBtn = document.getElementById('map-heatmap-btn');
        if (heatBtn) {
            heatBtn.addEventListener('click', () => toggleHeatmap());
        }

        // "Alle scholen" toggle
        const allBtn = document.getElementById('map-allschools-btn');
        if (allBtn) {
            allBtn.addEventListener('click', () => toggleAllSchools());
        }

        // "Marktaandeel" toggle
        const maBtn = document.getElementById('map-marktaandeel-btn');
        if (maBtn) {
            maBtn.addEventListener('click', () => toggleMarktaandeel());
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

        // Permanent label
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

    // In "Alle scholen" mode, hide circle markers and show logos instead
    if (allSchoolsVisible) {
        mapMarkers.forEach(m => { m.setStyle({ opacity: 0, fillOpacity: 0 }); });
        mapLabels.forEach(l => { if (mapInstance.hasLayer(l)) mapInstance.removeLayer(l); });
        updateLogoMarkers();
    }

    // In "Marktaandeel" mode, keep circle markers visible
    if (marktaandeelVisible) {
        // no-op: markers stay normal
    }

    setTimeout(() => { if (mapInstance) mapInstance.invalidateSize(); }, 200);
}

function updateMapLabels() {
    if (!mapInstance) return;
    const zoom = mapInstance.getZoom();
    mapLabels.forEach(label => {
        if (label._isSelected) {
            if (!mapInstance.hasLayer(label)) label.addTo(mapInstance);
        } else if (zoom >= 10) {
            if (!mapInstance.hasLayer(label)) label.addTo(mapInstance);
        } else {
            if (mapInstance.hasLayer(label)) mapInstance.removeLayer(label);
        }
    });
}

// ===================== HEATMAP =====================
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
    const t = Math.sqrt(count) / Math.sqrt(maxCount);
    const clamped = Math.min(Math.max(t, 0), 1);
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
        heatmapVisible = false;
        if (btn) { btn.textContent = 'Toon leerlingherkomst'; btn.classList.remove('active'); }
        if (legend) legend.style.display = 'none';
        if (note) note.style.display = 'none';
        if (choroplethLayer && mapInstance) {
            mapInstance.removeLayer(choroplethLayer);
        }
        return;
    }

    // Turn off "Alle scholen" first if active
    if (allSchoolsVisible) {
        await toggleAllSchools();
    }

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

    choroplethLayer.addTo(mapInstance);
    choroplethLayer.bringToBack();
    updateChoropleth();
}

function updateChoropleth() {
    if (!choroplethLayer || !herkomstCache) return;

    const schoolData = herkomstCache[selectedSchool] || {};
    const counts = Object.values(schoolData);
    const maxCount = counts.length > 0 ? Math.max(...counts) : 1;

    const legendMax = document.getElementById('map-legend-max');
    if (legendMax) legendMax.textContent = maxCount > 0 ? maxCount : '?';

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
        layer.setStyle({ weight: 2.5, color: '#d35400', opacity: 0.9 });
        layer.bringToFront();
        mapMarkers.forEach(m => m.bringToFront());
    }
}

function resetPC4(e) {
    const layer = e.target;
    const pc4 = String(layer.feature.properties.postcode);
    if (heatmapVisible) {
        const schoolData = herkomstCache ? (herkomstCache[selectedSchool] || {}) : {};
        const count = schoolData[pc4] || 0;
        layer.setStyle({
            color: count > 0 ? '#b87333' : '#c0c0c0',
            weight: count > 0 ? 0.8 : 0.3,
            opacity: count > 0 ? 0.6 : 0.2,
        });
    } else if (allSchoolsVisible && dominantCache) {
        const info = dominantCache.pc4[pc4];
        if (info) {
            layer.setStyle({ weight: 0.8, color: '#666', opacity: 0.4 });
        }
    }
}

// ===================== "ALLE SCHOLEN" KNVB-STYLE =====================
async function loadDominant() {
    if (dominantCache) return dominantCache;
    try {
        const resp = await fetch(DATA_BASE + 'dominant.json?v=2');
        dominantCache = await resp.json();
    } catch (e) {
        dominantCache = null;
    }
    return dominantCache;
}

async function toggleAllSchools() {
    const btn = document.getElementById('map-allschools-btn');
    const heatLegend = document.getElementById('map-legend');
    const heatNote = document.getElementById('map-source-note');
    const allLegend = document.getElementById('map-allschools-legend');

    if (allSchoolsVisible) {
        allSchoolsVisible = false;
        if (btn) { btn.textContent = 'Alle scholen'; btn.classList.remove('active-alt'); }
        if (allLegend) allLegend.style.display = 'none';
        if (heatNote) heatNote.style.display = 'none';

        if (allSchoolsLayer && mapInstance) mapInstance.removeLayer(allSchoolsLayer);
        if (logoMarkerLayer && mapInstance) mapInstance.removeLayer(logoMarkerLayer);

        // Restore circle markers
        mapMarkers.forEach(m => {
            m.setStyle({ opacity: 1, fillOpacity: m._isSelected ? 0.95 : 0.8 });
        });
        updateMapLabels();
        return;
    }

    // Turn off heatmap first if active
    if (heatmapVisible) {
        await toggleHeatmap();
    }

    if (btn) { btn.textContent = 'Laden...'; btn.disabled = true; }

    const [dominant, topo] = await Promise.all([loadDominant(), loadPC4Boundaries()]);

    if (!dominant || !topo) {
        if (btn) { btn.textContent = 'Alle scholen'; btn.disabled = false; }
        return;
    }

    allSchoolsVisible = true;
    if (btn) { btn.textContent = 'Verberg alle scholen'; btn.disabled = false; btn.classList.add('active-alt'); }
    if (heatNote) { heatNote.textContent = 'Herkomstgegevens: actuele stand (bron: Scholen op de Kaart). Waarden <5 zijn geschat.'; heatNote.style.display = 'block'; }

    if (!allSchoolsLayer) {
        const objectKey = Object.keys(topo.objects)[0];
        const geojson = topojson.feature(topo, topo.objects[objectKey]);

        allSchoolsLayer = L.geoJson(geojson, {
            style: (feature) => {
                const pc4 = String(feature.properties.postcode);
                const info = dominant.pc4[pc4];
                if (!info) return { fillOpacity: 0, weight: 0.3, color: '#ccc', opacity: 0.2 };
                const colorIdx = dominant.colors[info.dominant];
                const color = dominant.palette[colorIdx !== undefined ? colorIdx : 0];
                return { fillColor: color, fillOpacity: 0.6, color: '#666', weight: 0.8, opacity: 0.4 };
            },
            onEachFeature: (feature, layer) => {
                const pc4 = String(feature.properties.postcode);
                const info = dominant.pc4[pc4];
                if (info) {
                    layer.on({
                        mouseover: (e) => {
                            e.target.setStyle({ weight: 2.5, color: '#333', opacity: 0.8 });
                            e.target.bringToFront();
                            if (logoMarkerLayer) logoMarkerLayer.eachLayer(m => m.bringToFront());
                        },
                        mouseout: resetPC4,
                        click: (e) => showBreakdownPopup(pc4, e.latlng, dominant),
                    });
                }
            },
        });
    } else {
        allSchoolsLayer.eachLayer(layer => {
            const pc4 = String(layer.feature.properties.postcode);
            const info = dominant.pc4[pc4];
            if (!info) return;
            const colorIdx = dominant.colors[info.dominant];
            const color = dominant.palette[colorIdx !== undefined ? colorIdx : 0];
            layer.setStyle({ fillColor: color, fillOpacity: 0.6, color: '#666', weight: 0.8, opacity: 0.4 });
        });
    }

    allSchoolsLayer.addTo(mapInstance);
    allSchoolsLayer.bringToBack();

    // Hide circle markers, show logo markers
    mapMarkers.forEach(m => { m.setStyle({ opacity: 0, fillOpacity: 0 }); });
    mapLabels.forEach(l => { if (mapInstance.hasLayer(l)) mapInstance.removeLayer(l); });

    await addLogoMarkers(dominant);
    buildAllSchoolsLegend(dominant);

    if (heatLegend) heatLegend.style.display = 'none';
    if (allLegend) allLegend.style.display = 'flex';
}

function showBreakdownPopup(pc4, latlng, dominant) {
    const info = dominant.pc4[pc4];
    if (!info || !info.schools || info.schools.length === 0) return;

    let html = '<div class="map-popup-breakdown">';
    html += `<div class="popup-title">PC4 ${pc4}</div>`;
    html += '<table>';

    info.schools.forEach(s => {
        const colorIdx = dominant.colors[s.tSchool];
        const color = dominant.palette[colorIdx !== undefined ? colorIdx : 0];
        const name = dominant.schoolNames[s.tSchool] || s.tSchool;
        const isDominant = s.tSchool === info.dominant;
        const approx = s.count === 2 ? '~' : '';

        html += '<tr>';
        html += `<td><span class="popup-dot" style="background:${color}"></span></td>`;
        html += `<td class="popup-school${isDominant ? ' dominant' : ''}">${name}</td>`;
        html += `<td class="popup-count">${approx}${s.count}</td>`;
        html += `<td class="popup-pct">${s.pct}%</td>`;
        html += '</tr>';
    });

    html += '</table></div>';

    L.popup({ maxWidth: 350, className: 'breakdown-popup' })
        .setLatLng(latlng)
        .setContent(html)
        .openOn(mapInstance);
}

async function addLogoMarkers(dominant) {
    if (!mapInstance || !coordsCache) return;

    if (!mapInstance.getPane('logoPane')) {
        mapInstance.createPane('logoPane');
        mapInstance.getPane('logoPane').style.zIndex = 650;
    }

    if (logoMarkerLayer) mapInstance.removeLayer(logoMarkerLayer);

    logoMarkerLayer = L.layerGroup([], { pane: 'logoPane' });

    schoolList.forEach(s => {
        const c = coordsCache[s.tSchool];
        if (!c) return;

        const prefix = s.tSchool.split('.')[0].trim();
        const isSelected = s.tSchool === selectedSchool;
        const colorIdx = dominant.colors[s.tSchool];
        const color = dominant.palette[colorIdx !== undefined ? colorIdx : 0];

        const iconSize = isSelected ? 36 : 28;
        const icon = L.divIcon({
            className: 'school-logo-wrapper',
            html: `<img src="data/logos/${prefix}.png"
                        class="school-logo-icon${isSelected ? ' logo-selected' : ''}"
                        style="width:${iconSize}px;height:${iconSize}px;${!isSelected ? 'border-color:' + color : ''}"
                        onerror="this.style.display='none'"
                        alt="${s.name}">`,
            iconSize: [iconSize, iconSize],
            iconAnchor: [iconSize / 2, iconSize / 2],
        });

        const marker = L.marker([c.lat, c.lng], {
            icon: icon,
            pane: 'logoPane',
            zIndexOffset: isSelected ? 1000 : 0,
        });

        marker.bindTooltip(s.name, {
            direction: 'top',
            offset: [0, -(iconSize / 2 + 4)],
            className: isSelected ? 'map-label-selected' : 'map-label',
        });

        marker.on('click', () => {
            const sel = document.getElementById('school-select');
            if (sel) {
                sel.value = s.tSchool;
                sel.dispatchEvent(new Event('change'));
            }
        });

        logoMarkerLayer.addLayer(marker);
    });

    logoMarkerLayer.addTo(mapInstance);
}

function updateLogoMarkers() {
    if (!logoMarkerLayer || !dominantCache || !coordsCache) return;
    addLogoMarkers(dominantCache);
}

// ===================== "MARKTAANDEEL" SHZG vs OVERIG =====================
async function loadMarktaandeel() {
    if (marktaandeelCache) return marktaandeelCache;
    try {
        const resp = await fetch(DATA_BASE + 'marktaandeel.json');
        marktaandeelCache = await resp.json();
    } catch (e) {
        marktaandeelCache = null;
    }
    return marktaandeelCache;
}

function getMarktaandeelColor(pctShzg) {
    // Blue (#1a5276) at 100% SHZG → white (#f0f0f0) at 50% → Red (#c0392b) at 0% SHZG
    let r, g, b;
    if (pctShzg >= 50) {
        // Blue to white: 50-100% SHZG
        const t = (pctShzg - 50) / 50; // 0=50%, 1=100%
        r = Math.round(240 - t * (240 - 26));
        g = Math.round(240 - t * (240 - 82));
        b = Math.round(240 - t * (240 - 118));
    } else {
        // White to red: 0-50% SHZG
        const t = pctShzg / 50; // 0=0%, 1=50%
        r = Math.round(192 + t * (240 - 192));
        g = Math.round(57 + t * (240 - 57));
        b = Math.round(43 + t * (240 - 43));
    }
    const opacity = 0.25 + 0.45 * Math.abs(pctShzg - 50) / 50;
    return { fillColor: `rgb(${r},${g},${b})`, fillOpacity: opacity };
}

async function toggleMarktaandeel() {
    const btn = document.getElementById('map-marktaandeel-btn');
    const maLegend = document.getElementById('map-marktaandeel-legend');
    const heatLegend = document.getElementById('map-legend');
    const heatNote = document.getElementById('map-source-note');
    const allLegend = document.getElementById('map-allschools-legend');

    if (marktaandeelVisible) {
        marktaandeelVisible = false;
        if (btn) { btn.textContent = 'Marktaandeel'; btn.classList.remove('active'); }
        if (maLegend) maLegend.style.display = 'none';
        if (heatNote) heatNote.style.display = 'none';
        if (marktaandeelLayer && mapInstance) mapInstance.removeLayer(marktaandeelLayer);
        return;
    }

    // Turn off other modes
    if (heatmapVisible) await toggleHeatmap();
    if (allSchoolsVisible) await toggleAllSchools();

    if (btn) { btn.textContent = 'Laden...'; btn.disabled = true; }

    const [ma, topo] = await Promise.all([loadMarktaandeel(), loadPC4Boundaries()]);

    if (!ma || !topo) {
        if (btn) { btn.textContent = 'Marktaandeel'; btn.disabled = false; }
        return;
    }

    marktaandeelVisible = true;
    if (btn) { btn.textContent = 'Verberg marktaandeel'; btn.disabled = false; btn.classList.add('active'); }
    if (maLegend) maLegend.style.display = 'block';
    if (heatLegend) heatLegend.style.display = 'none';
    if (allLegend) allLegend.style.display = 'none';
    if (heatNote) { heatNote.textContent = 'Marktaandeel SHZG vs overige VWO-scholen per PC4-gebied (bron: Scholen op de Kaart). Waarden <5 zijn geschat.'; heatNote.style.display = 'block'; }

    if (!marktaandeelLayer) {
        const objectKey = Object.keys(topo.objects)[0];
        const geojson = topojson.feature(topo, topo.objects[objectKey]);

        marktaandeelLayer = L.geoJson(geojson, {
            style: (feature) => {
                const pc4 = String(feature.properties.postcode);
                const info = ma[pc4];
                if (!info) return { fillOpacity: 0, weight: 0.3, color: '#ccc', opacity: 0.2 };
                const { fillColor, fillOpacity } = getMarktaandeelColor(info.pct_shzg);
                return { fillColor, fillOpacity, color: '#999', weight: 0.5, opacity: 0.3 };
            },
            onEachFeature: (feature, layer) => {
                const pc4 = String(feature.properties.postcode);
                const info = ma[pc4];
                if (info) {
                    const pctOverig = (100 - info.pct_shzg).toFixed(1);
                    layer.bindTooltip(
                        `<b>PC4 ${pc4}</b><br>SHZG: ${info.shzg} lln (${info.pct_shzg}%)<br>Overig: ${info.overig} lln (${pctOverig}%)<br>Totaal: ${info.total}`,
                        { sticky: true, className: 'map-label' }
                    );
                    layer.on({
                        mouseover: (e) => {
                            e.target.setStyle({ weight: 2.5, color: '#333', opacity: 0.8 });
                            e.target.bringToFront();
                            mapMarkers.forEach(m => m.bringToFront());
                        },
                        mouseout: (e) => {
                            e.target.setStyle({ weight: 0.5, color: '#999', opacity: 0.3 });
                        },
                    });
                }
            },
        });
    }

    marktaandeelLayer.addTo(mapInstance);
    marktaandeelLayer.bringToBack();
}

function buildAllSchoolsLegend(dominant) {
    const container = document.getElementById('map-allschools-legend');
    if (!container) return;

    const domCount = {};
    for (const [, info] of Object.entries(dominant.pc4)) {
        domCount[info.dominant] = (domCount[info.dominant] || 0) + 1;
    }

    const sorted = Object.entries(domCount).sort((a, b) => b[1] - a[1]);

    let html = '';
    sorted.forEach(([tSchool]) => {
        const colorIdx = dominant.colors[tSchool];
        const color = dominant.palette[colorIdx !== undefined ? colorIdx : 0];
        const name = dominant.schoolNames[tSchool] || tSchool;

        html += `<div class="map-allschools-legend-item">
            <span class="map-allschools-legend-dot" style="background:${color}"></span>
            <span>${name}</span>
        </div>`;
    });

    container.innerHTML = html;
}
