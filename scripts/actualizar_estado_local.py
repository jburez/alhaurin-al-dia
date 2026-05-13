#!/usr/bin/env python3
"""Actualiza data/estado-local.json con la predicción de AEMET para Alhaurín el Grande.

Requiere la variable de entorno AEMET_API_KEY.
El script está diseñado para GitHub Actions, pero también puede ejecutarse en local:

    AEMET_API_KEY=tu_clave python3 scripts/actualizar_estado_local.py

Si AEMET no responde o falta la API key, el script sale sin modificar el JSON para no romper el home.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = ROOT / "data" / "estado-local.json"
MUNICIPIO_ID = "29008"  # Alhaurín el Grande
AEMET_BASE = "https://opendata.aemet.es/opendata/api"
AEMET_WEB_URL = "https://web2.aemet.es/es/eltiempo/prediccion/municipios/alhaurin-el-grande-id29008"
TIMEZONE = ZoneInfo("Europe/Madrid")


def log(message: str) -> None:
    print(f"[estado-local] {message}")


def fetch_json(url: str, timeout: int = 25) -> Any:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "AlhaurinAlDia/1.0 (+https://alhaurinaldia.es)",
        },
    )

    with urllib.request.urlopen(request, timeout=timeout) as response:  # nosec B310 - URL controlada
        charset = response.headers.get_content_charset() or "utf-8"
        return json.loads(response.read().decode(charset))


def aemet_resource(path: str, api_key: str) -> Any:
    query = urllib.parse.urlencode({"api_key": api_key})
    metadata_url = f"{AEMET_BASE}{path}?{query}"
    metadata = fetch_json(metadata_url)

    if int(metadata.get("estado", 0)) >= 400 or not metadata.get("datos"):
        raise RuntimeError(metadata.get("descripcion") or "AEMET no devolvió URL de datos")

    return fetch_json(metadata["datos"])


def clean_text(value: Any) -> str:
    text = str(value or "").strip()
    return " ".join(text.split())


def pick_period_value(values: Any, preferred_periods: tuple[str, ...] = ("00-24", "12-18", "12", "13", "14")) -> str:
    if not isinstance(values, list) or not values:
        return ""

    normalized = [item for item in values if isinstance(item, dict)]

    for period in preferred_periods:
        for item in normalized:
            if str(item.get("periodo", "")) == period and item.get("value") not in (None, ""):
                return clean_text(item.get("value"))

    for item in normalized:
        if item.get("value") not in (None, ""):
            return clean_text(item.get("value"))

    return ""


def pick_sky_description(values: Any) -> str:
    if not isinstance(values, list) or not values:
        return ""

    normalized = [item for item in values if isinstance(item, dict)]

    for period in ("12-18", "00-24", "12", "13", "14", "15"):
        for item in normalized:
            description = clean_text(item.get("descripcion"))
            if str(item.get("periodo", "")) == period and description:
                return description

    for item in normalized:
        description = clean_text(item.get("descripcion"))
        if description:
            return description

    return ""


def first_day(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, list) or not payload:
        raise RuntimeError("Formato inesperado de AEMET: lista vacía")

    prediction = payload[0].get("prediccion", {})
    days = prediction.get("dia", [])
    if not isinstance(days, list) or not days:
        raise RuntimeError("Formato inesperado de AEMET: no hay días de predicción")

    return days[0]


def current_hour_temperature(hourly_payload: Any) -> str:
    try:
        day = first_day(hourly_payload)
    except Exception:
        return ""

    temps = day.get("temperatura", [])
    if not isinstance(temps, list) or not temps:
        return ""

    now_hour = datetime.now(TIMEZONE).hour
    normalized = [item for item in temps if isinstance(item, dict) and item.get("value") not in (None, "")]

    candidates: list[tuple[int, str]] = []
    for item in normalized:
        period = str(item.get("periodo", "")).strip()
        if not period.isdigit():
            continue
        hour = int(period)
        candidates.append((abs(hour - now_hour), clean_text(item.get("value"))))

    if not candidates:
        return ""

    candidates.sort(key=lambda item: item[0])
    return candidates[0][1]


def build_weather_item(daily_payload: Any, hourly_payload: Any | None = None) -> dict[str, Any]:
    day = first_day(daily_payload)

    sky = pick_sky_description(day.get("estadoCielo")) or "Previsión disponible"
    rain = pick_period_value(day.get("probPrecipitacion"))

    temperature = day.get("temperatura", {}) if isinstance(day.get("temperatura"), dict) else {}
    max_temp = clean_text(temperature.get("maxima"))
    min_temp = clean_text(temperature.get("minima"))
    current_temp = current_hour_temperature(hourly_payload) if hourly_payload is not None else ""

    value = f"{current_temp}º" if current_temp else (f"Máx. {max_temp}º" if max_temp else "Consultar")

    detail_parts = [sky]
    if max_temp or min_temp:
        temp_detail = " / ".join(part for part in [f"Máx. {max_temp}º" if max_temp else "", f"Mín. {min_temp}º" if min_temp else ""] if part)
        detail_parts.append(temp_detail)
    if rain:
        detail_parts.append(f"Lluvia {rain}%")

    return {
        "id": "tiempo",
        "icono": "☀️",
        "titulo": "Tiempo",
        "valor": value,
        "detalle": " · ".join(detail_parts),
        "estado": "ok",
        "fuente": "AEMET",
        "cta": "Ver AEMET",
        "url": AEMET_WEB_URL,
    }


def load_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        raise FileNotFoundError(f"No existe {STATE_PATH}")
    return json.loads(STATE_PATH.read_text(encoding="utf-8"))


def replace_item(items: list[dict[str, Any]], new_item: dict[str, Any]) -> list[dict[str, Any]]:
    replaced = False
    updated: list[dict[str, Any]] = []

    for item in items:
        if item.get("id") == new_item.get("id"):
            updated.append(new_item)
            replaced = True
        else:
            updated.append(item)

    if not replaced:
        updated.insert(0, new_item)

    return updated


def main() -> int:
    api_key = os.environ.get("AEMET_API_KEY", "").strip()
    if not api_key:
        log("AEMET_API_KEY no configurada. No se modifica el estado local.")
        return 0

    try:
        state = load_state()
        daily_payload = aemet_resource(f"/prediccion/especifica/municipio/diaria/{MUNICIPIO_ID}", api_key)

        try:
            hourly_payload = aemet_resource(f"/prediccion/especifica/municipio/horaria/{MUNICIPIO_ID}", api_key)
        except Exception as exc:  # horaria es mejora, no bloqueante
            log(f"No se pudo cargar predicción horaria: {exc}")
            hourly_payload = None

        weather_item = build_weather_item(daily_payload, hourly_payload)
        items = state.get("items", [])
        if not isinstance(items, list):
            items = []

        state["actualizado"] = datetime.now(TIMEZONE).isoformat(timespec="seconds")
        state["items"] = replace_item(items, weather_item)

        STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        log(f"Tiempo actualizado: {weather_item['valor']} · {weather_item['detalle']}")
        return 0

    except Exception as exc:
        log(f"No se pudo actualizar el tiempo: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
