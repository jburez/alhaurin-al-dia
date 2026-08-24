"""
Tests de mejorar_noticia_con_ia() contra el modulo REAL scripts/generar_noticias.py.
Mockea openai.OpenAI para no llamar a la API real. Ejecutar con:
  python3 test_mejorar_noticia_con_ia.py
"""
import sys
import types
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import generar_noticias as gn  # noqa: E402

fallos = []


def check(nombre, condicion, detalle=""):
    estado = "OK" if condicion else "FALLA"
    print(f"{estado} {nombre} {detalle}")
    if not condicion:
        fallos.append(nombre)


def fake_openai_module(client_factory):
    """Construye un módulo 'openai' falso e instalado en sys.modules, para
    que `from openai import OpenAI` dentro de mejorar_noticia_con_ia()
    resuelva a nuestro doble en vez de intentar importar el paquete real."""
    modulo = types.ModuleType("openai")
    modulo.OpenAI = client_factory
    return modulo


TITULO = "El Ayuntamiento aprueba nuevas ayudas para asociaciones locales"
TEXTO = "El pleno municipal aprobó ayer un paquete de ayudas económicas destinado a asociaciones vecinales de Alhaurín el Grande, con una dotación total de 45.000 euros repartida entre doce entidades."
FUENTE = "Ayuntamiento Alhaurín el Grande"


def response_ok(payload_json):
    resp = MagicMock()
    resp.output_text = payload_json
    return resp


print("=== 1. sin API key -> False / False ===")
with patch.object(gn, "ia_activada", return_value=False):
    resultado = gn.mejorar_noticia_con_ia(TITULO, TEXTO, FUENTE)
check("ia_exitosa=False", resultado["ia_exitosa"] is False)
check("ia_intentada=False", resultado["ia_intentada"] is False)
check("devuelve contenido de fallback utilizable", bool(resultado["titulo"]) and bool(resultado["cuerpo"]))

print()
print("=== 2. éxito real -> True / True ===")
payload = '{"titulo": "Nuevas ayudas municipales para asociaciones", "descripcion": "El Ayuntamiento destina 45.000 euros a doce asociaciones vecinales de Alhaurín el Grande.", "cuerpo": "El pleno aprobó el paquete de ayudas económicas para el próximo curso. Las asociaciones podrán solicitar la subvención a partir de la próxima semana. El plazo se extenderá hasta final de mes.", "categoria": "Municipal", "seo_keywords": ["ayudas", "ayuntamiento"]}'
client_mock = MagicMock()
client_mock.responses.create.return_value = response_ok(payload)
with patch.object(gn, "ia_activada", return_value=True), \
     patch.dict(sys.modules, {"openai": fake_openai_module(lambda: client_mock)}):
    resultado = gn.mejorar_noticia_con_ia(TITULO, TEXTO, FUENTE)
check("ia_exitosa=True", resultado["ia_exitosa"] is True, resultado)
check("ia_intentada=True", resultado["ia_intentada"] is True)
check("titulo real de la IA usado", "Nuevas ayudas municipales" in resultado["titulo"], resultado["titulo"])

print()
print("=== 3. excepción durante la llamada real -> False / True ===")
client_mock_falla = MagicMock()
client_mock_falla.responses.create.side_effect = RuntimeError("timeout de red")
with patch.object(gn, "ia_activada", return_value=True), \
     patch.dict(sys.modules, {"openai": fake_openai_module(lambda: client_mock_falla)}):
    resultado = gn.mejorar_noticia_con_ia(TITULO, TEXTO, FUENTE)
check("ia_exitosa=False", resultado["ia_exitosa"] is False)
check("ia_intentada=True (sí se llegó a llamar)", resultado["ia_intentada"] is True)
check("cae a contenido de fallback", bool(resultado["titulo"]) and bool(resultado["cuerpo"]))

print()
print("=== 4. respuesta IA inválida (JSON vacío/degenerado) -> False / True ===")
client_mock_vacio = MagicMock()
client_mock_vacio.responses.create.return_value = response_ok('{"titulo": "", "cuerpo": ""}')
with patch.object(gn, "ia_activada", return_value=True), \
     patch.dict(sys.modules, {"openai": fake_openai_module(lambda: client_mock_vacio)}):
    resultado = gn.mejorar_noticia_con_ia(TITULO, TEXTO, FUENTE)
check("ia_exitosa=False (no basta con HTTP 200)", resultado["ia_exitosa"] is False, resultado)
check("ia_intentada=True (la llamada sí se hizo)", resultado["ia_intentada"] is True)
check("cae a contenido de fallback, no publica vacío", bool(resultado["titulo"]) and bool(resultado["cuerpo"]))

print()
print("=== 4b. respuesta IA con JSON malformado (excepción de parseo) -> False / True ===")
client_mock_json_roto = MagicMock()
client_mock_json_roto.responses.create.return_value = response_ok("esto no es JSON en absoluto {{{")
with patch.object(gn, "ia_activada", return_value=True), \
     patch.dict(sys.modules, {"openai": fake_openai_module(lambda: client_mock_json_roto)}):
    resultado = gn.mejorar_noticia_con_ia(TITULO, TEXTO, FUENTE)
check("ia_exitosa=False", resultado["ia_exitosa"] is False)
check("ia_intentada=True", resultado["ia_intentada"] is True)

print()
print("=== 5. fallo ANTES de la llamada real (falla construcción del cliente) -> False / False ===")


def client_factory_rota():
    raise RuntimeError("OPENAI_API_KEY inválida al construir el cliente")


with patch.object(gn, "ia_activada", return_value=True), \
     patch.dict(sys.modules, {"openai": fake_openai_module(client_factory_rota)}):
    resultado = gn.mejorar_noticia_con_ia(TITULO, TEXTO, FUENTE)
check("ia_exitosa=False", resultado["ia_exitosa"] is False)
check("ia_intentada=False (nunca se llegó a llamar a la API)", resultado["ia_intentada"] is False, resultado)

print()
if fallos:
    print(f"RESULTADO: {len(fallos)} fallo(s): {fallos}")
    sys.exit(1)
print("RESULTADO: todos los tests pasaron")
