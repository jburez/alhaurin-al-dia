#!/usr/bin/env python3
"""Genera data/clima-alhaurin.json: normales climáticas 1991-2020 de Alhaurín el Grande.

Fuente: Open-Meteo Historical Weather API con el reanálisis CERRA (Copernicus,
malla de 5,5 km). Se usa CERRA y no ERA5 porque ERA5 (0,25°) suaviza el relieve
del Valle del Guadalhorce y subestima las máximas de verano unos 3 °C.

No forma parte del cron: las normales no cambian. Ejecutar a mano si se quiere
cambiar el periodo o las variables:  python3 scripts/generar_clima_alhaurin.py
"""
import json
import urllib.request
from datetime import date
from pathlib import Path

LAT, LON = 36.6439, -4.6892
INICIO, FIN = "1991-01-01", "2020-12-31"
ANIOS = 30
SALIDA = Path(__file__).resolve().parent.parent / "data" / "clima-alhaurin.json"
NOMBRES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio",
           "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]


def descargar():
    url = (
        "https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={LAT}&longitude={LON}&start_date={INICIO}&end_date={FIN}"
        "&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum"
        "&timezone=Europe%2FMadrid&models=cerra"
    )
    with urllib.request.urlopen(url, timeout=120) as resp:
        return json.load(resp)


def calcular(datos):
    d = datos["daily"]
    acum = [dict(tm=[], tx=[], tn=[], p=0.0, rd=0, fr=0, h35=0) for _ in range(12)]
    rec = {"t_max": {"valor": -99.0}, "t_min": {"valor": 99.0}, "lluvia_dia": {"valor": 0.0}}
    for i, fecha in enumerate(d["time"]):
        tx, tn = d["temperature_2m_max"][i], d["temperature_2m_min"][i]
        if tx is None or tn is None:
            continue
        p = d["precipitation_sum"][i] or 0.0
        o = acum[int(fecha[5:7]) - 1]
        o["tm"].append(d["temperature_2m_mean"][i])
        o["tx"].append(tx)
        o["tn"].append(tn)
        o["p"] += p
        o["rd"] += p >= 1
        o["fr"] += tn <= 0
        o["h35"] += tx >= 35
        if tx > rec["t_max"]["valor"]:
            rec["t_max"] = {"valor": tx, "fecha": fecha}
        if tn < rec["t_min"]["valor"]:
            rec["t_min"] = {"valor": tn, "fecha": fecha}
        if p > rec["lluvia_dia"]["valor"]:
            rec["lluvia_dia"] = {"valor": round(p, 1), "fecha": fecha}

    media = lambda xs: sum(xs) / len(xs)
    meses = [{
        "mes": k + 1,
        "nombre": NOMBRES[k],
        "t_media": round(media(o["tm"]), 1),
        "t_max": round(media(o["tx"]), 1),
        "t_min": round(media(o["tn"]), 1),
        "lluvia_mm": round(o["p"] / ANIOS),
        "dias_lluvia": round(o["rd"] / ANIOS, 1),
        "dias_helada": round(o["fr"] / ANIOS, 1),
        "dias_35": round(o["h35"] / ANIOS, 1),
    } for k, o in enumerate(acum)]
    anual = {
        "t_media": round(media([m["t_media"] for m in meses]), 1),
        "lluvia_mm": sum(m["lluvia_mm"] for m in meses),
        "dias_lluvia": round(sum(m["dias_lluvia"] for m in meses)),
        "dias_helada": round(sum(m["dias_helada"] for m in meses), 1),
        "dias_35": round(sum(m["dias_35"] for m in meses), 1),
    }
    return {
        "municipio": "Alhaurín el Grande",
        "periodo": f"{INICIO[:4]}-{FIN[:4]}",
        "lat": LAT,
        "lon": LON,
        "elevacion_m": datos.get("elevation"),
        "fuente": "Open-Meteo Historical Weather API · reanálisis CERRA (Copernicus, malla de 5,5 km)",
        "fuente_url": "https://open-meteo.com/en/docs/historical-weather-api",
        "nota": ("Valores medios de reanálisis para la celda de Alhaurín el Grande; no son medidas "
                 "de una estación oficial. Día de lluvia: ≥ 1 mm. Día de helada: mínima ≤ 0 °C."),
        "generado": date.today().isoformat(),
        "anual": anual,
        "meses": meses,
        "records": rec,
    }


if __name__ == "__main__":
    resultado = calcular(descargar())
    SALIDA.write_text(json.dumps(resultado, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{SALIDA} actualizado · media anual {resultado['anual']['t_media']} °C, "
          f"{resultado['anual']['lluvia_mm']} mm")
