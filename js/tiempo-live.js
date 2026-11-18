/*
 * Datos en directo de /tiempo/: condiciones actuales, próximas 24 h, polen,
 * trayectoria del sol y la luna y municipios cercanos.
 *
 * La página se genera en estático con AEMET (scripts/render-tiempo-static.js);
 * este script solo completa los bloques que cambian cada pocos minutos. Si
 * Open-Meteo no responde, cada bloque muestra un aviso y el resto de la página
 * sigue funcionando.
 */
(function () {
    'use strict';

    const LAT = 36.6439;
    const LON = -4.6892;
    const TZ = 'Europe%2FMadrid';

    const NEARBY = [
        { name: 'Coín', lat: 36.6598, lon: -4.7530 },
        { name: 'Cártama', lat: 36.7103, lon: -4.6349 },
        { name: 'Alhaurín de la Torre', lat: 36.6640, lon: -4.5616 },
        { name: 'Mijas', lat: 36.5958, lon: -4.6370 },
        { name: 'Pizarra', lat: 36.7667, lon: -4.7097 },
        { name: 'Guaro', lat: 36.6557, lon: -4.8350 },
        { name: 'Monda', lat: 36.6303, lon: -4.8310 },
        { name: 'Benalmádena', lat: 36.5989, lon: -4.5167 }
    ];

    // Umbrales de la Red Española de Aerobiología (granos/m³). Gramíneas y
    // olivo coinciden con scripts/actualizar_tiempo_aemet.py.
    const POLLEN = [
        { key: 'olive_pollen', name: 'Olivo', icon: '🫒', moderado: 50, alto: 200 },
        { key: 'grass_pollen', name: 'Gramíneas', icon: '🌾', moderado: 10, alto: 50 },
        { key: 'birch_pollen', name: 'Abedul', icon: '🌳', moderado: 30, alto: 80 },
        { key: 'alder_pollen', name: 'Aliso', icon: '🌲', moderado: 30, alto: 80 },
        { key: 'mugwort_pollen', name: 'Artemisa', icon: '🌿', moderado: 15, alto: 30 },
        { key: 'ragweed_pollen', name: 'Ambrosía', icon: '🍂', moderado: 5, alto: 20 }
    ];

    const WMO = {
        0: ['Despejado', '☀️', '🌙'],
        1: ['Mayormente despejado', '🌤️', '🌙'],
        2: ['Parcialmente nublado', '⛅', '☁️'],
        3: ['Nublado', '☁️', '☁️'],
        45: ['Niebla', '🌫️'], 48: ['Niebla con escarcha', '🌫️'],
        51: ['Llovizna débil', '🌦️'], 53: ['Llovizna', '🌦️'], 55: ['Llovizna intensa', '🌧️'],
        56: ['Llovizna helada', '🌧️'], 57: ['Llovizna helada intensa', '🌧️'],
        61: ['Lluvia débil', '🌦️'], 63: ['Lluvia', '🌧️'], 65: ['Lluvia fuerte', '🌧️'],
        66: ['Lluvia helada', '🌧️'], 67: ['Lluvia helada fuerte', '🌧️'],
        71: ['Nieve débil', '🌨️'], 73: ['Nieve', '🌨️'], 75: ['Nieve fuerte', '❄️'], 77: ['Granos de nieve', '🌨️'],
        80: ['Chubascos débiles', '🌦️'], 81: ['Chubascos', '🌧️'], 82: ['Chubascos fuertes', '⛈️'],
        85: ['Chubascos de nieve', '🌨️'], 86: ['Chubascos de nieve fuertes', '❄️'],
        95: ['Tormenta', '⛈️'], 96: ['Tormenta con granizo', '⛈️'], 99: ['Tormenta con granizo fuerte', '⛈️']
    };

    function wmo(code, isDay = 1) {
        const entry = WMO[code] || ['Sin datos', '🌡️'];
        return { text: entry[0], icon: !isDay && entry[2] ? entry[2] : entry[1] };
    }

    function compass(deg) {
        if (deg == null || Number.isNaN(deg)) return '';
        return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(deg / 45) % 8];
    }

    function uvLabel(uv) {
        if (uv == null) return '';
        if (uv < 3) return 'Bajo';
        if (uv < 6) return 'Moderado';
        if (uv < 8) return 'Alto';
        if (uv < 11) return 'Muy alto';
        return 'Extremo';
    }

    const es = (v, dec = 0) => Number(v).toLocaleString('es-ES', { maximumFractionDigits: dec });
    const hhmm = (d) => (d instanceof Date && !Number.isNaN(d.getTime()))
        ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
        : '--';

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
    }

    async function getJSON(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.error) throw new Error(data.reason || 'Error de Open-Meteo');
        return data;
    }

    function setNow(key, value) {
        document.querySelectorAll(`[data-now="${key}"]`).forEach((el) => { el.textContent = value; });
    }

    // ---------- Ahora mismo + próximas 24 h ----------

    async function loadForecast() {
        const panel = document.getElementById('now-panel');
        const strip = document.getElementById('hourly-strip');
        if (!panel && !strip) return;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}`
            + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility,is_day'
            + '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,is_day'
            + `&forecast_hours=24&timezone=${TZ}`;
        try {
            const data = await getJSON(url);
            renderNow(data.current);
            renderHourly(data.hourly);
        } catch (err) {
            if (panel) {
                setNow('estado', 'Datos en directo no disponibles ahora');
                panel.classList.add('is-error');
            }
            if (strip) strip.innerHTML = '<p class="hourly-loading">No se ha podido cargar la previsión por horas. Prueba a recargar en unos minutos.</p>';
        }
    }

    function renderNow(c) {
        if (!c) return;
        const sky = wmo(c.weather_code, c.is_day);
        setNow('icono', sky.icon);
        setNow('estado', sky.text);
        setNow('temp', es(c.temperature_2m));
        setNow('sensacion', es(c.apparent_temperature));
        setNow('humedad', es(c.relative_humidity_2m));
        setNow('viento', es(c.wind_speed_10m));
        setNow('dir', compass(c.wind_direction_10m));
        setNow('rachas', es(c.wind_gusts_10m));
        setNow('presion', es(c.pressure_msl));
        setNow('uv', es(c.uv_index, 1));
        setNow('uvlabel', uvLabel(c.uv_index));
        setNow('visibilidad', c.visibility != null ? es(c.visibility / 1000) : '--');
        setNow('nubes', es(c.cloud_cover));
        setNow('lluvia', es(c.precipitation, 1));
        setNow('hora', c.time ? `Datos de las ${c.time.slice(11, 16)}` : '');
    }

    function renderHourly(h) {
        const strip = document.getElementById('hourly-strip');
        if (!strip || !h || !Array.isArray(h.time)) return;
        strip.innerHTML = h.time.map((t, i) => {
            const sky = wmo(h.weather_code[i], h.is_day[i]);
            const prob = h.precipitation_probability[i];
            const mm = h.precipitation[i];
            const label = i === 0 ? 'Ahora' : t.slice(11, 16);
            return `
                <div class="hour-cell${i === 0 ? ' is-now' : ''}${t.slice(11, 13) === '00' ? ' is-midnight' : ''}" title="${escapeHTML(sky.text)}">
                    <span class="hour-time">${label}</span>
                    <span class="hour-icon" aria-label="${escapeHTML(sky.text)}">${sky.icon}</span>
                    <strong class="hour-temp">${es(h.temperature_2m[i])}°</strong>
                    <span class="hour-rain${prob >= 40 ? ' is-wet' : ''}">💧 ${prob ?? 0}%</span>
                    <span class="hour-mm">${mm > 0 ? `${es(mm, 1)} mm` : '&nbsp;'}</span>
                    <span class="hour-wind">${es(h.wind_speed_10m[i])} ${compass(h.wind_direction_10m[i])}</span>
                </div>`;
        }).join('');
    }

    // ---------- Polen ----------

    function pollenLevel(v, p) {
        if (v == null) return { label: 'Sin datos', cls: 'none' };
        if (v < 1) return { label: 'Nulo', cls: 'nulo' };
        if (v < p.moderado) return { label: 'Bajo', cls: 'bajo' };
        if (v < p.alto) return { label: 'Moderado', cls: 'moderado' };
        return { label: 'Alto', cls: 'alto' };
    }

    async function loadPollen() {
        const box = document.getElementById('pollen-panel');
        if (!box) return;
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}`
            + `&hourly=${POLLEN.map((p) => p.key).join(',')}&forecast_days=1&timezone=${TZ}`;
        try {
            const data = await getJSON(url);
            const rows = POLLEN.map((p) => {
                const values = (data.hourly[p.key] || []).filter((v) => v != null);
                const max = values.length ? Math.max(...values) : null;
                return { p, max, level: pollenLevel(max, p) };
            });
            box.innerHTML = rows.map(({ p, max, level }) => `
                <div class="pollen-row">
                    <span class="pollen-name">${p.icon} ${p.name}</span>
                    <span class="pollen-value">${max == null ? '—' : `${es(max, 1)} g/m³`}</span>
                    <span class="pollen-level lvl-${level.cls}">${level.label}</span>
                </div>`).join('');
        } catch (err) {
            // Se queda el dato estático que puso el build (olivo y gramíneas).
        }
    }

    // ---------- Sol y luna ----------

    const MOON_PHASES = [
        [0.03, 'Luna nueva', '🌑'], [0.22, 'Luna creciente', '🌒'], [0.28, 'Cuarto creciente', '🌓'],
        [0.47, 'Creciente gibosa', '🌔'], [0.53, 'Luna llena', '🌕'], [0.72, 'Menguante gibosa', '🌖'],
        [0.78, 'Cuarto menguante', '🌗'], [0.97, 'Luna menguante', '🌘'], [1.01, 'Luna nueva', '🌑']
    ];

    // Coloca el punto sobre el arco (curva cuadrática del SVG) según la
    // fracción recorrida entre la salida y la puesta.
    function placeOnArc(dot, frac) {
        if (!dot) return;
        if (frac == null || frac < 0 || frac > 1) { dot.style.display = 'none'; return; }
        const t = frac;
        const x = (1 - t) * (1 - t) * 20 + 2 * (1 - t) * t * 150 + t * t * 280;
        const y = (1 - t) * (1 - t) * 115 + 2 * (1 - t) * t * -35 + t * t * 115;
        dot.setAttribute('cx', x.toFixed(1));
        dot.setAttribute('cy', y.toFixed(1));
        dot.style.display = '';
    }

    function astroSet(key, value) {
        document.querySelectorAll(`[data-astro="${key}"]`).forEach((el) => { el.textContent = value; });
    }

    function durationText(ms) {
        const min = Math.round(ms / 60000);
        return `${Math.floor(min / 60)} h ${min % 60} min`;
    }

    function renderAstro() {
        const S = window.SunCalc;
        if (!S || !document.getElementById('astro-sun')) return;
        const now = new Date();
        const deg = (rad) => Math.round((rad * 180) / Math.PI);

        // Sol
        const sun = S.getTimes(now, LAT, LON);
        astroSet('sun-rise', hhmm(sun.sunrise));
        astroSet('sun-set', hhmm(sun.sunset));
        const dayLen = sun.sunset - sun.sunrise;
        const sunFrac = (now - sun.sunrise) / dayLen;
        placeOnArc(document.querySelector('[data-astro="sun-dot"]'), sunFrac);
        const sunAlt = deg(S.getPosition(now, LAT, LON).altitude);
        const sunState = sunFrac >= 0 && sunFrac <= 1
            ? `De día · altura ${sunAlt}° · ${durationText(dayLen)} de luz`
            : `De noche · ${durationText(dayLen)} de luz hoy`;
        astroSet('sun-state', sunState);

        // Luna: la puesta puede caer al día siguiente, así que se busca la
        // primera puesta posterior a la salida de hoy.
        const today = new Date(now); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
        const mt = S.getMoonTimes(today, LAT, LON);
        const mtNext = S.getMoonTimes(tomorrow, LAT, LON);
        const mtPrev = S.getMoonTimes(yesterday, LAT, LON);
        const rise = mt.rise || null;
        let set = null;
        if (rise) set = mt.set && mt.set > rise ? mt.set : mtNext.set || null;
        astroSet('moon-rise', rise ? hhmm(rise) : 'No sale hoy');
        astroSet('moon-set', set ? `${hhmm(set)}${set.getDate() !== now.getDate() ? ' (mañana)' : ''}` : (mt.set ? hhmm(mt.set) : '--'));

        // Para la posición sobre el arco vale cualquier intervalo
        // salida→puesta que contenga el momento actual (también el de anoche).
        let moonFrac = null;
        if (rise && set && now >= rise && now <= set) moonFrac = (now - rise) / (set - rise);
        else if (mtPrev.rise && mt.set && mt.set > mtPrev.rise && now <= mt.set) moonFrac = (now - mtPrev.rise) / (mt.set - mtPrev.rise);
        placeOnArc(document.querySelector('[data-astro="moon-dot"]'), moonFrac);

        const ill = S.getMoonIllumination(now);
        const phase = MOON_PHASES.find(([limit]) => ill.phase < limit) || MOON_PHASES[0];
        astroSet('moon-phase', `${phase[1]} · ${Math.round(ill.fraction * 100)} % iluminada`);
        astroSet('moon-icon', phase[2]);
        const moonAlt = deg(S.getMoonPosition(now, LAT, LON).altitude);
        astroSet('moon-state', moonAlt > 0 ? `· visible ahora a ${moonAlt}° de altura` : '· ahora bajo el horizonte');
    }

    // ---------- Municipios cercanos ----------

    async function loadNearby() {
        const grid = document.getElementById('nearby-grid');
        if (!grid) return;
        const url = 'https://api.open-meteo.com/v1/forecast'
            + `?latitude=${NEARBY.map((m) => m.lat).join(',')}&longitude=${NEARBY.map((m) => m.lon).join(',')}`
            + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=${TZ}`;
        try {
            const data = await getJSON(url);
            const list = Array.isArray(data) ? data : [data];
            grid.innerHTML = list.map((d, i) => {
                const m = NEARBY[i];
                const sky = wmo(d.daily.weather_code[0]);
                return `
                    <div class="nearby-card" title="${escapeHTML(sky.text)}">
                        <span class="nearby-icon" aria-hidden="true">${sky.icon}</span>
                        <div>
                            <strong>${escapeHTML(m.name)}</strong>
                            <span>${es(d.daily.temperature_2m_max[0])}° / ${es(d.daily.temperature_2m_min[0])}° · 💧 ${d.daily.precipitation_probability_max[0] ?? 0}%</span>
                        </div>
                    </div>`;
            }).join('');
        } catch (err) {
            grid.innerHTML = '<p class="hourly-loading">No se han podido cargar los municipios cercanos.</p>';
        }
    }

    function init() {
        loadForecast();
        loadPollen();
        loadNearby();
        renderAstro();
        // Refresco suave: condiciones actuales cada 15 min y astros cada minuto.
        setInterval(loadForecast, 15 * 60 * 1000);
        setInterval(renderAstro, 60 * 1000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
