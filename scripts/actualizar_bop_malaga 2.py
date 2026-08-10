#!/usr/bin/env python3
"""Actualiza data/boletin-oficial.json con los edictos del BOP Málaga
detectados en el buzón de correo personal del usuario, vía IMAP.

El BOP Málaga (BOPMA) no tiene RSS ni API pública. El dato llega empujado
por su servicio de "Lista de Correo Personalizada": una búsqueda guardada
en bopmalaga.es (ya filtrada por Alhaurín el Grande) envía por correo los
edictos nuevos cada día. Este script no repite el filtrado geográfico
porque ya lo hace esa búsqueda guardada.

Requiere un filtro de Gmail en la cuenta BOP_EMAIL_USER que etiquete los
correos de listacorreo@bopmalaga.es con la etiqueta IMAP `BOP-Malaga`
(ver docs/ARQUITECTURA.md, sección 14). El script solo lee esa etiqueta,
procesa los mensajes no leídos y los marca como leídos al terminar — así
no reprocesa el mismo correo en la siguiente ejecución.

Si faltan credenciales, IMAP falla, o no hay mensajes nuevos, conserva el
último data/boletin-oficial.json válido y sale con código 0, igual que
scripts/actualizar_avisos_aemet.py.
"""

from __future__ import annotations

import email
import imaplib
import json
import os
import re
import sys
from datetime import datetime, timezone
from email.header import decode_header
from email.message import Message
from email.utils import parseaddr
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOLETIN_PATH = ROOT / "data" / "boletin-oficial.json"

IMAP_HOST = "imap.gmail.com"
IMAP_LABEL = "BOP-Malaga"
REMITENTE_ESPERADO = "listacorreo@bopmalaga.es"
FUENTE_NOMBRE = "BOP Málaga"

SUBJECT_FECHA = re.compile(r"Alerta BOPMA del dia (\d{2})/(\d{2})/(\d{4})")
NUMERO_EDICTO = re.compile(r"Ver edicto\s+([\d/]+)")
EDICTO_ID_URL = re.compile(r"[?&]edicto=([^&]+)")
EXPEDIENTE = re.compile(r"[Ee]xpediente n[uú]mero:\s*([^\n.]+)")


def log(mensaje: str) -> None:
    print(f"[bop-malaga] {mensaje}")


class ParserEdictosHTML(HTMLParser):
    """Extrae edictos del cuerpo HTML de un correo BOPMA.

    Estructura observada (correo real del 2026-07-29): un <h2> por cada
    criterio de búsqueda guardado, un <h3> por organismo, y un <p> por
    edicto que termina con un enlace "Ver edicto NNNN/YYYY" a
    bopmalaga.es/edicto.php. El párrafo de baja del servicio no lleva
    ese enlace, así que se descarta por eso y no por su posición.
    """

    def __init__(self) -> None:
        super().__init__()
        self.criterio_actual = ""
        self.organismo_actual = ""
        self.edictos: list[dict] = []
        self._capturando: str | None = None
        self._buffer: list[str] = []
        self._enlace_actual: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("h2", "h3", "p"):
            self._capturando = tag
            self._buffer = []
            self._enlace_actual = None
        elif tag == "a" and self._capturando == "p":
            self._enlace_actual = dict(attrs).get("href")

    def handle_endtag(self, tag: str) -> None:
        if tag == "h2" and self._capturando == "h2":
            texto = "".join(self._buffer).strip()
            match = re.search(r'"([^"]+)"', texto)
            self.criterio_actual = match.group(1) if match else texto
        elif tag == "h3" and self._capturando == "h3":
            self.organismo_actual = "".join(self._buffer).strip()
        elif tag == "p" and self._capturando == "p":
            texto = "".join(self._buffer)
            if self._enlace_actual and "edicto.php" in self._enlace_actual:
                self.edictos.append({
                    "criterio_busqueda": self.criterio_actual,
                    "organismo": self.organismo_actual,
                    "texto": texto,
                    "enlace": self._enlace_actual,
                })
        if tag in ("h2", "h3", "p"):
            self._capturando = None

    def handle_data(self, data: str) -> None:
        if self._capturando:
            self._buffer.append(data)


def limpiar_texto(texto: str) -> str:
    sin_enlace = re.sub(r"\[Ver edicto[^\]]*\]\s*$", "", texto)
    return re.sub(r"\s+", " ", sin_enlace).strip()


def construir_edicto(bruto: dict, fecha_alerta: str, ahora: str) -> dict | None:
    id_match = EDICTO_ID_URL.search(bruto["enlace"])
    numero_match = NUMERO_EDICTO.search(bruto["texto"])
    if not id_match or not numero_match:
        return None

    resumen = limpiar_texto(bruto["texto"])
    expediente_match = EXPEDIENTE.search(resumen)

    return {
        "id": f"bop-{id_match.group(1)}",
        "numero_edicto": numero_match.group(1).strip(),
        "organismo": bruto["organismo"],
        "criterio_busqueda": bruto["criterio_busqueda"],
        "expediente": expediente_match.group(1).strip() if expediente_match else "",
        "resumen": resumen,
        "enlace": bruto["enlace"],
        "fuente": FUENTE_NOMBRE,
        "fecha_alerta": fecha_alerta,
        "detectado_en": ahora,
    }


def extraer_fecha_alerta(asunto: str) -> str:
    match = SUBJECT_FECHA.search(asunto or "")
    if not match:
        return ""
    dia, mes, anio = match.groups()
    return f"{anio}-{mes}-{dia}"


def decodificar_asunto(mensaje: Message) -> str:
    partes = decode_header(mensaje.get("Subject", ""))
    return "".join(
        contenido.decode(codificacion or "utf-8") if isinstance(contenido, bytes) else contenido
        for contenido, codificacion in partes
    )


def extraer_html(mensaje: Message) -> str | None:
    candidatos = mensaje.walk() if mensaje.is_multipart() else [mensaje]
    for parte in candidatos:
        if parte.get_content_type() == "text/html":
            payload = parte.get_payload(decode=True)
            charset = parte.get_content_charset() or "utf-8"
            return payload.decode(charset, errors="replace")
    return None


def procesar_mensajes(conexion: imaplib.IMAP4_SSL) -> list[dict]:
    ahora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    estado, datos = conexion.search(None, "UNSEEN")
    if estado != "OK":
        raise RuntimeError(f"Búsqueda IMAP fallida: {estado}")

    ids = datos[0].split()
    if not ids:
        log("Sin correos nuevos en la etiqueta BOP-Malaga.")
        return []

    detectados: list[dict] = []
    for msg_id in ids:
        estado, datos_msg = conexion.fetch(msg_id, "(RFC822)")
        if estado != "OK" or not datos_msg or not isinstance(datos_msg[0], tuple):
            log(f"No se pudo leer el mensaje {msg_id!r}, se deja sin marcar.")
            continue

        mensaje = email.message_from_bytes(datos_msg[0][1])
        remitente = parseaddr(mensaje.get("From", ""))[1]
        if remitente.lower() != REMITENTE_ESPERADO:
            log(f"Mensaje {msg_id!r} de remitente inesperado ({remitente}), se ignora sin marcar leído.")
            continue

        html = extraer_html(mensaje)
        if not html:
            log(f"Mensaje {msg_id!r} sin parte HTML, se marca leído y se descarta.")
            conexion.store(msg_id, "+FLAGS", "\\Seen")
            continue

        parser = ParserEdictosHTML()
        parser.feed(html)

        if not parser.edictos:
            log(f"Mensaje {msg_id!r}: no se detectó ningún edicto en el HTML "
                f"(revisar si BOPMA cambió el formato). Se deja sin marcar leído.")
            continue

        fecha_alerta = extraer_fecha_alerta(decodificar_asunto(mensaje))
        nuevos = [
            edicto for edicto in (
                construir_edicto(bruto, fecha_alerta, ahora) for bruto in parser.edictos
            ) if edicto
        ]
        detectados.extend(nuevos)
        log(f"Mensaje {msg_id!r}: {len(nuevos)}/{len(parser.edictos)} edictos extraídos.")
        conexion.store(msg_id, "+FLAGS", "\\Seen")

    return detectados


def cargar_existentes() -> list[dict]:
    if not BOLETIN_PATH.exists():
        return []
    try:
        datos = json.loads(BOLETIN_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    return datos if isinstance(datos, list) else []


def fusionar(existentes: list[dict], detectados: list[dict]) -> list[dict]:
    por_id = {e["id"]: e for e in existentes}
    for edicto in detectados:
        if edicto["id"] in por_id:
            continue
        por_id[edicto["id"]] = edicto
        log(f"Nuevo edicto: {edicto['numero_edicto']} ({edicto['organismo']})")
    return sorted(por_id.values(), key=lambda e: e.get("detectado_en", ""), reverse=True)


def main() -> int:
    usuario = os.environ.get("BOP_EMAIL_USER")
    contrasena = os.environ.get("BOP_EMAIL_APP_PASSWORD")
    if not usuario or not contrasena:
        log("Faltan BOP_EMAIL_USER / BOP_EMAIL_APP_PASSWORD. Se conserva el último fichero válido.")
        return 0

    try:
        conexion = imaplib.IMAP4_SSL(IMAP_HOST)
        conexion.login(usuario, contrasena)
        conexion.select(f'"{IMAP_LABEL}"')
        detectados = procesar_mensajes(conexion)
        conexion.close()
        conexion.logout()
    except Exception as exc:
        log(f"No se pudo actualizar el boletín oficial: {exc}")
        log("Se conserva el último data/boletin-oficial.json válido.")
        return 0

    if not detectados:
        return 0

    existentes = cargar_existentes()
    resultado = fusionar(existentes, detectados)

    BOLETIN_PATH.parent.mkdir(parents=True, exist_ok=True)
    BOLETIN_PATH.write_text(json.dumps(resultado, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log(f"Edictos nuevos: {len(detectados)}. Registros totales en el fichero: {len(resultado)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
