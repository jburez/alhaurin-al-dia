"""Tests del lector genérico de fuentes de agenda (sin red).
Ejecutar con:  python3 tests/test_agenda_fuentes.py
"""
import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import actualizar_agenda_fuentes as af  # noqa: E402

fallos = []


def check(nombre, cond, detalle=""):
    print(f"{'OK' if cond else 'FALLA'} {nombre} {detalle}")
    if not cond:
        fallos.append(nombre)


FUENTE = {"id": "ayuntamiento", "nombre": "Ayuntamiento", "tipo": "wp-tribe", "url": "https://x/wp-json/tribe/events/v1/events", "alternativa": "https://x/?ical=1"}

print("=== 1. Normalización de The Events Calendar ===")
ev = af.normalize_tribe({
    "id": 77, "title": "Concierto &amp; coro", "description": "<p>Concierto en el teatro.</p>",
    "start_date": "2026-12-20 19:30:00", "end_date": "2026-12-20 21:00:00", "timezone": "Europe/Madrid",
    "venue": {"venue": "Teatro Antonio Gala", "address": "Calle X, 1", "city": "Alhaurín el Grande"},
    "cost": "5 €", "organizer": [{"organizer": "Área de Cultura"}], "url": "https://x/evento/77",
}, FUENTE)
check("id con prefijo de fuente", ev["id"] == "ayuntamiento-77")
check("título sin entidades", ev["titulo"] == "Concierto & coro")
check("hora con desfase de invierno", ev["inicio"] == "2026-12-20T19:30:00+01:00", ev["inicio"])
check("lugar y dirección", ev["lugar"] == "Teatro Antonio Gala" and ev["direccion"] == "Calle X, 1, Alhaurín el Grande")
check("precio y organizador", ev["precio"] == "5 €" and ev["organizador"] == "Área de Cultura")
check("fuente ayuntamiento", ev["fuente"] == "ayuntamiento")

print("\n=== 2. iCal ===")
ICS = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:abc@x\r\nSUMMARY:Feria de\r\n  artesanía\r\nDTSTART;TZID=Europe/Madrid:20271205T110000\r\nDTEND;TZID=Europe/Madrid:20271205T140000\r\nLOCATION:Plaza Baja\\, Alhaurín el Grande\r\nDESCRIPTION:Puestos\\nde artesanía\r\nURL:https://x/feria\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:old\r\nSUMMARY:Pasado\r\nDTSTART;VALUE=DATE:20200101\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
with patch.object(af, "http_get", return_value=(200, ICS)):
    evs = af.fetch_ical("https://x/?ical=1", FUENTE)
check("descarta eventos pasados", len(evs) == 1)
check("líneas plegadas unidas", evs[0]["titulo"] == "Feria de artesanía", evs[0]["titulo"])
check("TZID a ISO", evs[0]["inicio"] == "2027-12-05T11:00:00+01:00", evs[0]["inicio"])
check("lugar y dirección de LOCATION", evs[0]["lugar"] == "Plaza Baja" and evs[0]["direccion"] == "Alhaurín el Grande")

print("\n=== 3. Alternativa iCal cuando la API devuelve 0 eventos ===")
respuestas = iter([(200, '{"events": [], "total": 0, "total_pages": 0}'), (200, ICS)])
with patch.object(af, "http_get", side_effect=lambda url: next(respuestas)):
    evs = af.fetch_fuente(FUENTE)
check("usa la alternativa", len(evs) == 1 and evs[0]["titulo"] == "Feria de artesanía")

print()
if fallos:
    print(f"FALLOS: {fallos}")
    sys.exit(1)
print("Todos los tests pasan.")
