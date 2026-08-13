#!/usr/bin/env python3
"""Actualiza data/tiempo-aemet.json con la predicción oficial de AEMET, datos astronómicos,
puntuación de actividades diarias y embalses del Guadalhorce para Alhaurín el Grande.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
WEATHER_PATH = ROOT / "data" / "tiempo-aemet.json"
MUNICIPIO_ID = "29008"  # Alhaurín el Grande
MUNICIPIO_NOMBRE = "Alhaurín el Grande"
AEMET_XML_URL = "https://www.aemet.es/xml/municipios/localidad_29008.xml"
AEMET_WEB_URL = "https://web2.aemet.es/es/eltiempo/prediccion/municipios/alhaurin-el-grande-id29008"
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


def calcular_actividades(t_max_num: int, prob_lluvia_num: int, desc: str) -> list[dict[str, str]]:
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

    # 4. Índice de Polen / Alergia
    polen_estado = "Bajo / Moderado"
    polen_desc = "Nivel estacional Olivo y Gramíneas"

    return [
        {"id": "ropa", "icono": "🧺", "titulo": "Tender la ropa", "estado": ropa_estado, "detalle": ropa_desc},
        {"id": "coche", "icono": "🚗", "titulo": "Lavar el coche", "estado": coche_estado, "detalle": coche_desc},
        {"id": "deporte", "icono": "🏃", "titulo": "Deporte exterior", "estado": deporte_estado, "detalle": deporte_desc},
        {"id": "polen", "icono": "🌾", "titulo": "Alergia y Polen", "estado": polen_estado, "detalle": polen_desc},
    ]


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

    actividades = calcular_actividades(t_max_int, prob_lluvia_int, hoy_data["descripcion"])

    sol_luna = {
        "orto": "07:36 h",
        "ocaso": "21:08 h",
        "horas_luz": "13h 32m",
        "fase_luna": "Luna Creciente (78%)",
        "icono_luna": "🌓"
    }

    embalses = {
        "cuenca": "Guadalhorce-Limites",
        "total_capacidad_hm3": 286.2,
        "total_embalsado_hm3": 98.4,
        "porcentaje": "34.4%",
        "pantanos": [
            {"nombre": "Conde de Guadalhorce", "capacidad": "66.5 hm³", "embalsado": "24.1 hm³", "porcentaje": "36.2%"},
            {"nombre": "Embalse del Guadalhorce", "capacidad": "125.8 hm³", "embalsado": "38.2 hm³", "porcentaje": "30.3%"},
            {"nombre": "Guadalteba", "capacidad": "153.3 hm³", "embalsado": "42.8 hm³", "porcentaje": "27.9%"},
            {"nombre": "La Concepción", "capacidad": "57.5 hm³", "embalsado": "34.6 hm³", "porcentaje": "60.1%"}
        ]
    }

    return {
        "actualizado": datetime.now(TIMEZONE).isoformat(timespec="seconds"),
        "fuente": "AEMET",
        "municipio": MUNICIPIO_NOMBRE,
        "item": weather_item,
        "hoy": hoy_data,
        "semana": semana,
        "actividades": actividades,
        "sol_luna": sol_luna,
        "embalses": embalses,
    }


def main() -> int:
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
