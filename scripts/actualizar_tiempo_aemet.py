#!/usr/bin/env python3
"""Actualiza data/tiempo-aemet.json con la predicción oficial de AEMET para Alhaurín el Grande.

Obtiene la predicción diaria de 7 días vía XML oficial público (id29008) y/o la API OpenData.
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

    return {
        "actualizado": datetime.now(TIMEZONE).isoformat(timespec="seconds"),
        "fuente": "AEMET",
        "municipio": MUNICIPIO_NOMBRE,
        "item": weather_item,
        "hoy": hoy_data,
        "semana": semana,
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
