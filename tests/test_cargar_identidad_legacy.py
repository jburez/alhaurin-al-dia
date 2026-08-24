"""
Tests de cargar_identidad_legacy() / resolver_identidad_noticia() contra el
modulo REAL scripts/lib/editorial_registry.py (no una copia). Ejecutar con:
  python3 test_cargar_identidad_legacy.py
"""
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from lib.editorial_registry import (  # noqa: E402
    IdentidadLegacyAmbiguaError,
    IdentidadLegacyInvalidaError,
    RegistroEditorialError,
    cargar_identidad_legacy,
    resolver_identidad_noticia,
)

fallos = []


def check(nombre, condicion, detalle=""):
    estado = "OK" if condicion else "FALLA"
    print(f"{estado} {nombre} {detalle}")
    if not condicion:
        fallos.append(nombre)


def escribir_tmp(contenido: str) -> Path:
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8")
    f.write(contenido)
    f.close()
    return Path(f.name)


print("=== fichero ausente -> {} (histórico opcional legítimo) ===")
ruta_ausente = Path("/tmp/no-existe-jamas-alhaurin-al-dia.json")
check("fichero ausente devuelve {}", cargar_identidad_legacy(ruta_ausente) == {})

print()
print("=== JSON corrupto -> error explícito, NUNCA {} ===")
ruta_corrupta = escribir_tmp("{ esto no es json valido")
try:
    cargar_identidad_legacy(ruta_corrupta)
    check("JSON corrupto lanza RegistroEditorialError", False, "no lanzó nada")
except RegistroEditorialError:
    check("JSON corrupto lanza RegistroEditorialError", True)
ruta_corrupta.unlink()

print()
print("=== estructura no-lista (dict en vez de list) -> error explícito ===")
ruta_no_lista = escribir_tmp(json.dumps({"no": "es una lista"}))
try:
    cargar_identidad_legacy(ruta_no_lista)
    check("estructura no-lista lanza RegistroEditorialError", False, "no lanzó nada")
except RegistroEditorialError:
    check("estructura no-lista lanza RegistroEditorialError", True)
ruta_no_lista.unlink()

print()
print("=== URL válida + id ausente -> error explícito, NUNCA 'sin antecedente' ===")
ruta_sin_id = escribir_tmp(json.dumps([
    {"enlace": "https://alhaurinelgrande.es/noticia-sin-id", "pagina": "noticias/x.html"}
]))
try:
    cargar_identidad_legacy(ruta_sin_id)
    check("URL válida sin id lanza IdentidadLegacyInvalidaError", False, "no lanzó nada")
except IdentidadLegacyInvalidaError:
    check("URL válida sin id lanza IdentidadLegacyInvalidaError", True)
ruta_sin_id.unlink()

print()
print("=== id válido + URL NO canonicalizable -> error explícito, NUNCA 'sin antecedente' ===")
# canonicalizar_url() sin base resuelto: una URL relativa sin esquema/host
# no es resoluble y levanta ValueError -- justo el caso que no debe perderse.
ruta_url_invalida = escribir_tmp(json.dumps([
    {"enlace": "/ruta-relativa-sin-dominio", "id": "ID-VALIDO", "pagina": "noticias/y.html"}
]))
try:
    cargar_identidad_legacy(ruta_url_invalida)
    check("id válido + URL no canonicalizable lanza IdentidadLegacyInvalidaError", False, "no lanzó nada")
except IdentidadLegacyInvalidaError as exc:
    check("id válido + URL no canonicalizable lanza IdentidadLegacyInvalidaError", True)
    check("el candidato del error conserva el id original", exc.candidato.get("id") == "ID-VALIDO")
ruta_url_invalida.unlink()

print()
print("=== id ausente + URL NO canonicalizable -> genuinamente no indexable, se descarta ===")
ruta_ambos_invalidos = escribir_tmp(json.dumps([
    {"enlace": "/ruta-relativa-sin-dominio-ni-id"}
]))
try:
    resultado = cargar_identidad_legacy(ruta_ambos_invalidos)
    check("sin id + URL no canonicalizable no lanza y devuelve {}", resultado == {}, resultado)
except Exception as exc:  # noqa: BLE001
    check("sin id + URL no canonicalizable no lanza y devuelve {}", False, repr(exc))
ruta_ambos_invalidos.unlink()

print()
print("=== misma URL dos veces + mismo id/pagina -> compatible, no error ===")
url_repetida = "https://alhaurinelgrande.es/misma-noticia"
ruta_compatible = escribir_tmp(json.dumps([
    {"enlace": url_repetida, "id": "A", "pagina": "noticias/a.html", "fecha": "2026-08-01T00:00:00+00:00"},
    {"enlace": url_repetida, "id": "A", "pagina": "noticias/a.html", "fecha": "2026-08-01T00:00:00+00:00"},
]))
try:
    indice = cargar_identidad_legacy(ruta_compatible)
    check("misma URL + mismo id/pagina no lanza", True)
    check("solo una entrada en el índice", len(indice) == 1, indice)
except IdentidadLegacyAmbiguaError as exc:
    check("misma URL + mismo id/pagina no lanza", False, repr(exc))
ruta_compatible.unlink()

print()
print("=== misma URL dos veces + id/pagina distintos -> error explícito, no 'último gana' ===")
ruta_ambigua = escribir_tmp(json.dumps([
    {"enlace": url_repetida, "id": "A", "pagina": "noticias/a.html"},
    {"enlace": url_repetida, "id": "B-DISTINTO", "pagina": "noticias/b.html"},
]))
try:
    cargar_identidad_legacy(ruta_ambigua)
    check("misma URL + id/pagina distintos lanza IdentidadLegacyAmbiguaError", False, "no lanzó nada")
except IdentidadLegacyAmbiguaError as exc:
    check("misma URL + id/pagina distintos lanza IdentidadLegacyAmbiguaError", True)
    check("el error referencia ambos candidatos", "A" in str(exc) and "B-DISTINTO" in str(exc))
ruta_ambigua.unlink()

print()
print("=== caso real: indexado normal sigue funcionando ===")
ruta_normal = escribir_tmp(json.dumps([
    {"enlace": "https://alhaurinelgrande.es/noticia-1", "id": "N1", "pagina": "noticias/n1.html", "fecha": "2026-08-10T00:00:00+00:00"},
    {"enlace": "https://alhaurinelgrande.es/noticia-2?utm_source=x", "id": "N2", "pagina": "noticias/n2.html", "fecha": "2026-08-11T00:00:00+00:00"},
]))
indice = cargar_identidad_legacy(ruta_normal)
check("dos entradas indexadas", len(indice) == 2, indice)
check("utm_source se elimina al canonicalizar (misma clave que sin query)",
      "https://alhaurinelgrande.es/noticia-2" in indice, list(indice.keys()))
ruta_normal.unlink()

print()
print("=== resolver_identidad_noticia() sigue igual (no tocado en esta corrección) ===")


def generar_id_fake(identidad, titulo):
    return f"id-nuevo-desde-{identidad}"


activas_ok = {"id": "A", "pagina": "noticias/a.html", "fecha": "2026-08-15T00:00:00+00:00"}
archivo_ok = {"id": "A", "pagina": "noticias/a.html", "fecha": "2026-08-01T00:00:00+00:00"}
id_r, pagina_r, fecha_r = resolver_identidad_noticia(None, activas_ok, archivo_ok, "guid:x:y", "Titulo", generar_id_fake)
check("activas/archivo compatibles siguen heredando", id_r == "A" and pagina_r == "noticias/a.html")

activas_sin_id = {"id": None, "pagina": "noticias/a.html"}
archivo_sin_id = {"id": None, "pagina": "noticias/b.html"}
try:
    resolver_identidad_noticia(None, activas_sin_id, archivo_sin_id, "guid:x:y", "Titulo", generar_id_fake)
    check("activa+archivo ambos sin id sigue lanzando IdentidadLegacyInvalidaError", False, "no lanzó nada")
except IdentidadLegacyInvalidaError:
    check("activa+archivo ambos sin id sigue lanzando IdentidadLegacyInvalidaError", True)

print()
if fallos:
    print(f"RESULTADO: {len(fallos)} fallo(s): {fallos}")
    sys.exit(1)
print("RESULTADO: todos los tests pasaron")
