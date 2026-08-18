#!/usr/bin/env python3
"""Actualiza data/tiempo-aemet.json con la predicción oficial de AEMET, datos astronómicos,
puntuación de actividades diarias y embalses del Guadalhorce para Alhaurín el Grande.
"""

from __future__ import annotations

import json
import math
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
WEATHER_PATH = ROOT / "data" / "tiempo-aemet.json"
MUNICIPIO_ID = "29008"  # Alhaurín el Grande
MUNICIPIO_NOMBRE = "Alhaurín el Grande"
AEMET_XML_URL = "https://www.aemet.es/xml/municipios/localidad_29008.xml"
AEMET_WEB_URL = "https://web2.aemet.es/es/eltiempo/prediccion/municipios/alhaurin-el-grande-id29008"
AEMET_OPENDATA_BASE = "https://opendata.aemet.es/opendata"
COORDS = {"lat": 36.6403, "lon": -4.6892}  # Alhaurín el Grande
SAIH_EMBALSES_URL = "https://www.redhidrosurmedioambiente.es/saih/informe/embalses"
# AEMET no publica datos de polen en su OpenData (revisado su catálogo
# completo: Observación, Predicción, Avisos, Radar, Climatología... nada de
# polen). El organismo oficial en España es la Red Española de Aerobiología
# (REA, Universidad de Córdoba), que no tiene API pública, solo web. Se usa
# en su lugar Open-Meteo Air Quality API (CAMS European Air Quality,
# gratuita y sin clave) — cubre gramíneas y olivo, que es lo que ya se venía
# mostrando. Solo disponible en Europa y en temporada de polinización.
POLEN_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
# Umbrales oficiales de la REA (granos/m³, media diaria): <1 nulo, resto por
# tramos según alergenicidad de cada especie (el olivo es menos alergénico
# a igual concentración que las gramíneas, de ahí umbrales más altos).
POLEN_UMBRALES = {
    "gramineas": {"moderado": 10, "alto": 50},
    "olivo": {"moderado": 50, "alto": 200},
}
# ids de estación SAIH Hidrosur -> nombre a mostrar (mismos 4 embalses que antes,
# ahora con datos reales en vez de constantes fijas en el código).
SAIH_EMBALSES_IDS = {
    "31": "Conde de Guadalhorce",
    "30": "Embalse del Guadalhorce",
    "29": "Guadalteba",
    "16": "La Concepción",
}
TIMEZONE = ZoneInfo("Europe/Madrid")

DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

SKY_ICONS = {
    "11": "☀️",
    "11n": "🌙",
    "12": "🌤️",
    "12n": "🌙",
    "13": "⛅",
    "13n": "☁️",
    "14": "☁️",
    "15": "☁️",
    "16": "🌧️",
    "17": "☁️",
    "43": "🌧️",
    "44": "🌧️",
    "45": "🌧️",
    "46": "🌧️",
    "51": "🌩️",
    "52": "🌩️",
    "53": "🌩️",
    "54": "🌩️",
}


def log(message: str) -> None:
    print(f"[tiempo-aemet] {message}")


def obtener_icono_cielo(code: str, desc: str) -> str:
    code_clean = str(code or "").strip()
    if code_clean in SKY_ICONS:
        return SKY_ICONS[code_clean]
    desc_lower = str(desc or "").lower()
    if "lluvia" in desc_lower or "chubasco" in desc_lower:
        return "🌧️"
    if "tormenta" in desc_lower:
        return "🌩️"
    if "intervalos" in desc_lower:
        return "⛅"
    if "nuboso" in desc_lower:
        return "☁️"
    if "poco nuboso" in desc_lower:
        return "🌤️"
    return "☀️"


def clasificar_polen(valor: float | None, umbrales: dict[str, float]) -> str:
    if valor is None:
        return "Sin datos"
    if valor < 1:
        return "Nulo"
    if valor < umbrales["moderado"]:
        return "Bajo"
    if valor < umbrales["alto"]:
        return "Moderado"
    return "Alto"


def calcular_actividades(t_max_num: int, prob_lluvia_num: int, desc: str, polen: dict[str, Any] | None) -> list[dict[str, str]]:
    # 1. Tender la ropa
    if prob_lluvia_num < 20 and t_max_num > 20:
        ropa_estado = "Excelente"
        ropa_desc = "Secado muy rápido al sol (0% riesgo)"
    elif prob_lluvia_num < 40:
        ropa_estado = "Aceptable"
        ropa_desc = "Vigilar nubosidad por la tarde"
    else:
        ropa_estado = "Desaconsejado"
        ropa_desc = "Riesgo de precipitaciones"

    # 2. Lavar el coche
    if prob_lluvia_num < 15 and "polvo" not in desc.lower():
        coche_estado = "Muy recomendado"
        coche_desc = "Cielo limpio y sin calima"
    else:
        coche_estado = "Espera unos días"
        coche_desc = "Posible barro o lluvia"

    # 3. Deporte al aire libre
    if t_max_num > 33:
        deporte_estado = "Horas frescas"
        deporte_desc = "Evitar 13:00 a 19:00 h por calor"
    elif t_max_num > 25:
        deporte_estado = "Favorable"
        deporte_desc = "Ideal mañanas y atardecer"
    else:
        deporte_estado = "Ideal todo el día"
        deporte_desc = "Temperatura perfecta"

    # 4. Índice de Polen / Alergia (datos reales de Open-Meteo Air Quality,
    # ver fetch_polen — AEMET no publica polen, ver comentario en POLEN_URL)
    gramineas = polen.get("gramineas") if polen else None
    olivo = polen.get("olivo") if polen else None

    if gramineas is None and olivo is None:
        polen_estado = "Sin datos"
        polen_desc = "Fuera de temporada de polinización o dato no disponible ahora mismo"
        polen_extra: dict[str, float] = {}
    else:
        nivel_gramineas = clasificar_polen(gramineas, POLEN_UMBRALES["gramineas"])
        nivel_olivo = clasificar_polen(olivo, POLEN_UMBRALES["olivo"])
        orden_severidad = {"Sin datos": 0, "Nulo": 0, "Bajo": 1, "Moderado": 2, "Alto": 3}
        polen_estado = max([nivel_gramineas, nivel_olivo], key=lambda n: orden_severidad[n])
        partes = []
        if olivo is not None:
            partes.append(f"Olivo: {nivel_olivo} ({olivo:.1f} granos/m³)")
        if gramineas is not None:
            partes.append(f"Gramíneas: {nivel_gramineas} ({gramineas:.1f} granos/m³)")
        polen_desc = " · ".join(partes)
        polen_extra = {"gramineas": gramineas, "olivo": olivo}

    return [
        {"id": "ropa", "icono": "🧺", "titulo": "Tender la ropa", "estado": ropa_estado, "detalle": ropa_desc},
        {"id": "coche", "icono": "🚗", "titulo": "Lavar el coche", "estado": coche_estado, "detalle": coche_desc},
        {"id": "deporte", "icono": "🏃", "titulo": "Deporte exterior", "estado": deporte_estado, "detalle": deporte_desc},
        {"id": "polen", "icono": "🌾", "titulo": "Alergia y Polen", "estado": polen_estado, "detalle": polen_desc, "fuente": "Open-Meteo (CAMS)", **polen_extra},
    ]


def cargar_polen_previo() -> dict[str, Any] | None:
    """Si Open-Meteo falla, reutiliza el último dato válido en vez de
    mostrar "Sin datos" por un simple fallo de red puntual."""
    try:
        previo = json.loads(WEATHER_PATH.read_text(encoding="utf-8"))
        for item in previo.get("actividades") or []:
            if item.get("id") == "polen" and ("gramineas" in item or "olivo" in item):
                return {"gramineas": item.get("gramineas"), "olivo": item.get("olivo")}
    except Exception:
        return None
    return None


def fetch_polen() -> dict[str, Any] | None:
    """Nivel actual de polen de gramíneas y olivo (granos/m³) vía Open-Meteo
    Air Quality API — ver POLEN_URL para el porqué de esta fuente en vez de
    AEMET. Devuelve None si la petición falla; devuelve valores None por
    especie (no toda la llamada) si está fuera de temporada de polinización,
    que es un resultado válido de la API, no un error."""
    params = urllib.parse.urlencode({
        "latitude": COORDS["lat"],
        "longitude": COORDS["lon"],
        "hourly": "grass_pollen,olive_pollen",
        "timezone": "Europe/Madrid",
        "forecast_days": 1,
    })
    req = urllib.request.Request(
        f"{POLEN_URL}?{params}",
        headers={"User-Agent": "Mozilla/5.0 (AlhaurinAlDia/1.0)", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        log(f"Error obteniendo polen de Open-Meteo: {exc}")
        return None

    hourly = data.get("hourly") or {}
    horas = hourly.get("time") or []
    if not horas:
        log("Open-Meteo no devolvió serie horaria de polen.")
        return None

    serie_gramineas = hourly.get("grass_pollen") or []
    serie_olivo = hourly.get("olive_pollen") or []

    ahora = datetime.now(TIMEZONE).strftime("%Y-%m-%dT%H:00")
    try:
        idx = horas.index(ahora)
    except ValueError:
        idx = 0  # fallback: primera hora de la serie si no hay match exacto

    gramineas = serie_gramineas[idx] if idx < len(serie_gramineas) else None
    olivo = serie_olivo[idx] if idx < len(serie_olivo) else None

    return {"gramineas": gramineas, "olivo": olivo}


def cargar_embalses_previos() -> dict[str, Any] | None:
    """Si el scraping de SAIH Hidrosur falla, reutiliza el último bloque válido
    en vez de mostrar un dato inventado bajo una etiqueta de fuente oficial."""
    try:
        previo = json.loads(WEATHER_PATH.read_text(encoding="utf-8"))
        return previo.get("embalses")
    except Exception:
        return None


def fetch_embalses() -> dict[str, Any] | None:
    """Datos reales de los embalses del sistema Guadalhorce vía SAIH Hidrosur
    (Junta de Andalucía, red oficial de estaciones automáticas, sin login)."""
    try:
        req = urllib.request.Request(
            SAIH_EMBALSES_URL,
            headers={"User-Agent": "Mozilla/5.0 (AlhaurinAlDia/1.0)"},
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            html_text = response.read().decode("utf-8", errors="replace")
    except Exception as exc:
        log(f"Error obteniendo embalses de SAIH Hidrosur: {exc}")
        return None

    # Cada fila de la tabla: <td>ID NOMBRE</td><td>capacidad</td><td>embalsado</td><td>%</td>...
    row_re = re.compile(
        r"<td>\s*(\d+)\s+EMBALSE[^<]*</td>\s*<td>([\d.,]+)</td>\s*<td>([\d.,]+)</td>\s*<td>([\d.,]+)</td>",
        re.IGNORECASE,
    )

    encontrados: dict[str, dict[str, Any]] = {}
    for match in row_re.finditer(html_text):
        estacion_id, capacidad_str, embalsado_str, porcentaje_str = match.groups()
        if estacion_id not in SAIH_EMBALSES_IDS:
            continue
        try:
            capacidad = float(capacidad_str.replace(",", "."))
            embalsado = float(embalsado_str.replace(",", "."))
            porcentaje = float(porcentaje_str.replace(",", "."))
        except ValueError:
            continue
        encontrados[estacion_id] = {
            "nombre": SAIH_EMBALSES_IDS[estacion_id],
            "capacidad": f"{capacidad:.1f} hm³",
            "embalsado": f"{embalsado:.1f} hm³",
            "porcentaje": f"{porcentaje:.1f}%",
            "_capacidad_hm3": capacidad,
            "_embalsado_hm3": embalsado,
        }

    if len(encontrados) != len(SAIH_EMBALSES_IDS):
        log(f"Solo se reconocieron {len(encontrados)}/{len(SAIH_EMBALSES_IDS)} embalses en SAIH Hidrosur, se descarta el scrape.")
        return None

    pantanos = []
    total_capacidad = 0.0
    total_embalsado = 0.0
    # Mismo orden que antes: Conde de Guadalhorce, Embalse del Guadalhorce, Guadalteba, La Concepción.
    for estacion_id in ["31", "30", "29", "16"]:
        p = encontrados[estacion_id]
        total_capacidad += p["_capacidad_hm3"]
        total_embalsado += p["_embalsado_hm3"]
        pantanos.append({
            "nombre": p["nombre"],
            "capacidad": p["capacidad"],
            "embalsado": p["embalsado"],
            "porcentaje": p["porcentaje"],
        })

    total_porcentaje = (total_embalsado / total_capacidad * 100) if total_capacidad else 0.0

    return {
        "cuenca": "Guadalhorce-Limites",
        "fuente": "SAIH Hidrosur (Junta de Andalucía)",
        "fuente_url": SAIH_EMBALSES_URL,
        "total_capacidad_hm3": round(total_capacidad, 1),
        "total_embalsado_hm3": round(total_embalsado, 1),
        "porcentaje": f"{total_porcentaje:.1f}%",
        "pantanos": pantanos,
    }


def fetch_xml_forecast() -> dict[str, Any] | None:
    req = urllib.request.Request(
        AEMET_XML_URL,
        headers={"User-Agent": "Mozilla/5.0 (AlhaurinAlDia/1.0)"},
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        xml_data = response.read()

    root = ET.fromstring(xml_data)
    dias = root.findall(".//dia")
    if not dias:
        return None

    semana = []
    hoy_data = None

    for idx, dia in enumerate(dias[:7]):
        fecha_str = dia.attrib.get("fecha", "")
        try:
            dt = datetime.strptime(fecha_str, "%Y-%m-%d")
            dia_nombre = DIAS_SEMANA[dt.weekday()]
            fecha_corta = f"{dt.day}/{dt.month}"
        except Exception:
            dia_nombre = f"Día {idx+1}"
            fecha_corta = fecha_str

        t_max = dia.findtext(".//temperatura/maxima", "N/A")
        t_min = dia.findtext(".//temperatura/minima", "N/A")
        uv = dia.findtext(".//uv_max", "")

        sky_elem = dia.find(".//estado_cielo")
        sky_desc = sky_elem.attrib.get("descripcion", "") if sky_elem is not None else ""
        sky_code = sky_elem.text if sky_elem is not None else ""
        icono = obtener_icono_cielo(sky_code, sky_desc)

        prob_elem = dia.find(".//prob_precipitacion")
        prob_lluvia = prob_elem.text if (prob_elem is not None and prob_elem.text) else "0"

        viento_elem = dia.find(".//viento")
        v_dir = viento_elem.findtext("direccion", "") if viento_elem is not None else ""
        v_vel = viento_elem.findtext("velocidad", "") if viento_elem is not None else ""
        viento_str = f"{v_dir} {v_vel} km/h".strip() if v_vel else "Flojo"

        item_dia = {
            "fecha": fecha_str,
            "dia_semana": dia_nombre,
            "fecha_corta": fecha_corta,
            "t_max": t_max,
            "t_min": t_min,
            "icono": icono,
            "descripcion": sky_desc or "Despejado",
            "lluvia": f"{prob_lluvia}%",
            "viento": viento_str,
            "uv": uv,
        }

        semana.append(item_dia)
        if idx == 0:
            hoy_data = item_dia

    if not hoy_data:
        return None

    return construir_resultado(hoy_data, semana, fuente_prediccion="AEMET XML (municipios)")


def calcular_orto_ocaso(fecha: date, lat: float, lon: float, tz_offset_hours: float) -> tuple[str | None, str | None]:
    """Algoritmo clásico de orto/ocaso (Almanac for Computers, 1990), sin dependencias.
    Precisión de ±1-2 minutos, suficiente para un widget informativo."""

    def calc(is_sunrise: bool) -> str | None:
        n = fecha.timetuple().tm_yday
        lng_hour = lon / 15
        t = n + ((6 - lng_hour) / 24 if is_sunrise else (18 - lng_hour) / 24)

        m = 0.9856 * t - 3.289
        l = m + 1.916 * math.sin(math.radians(m)) + 0.020 * math.sin(math.radians(2 * m)) + 282.634
        l = l % 360

        ra = math.degrees(math.atan(0.91764 * math.tan(math.radians(l)))) % 360
        l_quadrant = math.floor(l / 90) * 90
        ra_quadrant = math.floor(ra / 90) * 90
        ra = (ra + (l_quadrant - ra_quadrant)) / 15

        sin_dec = 0.39782 * math.sin(math.radians(l))
        cos_dec = math.cos(math.asin(sin_dec))
        cos_h = (math.cos(math.radians(90.833)) - (sin_dec * math.sin(math.radians(lat)))) / (
            cos_dec * math.cos(math.radians(lat))
        )
        if cos_h > 1 or cos_h < -1:
            return None  # el sol no sale/se pone ese día a esta latitud (no aplica en Alhaurín)

        h = (360 - math.degrees(math.acos(cos_h))) if is_sunrise else math.degrees(math.acos(cos_h))
        h = h / 15

        t_local = h + ra - (0.06571 * t) - 6.622
        ut = (t_local - lng_hour) % 24
        local_t = (ut + tz_offset_hours) % 24
        hh = int(local_t)
        mm = int(round((local_t - hh) * 60))
        if mm == 60:
            mm = 0
            hh = (hh + 1) % 24
        return f"{hh:02d}:{mm:02d}"

    return calc(True), calc(False)


def calcular_fase_lunar(fecha: date) -> tuple[str, str]:
    """Edad lunar por ciclo sinódico desde una luna nueva de referencia conocida.
    Sin dependencias, precisión de horas, suficiente para mostrar la fase (AEMET
    no publica fase lunar en ningún endpoint).

    El modelo de mes sinódico medio (29.530588853 días) acumula deriva con el
    tiempo porque el mes sinódico real varía unas horas por la órbita elíptica;
    usar como referencia una luna nueva del año 2000 acumulaba ya ~12h de error
    en 2026 (329 ciclos). Se ancla en la luna nueva real más reciente conocida
    (12 ago 2026, 17:36 UTC, coincide con el eclipse solar total de esa fecha,
    verificado por triangulación de fuentes) para minimizar la deriva mientras
    esta fecha se mantenga cercana; conviene refrescar esta constante cada
    1-2 años con una luna nueva real actualizada."""
    luna_nueva_ref = datetime(2026, 8, 12, 17, 36)
    dias_transcurridos = (datetime(fecha.year, fecha.month, fecha.day) - luna_nueva_ref).total_seconds() / 86400
    ciclo_sinodico = 29.530588853
    edad = dias_transcurridos % ciclo_sinodico
    porcentaje = round((1 - math.cos(2 * math.pi * edad / ciclo_sinodico)) / 2 * 100)

    fases = [
        (1.84566, "Luna Nueva", "🌑"),
        (5.53699, "Luna Creciente", "🌒"),
        (9.22831, "Cuarto Creciente", "🌓"),
        (12.91963, "Luna Gibosa Creciente", "🌔"),
        (16.61096, "Luna Llena", "🌕"),
        (20.30228, "Luna Gibosa Menguante", "🌖"),
        (23.99361, "Cuarto Menguante", "🌗"),
        (27.68493, "Luna Menguante", "🌘"),
    ]
    nombre, icono = "Luna Nueva", "🌑"
    for limite, nombre_fase, icono_fase in fases:
        if edad < limite:
            nombre, icono = nombre_fase, icono_fase
            break

    return f"{nombre} ({porcentaje}%)", icono


def fetch_opendata_orto_ocaso(api_key: str) -> tuple[str, str] | None:
    """Orto/ocaso reales de AEMET OpenData. A diferencia de la predicción diaria,
    estos campos solo están en el endpoint de predicción HORARIA."""
    endpoint = f"{AEMET_OPENDATA_BASE}/api/prediccion/especifica/municipio/horaria/{MUNICIPIO_ID}"
    req = urllib.request.Request(
        f"{endpoint}?api_key={api_key}",
        headers={"User-Agent": "Mozilla/5.0 (AlhaurinAlDia/1.0)", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        wrapper = json.loads(response.read().decode("utf-8"))

    if str(wrapper.get("estado")) != "200" or not wrapper.get("datos"):
        raise RuntimeError(f"AEMET OpenData (horaria) respondió estado={wrapper.get('estado')}: {wrapper.get('descripcion')}")

    datos_req = urllib.request.Request(
        wrapper["datos"],
        headers={"User-Agent": "Mozilla/5.0 (AlhaurinAlDia/1.0)"},
    )
    with urllib.request.urlopen(datos_req, timeout=15) as response:
        raw = response.read()
    try:
        payload = json.loads(raw.decode("utf-8"))
    except UnicodeDecodeError:
        payload = json.loads(raw.decode("iso-8859-15"))

    municipio_data = payload[0] if isinstance(payload, list) else payload
    dias = (municipio_data.get("prediccion") or {}).get("dia") or []
    if not dias:
        return None

    orto = dias[0].get("orto")
    ocaso = dias[0].get("ocaso")
    if not orto or not ocaso:
        return None
    return orto, ocaso


def obtener_sol_luna() -> dict[str, Any]:
    fecha_hoy = datetime.now(TIMEZONE).date()
    tz_offset = datetime.now(TIMEZONE).utcoffset().total_seconds() / 3600

    orto = ocaso = None
    api_key = os.environ.get("AEMET_API_KEY", "").strip()
    if api_key:
        try:
            resultado = fetch_opendata_orto_ocaso(api_key)
            if resultado:
                orto, ocaso = resultado
                log(f"Orto/ocaso vía AEMET OpenData: {orto} / {ocaso}")
            else:
                log("AEMET OpenData (horaria) no devolvió orto/ocaso utilizable, se calcula.")
        except Exception as exc:
            log(f"Error obteniendo orto/ocaso de AEMET OpenData, se calcula: {exc}")

    if not orto or not ocaso:
        orto, ocaso = calcular_orto_ocaso(fecha_hoy, COORDS["lat"], COORDS["lon"], tz_offset)
        log(f"Orto/ocaso calculado: {orto} / {ocaso}")

    horas_luz = "N/D"
    if orto and ocaso:
        try:
            h1, m1 = (int(x) for x in orto.split(":")[:2])
            h2, m2 = (int(x) for x in ocaso.split(":")[:2])
            minutos = (h2 * 60 + m2) - (h1 * 60 + m1)
            horas_luz = f"{minutos // 60}h {minutos % 60:02d}m"
        except Exception:
            pass

    fase_luna, icono_luna = calcular_fase_lunar(fecha_hoy)

    return {
        "orto": f"{orto} h" if orto else "N/D",
        "ocaso": f"{ocaso} h" if ocaso else "N/D",
        "horas_luz": horas_luz,
        "fase_luna": fase_luna,
        "icono_luna": icono_luna,
    }


def construir_resultado(hoy_data: dict[str, Any], semana: list[dict[str, Any]], fuente_prediccion: str) -> dict[str, Any]:
    """Ensambla el JSON final a partir de la predicción diaria (hoy + semana),
    sea cual sea el origen (OpenData o el XML público). Actividades, sol/luna y
    embalses no dependen de qué endpoint de AEMET se haya usado."""
    detail_parts = [hoy_data["descripcion"]]
    if hoy_data["t_max"] != "N/A" or hoy_data["t_min"] != "N/A":
        detail_parts.append(f"Máx. {hoy_data['t_max']}º / Mín. {hoy_data['t_min']}º")
    if hoy_data["lluvia"]:
        detail_parts.append(f"Lluvia {hoy_data['lluvia']}")

    weather_item = {
        "id": "tiempo",
        "icono": hoy_data["icono"],
        "titulo": "Tiempo",
        "valor": f"Máx. {hoy_data['t_max']}º",
        "detalle": " · ".join(detail_parts),
        "estado": "ok",
        "fuente": "AEMET",
        "cta": "Ver AEMET",
        "url": AEMET_WEB_URL,
    }

    try:
        t_max_int = int(hoy_data["t_max"])
    except Exception:
        t_max_int = 30

    try:
        prob_lluvia_int = int(hoy_data["lluvia"].replace("%", ""))
    except Exception:
        prob_lluvia_int = 0

    polen = fetch_polen() or cargar_polen_previo()
    actividades = calcular_actividades(t_max_int, prob_lluvia_int, hoy_data["descripcion"], polen)

    sol_luna = obtener_sol_luna()

    embalses = fetch_embalses() or cargar_embalses_previos()

    return {
        "actualizado": datetime.now(TIMEZONE).isoformat(timespec="seconds"),
        "fuente": "AEMET",
        "fuente_prediccion": fuente_prediccion,
        "municipio": MUNICIPIO_NOMBRE,
        "item": weather_item,
        "hoy": hoy_data,
        "semana": semana,
        "actividades": actividades,
        "sol_luna": sol_luna,
        "embalses": embalses,
    }


def _valor_periodo(lista: list[dict[str, Any]] | None, campo: str, periodo_preferido: str = "00-24") -> str:
    """De una lista de entradas {value/velocidad/..., periodo} de OpenData,
    devuelve el valor del periodo que cubre el día completo si existe,
    si no el primero disponible."""
    if not lista:
        return ""
    for entry in lista:
        if entry.get("periodo") == periodo_preferido and entry.get(campo):
            return str(entry.get(campo))
    for entry in lista:
        if entry.get(campo):
            return str(entry.get(campo))
    return ""


def fetch_opendata_forecast(api_key: str) -> dict[str, Any] | None:
    """Predicción diaria por municipio vía AEMET OpenData (requiere API key).
    Patrón de la API: la primera petición devuelve un JSON pequeño con la URL
    real de los datos en el campo "datos", que hay que volver a pedir.
    """
    endpoint = f"{AEMET_OPENDATA_BASE}/api/prediccion/especifica/municipio/diaria/{MUNICIPIO_ID}"
    req = urllib.request.Request(
        f"{endpoint}?api_key={api_key}",
        headers={"User-Agent": "Mozilla/5.0 (AlhaurinAlDia/1.0)", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        wrapper = json.loads(response.read().decode("utf-8"))

    if str(wrapper.get("estado")) != "200" or not wrapper.get("datos"):
        raise RuntimeError(f"AEMET OpenData respondió estado={wrapper.get('estado')}: {wrapper.get('descripcion')}")

    datos_req = urllib.request.Request(
        wrapper["datos"],
        headers={"User-Agent": "Mozilla/5.0 (AlhaurinAlDia/1.0)"},
    )
    with urllib.request.urlopen(datos_req, timeout=15) as response:
        raw = response.read()
    try:
        payload = json.loads(raw.decode("utf-8"))
    except UnicodeDecodeError:
        # El endpoint de datos de AEMET a veces sirve el JSON en latin-1/ISO-8859-15.
        payload = json.loads(raw.decode("iso-8859-15"))

    municipio_data = payload[0] if isinstance(payload, list) else payload
    dias = (municipio_data.get("prediccion") or {}).get("dia") or []
    if not dias:
        return None

    semana = []
    hoy_data = None

    for idx, dia in enumerate(dias[:7]):
        fecha_str = str(dia.get("fecha", ""))[:10]
        try:
            dt = datetime.strptime(fecha_str, "%Y-%m-%d")
            dia_nombre = DIAS_SEMANA[dt.weekday()]
            fecha_corta = f"{dt.day}/{dt.month}"
        except Exception:
            dia_nombre = f"Día {idx+1}"
            fecha_corta = fecha_str

        temperatura = dia.get("temperatura") or {}
        t_max = temperatura.get("maxima", "N/A")
        t_min = temperatura.get("minima", "N/A")
        uv = dia.get("uvMax", "")

        sky_value = _valor_periodo(dia.get("estadoCielo"), "value")
        sky_desc = _valor_periodo(dia.get("estadoCielo"), "descripcion")
        icono = obtener_icono_cielo(sky_value, sky_desc)

        prob_lluvia = _valor_periodo(dia.get("probPrecipitacion"), "value") or "0"

        v_dir = _valor_periodo(dia.get("viento"), "direccion")
        v_vel = _valor_periodo(dia.get("viento"), "velocidad")
        viento_str = f"{v_dir} {v_vel} km/h".strip() if v_vel else "Flojo"

        item_dia = {
            "fecha": fecha_str,
            "dia_semana": dia_nombre,
            "fecha_corta": fecha_corta,
            "t_max": str(t_max),
            "t_min": str(t_min),
            "icono": icono,
            "descripcion": sky_desc or "Despejado",
            "lluvia": f"{prob_lluvia}%",
            "viento": viento_str,
            "uv": str(uv) if uv != "" else "",
        }

        semana.append(item_dia)
        if idx == 0:
            hoy_data = item_dia

    if not hoy_data:
        return None

    return construir_resultado(hoy_data, semana, fuente_prediccion="AEMET OpenData (predicción municipal)")


def main() -> int:
    api_key = os.environ.get("AEMET_API_KEY", "").strip()

    if api_key:
        try:
            data = fetch_opendata_forecast(api_key)
            if data:
                WEATHER_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                log(f"Tiempo actualizado vía AEMET OpenData: {data['hoy']['t_max']}° / {data['hoy']['t_min']}°C · {data['hoy']['descripcion']}")
                return 0
            log("AEMET OpenData no devolvió predicción utilizable, se prueba el XML público.")
        except Exception as exc:
            log(f"Error actualizando tiempo vía AEMET OpenData: {exc}. Se prueba el XML público.")
    else:
        log("Sin AEMET_API_KEY configurada, se usa el XML público de AEMET.")

    try:
        data = fetch_xml_forecast()
        if data:
            WEATHER_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            log(f"Tiempo actualizado vía AEMET XML: {data['hoy']['t_max']}° / {data['hoy']['t_min']}°C · {data['hoy']['descripcion']}")
            return 0
    except Exception as exc:
        log(f"Error actualizando tiempo vía XML AEMET: {exc}")

    log("Se conserva el último data/tiempo-aemet.json válido.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
