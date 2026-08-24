import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from lib.editorial_registry import (  # noqa: E402
    CACHE_MISS_AI_NOT_SUCCESSFUL,
    CACHE_MISS_CONTENT_CHANGED,
    CACHE_MISS_PROMPT_VERSION,
    CACHE_HIT,
    PROMPT_VERSION,
    _BACKOFF_MINUTOS_BASE,
    _BACKOFF_TOPE_MINUTOS,
    _a_utc,
    debe_reintentar_ia,
    decidir_cache_editorial,
)

fallos = []


def check(nombre, condicion, detalle=""):
    estado = "OK" if condicion else "FALLA"
    print(f"{estado} {nombre} {detalle}")
    if not condicion:
        fallos.append(nombre)


print("=== constantes de backoff: 2h base, 12h tope ===")
check("base = 120 min (2h)", _BACKOFF_MINUTOS_BASE == 120, _BACKOFF_MINUTOS_BASE)
check("tope = 720 min (12h)", _BACKOFF_TOPE_MINUTOS == 720, _BACKOFF_TOPE_MINUTOS)

print()
print("=== _a_utc: naive se interpreta como UTC explícito, no tz local ===")
naive = datetime(2026, 8, 20, 10, 0, 0)
resultado = _a_utc(naive)
check("naive -> aware", resultado.tzinfo is not None)
check("naive -> se asume UTC (misma hora, offset 0)", resultado == datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc), resultado)

aware_otra_tz = datetime(2026, 8, 20, 12, 0, 0, tzinfo=timezone(timedelta(hours=2)))
resultado2 = _a_utc(aware_otra_tz)
check("aware en otra tz -> convertido a UTC real (10:00Z)", resultado2 == datetime(2026, 8, 20, 10, 0, 0, tzinfo=timezone.utc), resultado2)

print()
print("=== debe_reintentar_ia: backoff exponencial con tope, medido desde 'ahora' inyectado ===")
ahora = datetime(2026, 8, 20, 12, 0, 0, tzinfo=timezone.utc)


def entrada(intentos, hace_minutos):
    return {"ai_attempts": intentos, "last_ai_attempt": (ahora - timedelta(minutes=hace_minutos)).isoformat()}


check("intento 1, 90min transcurridos (<2h) -> NO reintentar", debe_reintentar_ia(entrada(1, 90), ahora) is False)
check("intento 1, 121min transcurridos (>2h) -> reintentar", debe_reintentar_ia(entrada(1, 121), ahora) is True)
check("intento 2, 121min transcurridos (<4h) -> NO reintentar", debe_reintentar_ia(entrada(2, 121), ahora) is False)
check("intento 2, 241min transcurridos (>4h) -> reintentar", debe_reintentar_ia(entrada(2, 241), ahora) is True)
check("intento 3, 241min transcurridos (<8h) -> NO reintentar", debe_reintentar_ia(entrada(3, 241), ahora) is False)
check("intento 3, 481min transcurridos (>8h) -> reintentar", debe_reintentar_ia(entrada(3, 481), ahora) is True)
check("intento 6 (muy alto), 700min transcurridos (<12h tope) -> NO reintentar", debe_reintentar_ia(entrada(6, 700), ahora) is False)
check("intento 6 (muy alto), 721min transcurridos (>12h tope) -> reintentar, nunca supera el tope", debe_reintentar_ia(entrada(6, 721), ahora) is True)

print()
print("=== casos borde de robustez ===")
check("sin entrada -> reintentar", debe_reintentar_ia(None, ahora) is True)
check("naive datetime en last_ai_attempt -> no TypeError, se interpreta", debe_reintentar_ia({"ai_attempts": 1, "last_ai_attempt": "2026-08-20T10:00:00"}, ahora) is True)
check("timestamp inválido -> reintenta de forma segura", debe_reintentar_ia({"ai_attempts": 2, "last_ai_attempt": "no-es-una-fecha"}, ahora) is True)
check("ai_attempts como string numérica ('3') no lanza", debe_reintentar_ia(entrada("3", 100), ahora) is False)  # dentro de backoff de intento 3 (~8h)
check("ai_attempts negativo -> tratado como 0, reintenta", debe_reintentar_ia({"ai_attempts": -5, "last_ai_attempt": ahora.isoformat()}, ahora) is True)
check("ai_attempts no numérico ('abc') -> tratado como 0, reintenta", debe_reintentar_ia({"ai_attempts": "abc", "last_ai_attempt": ahora.isoformat()}, ahora) is True)
check("ahora como naive -> no TypeError al restar", debe_reintentar_ia(entrada(1, 90), datetime(2026, 8, 20, 12, 0, 0)) is False)

print()
print("=== content/prompt changed SIEMPRE gana sobre backoff pendiente ===")
entrada_en_backoff = {
    "content_hash": "hash-viejo", "prompt_version": PROMPT_VERSION, "ia_exitosa": False,
    "ai_attempts": 6, "last_ai_attempt": ahora.isoformat(),
}
reusar, motivo = decidir_cache_editorial(entrada_en_backoff, "hash-NUEVO")
check("content cambiado -> CONTENT_CHANGED sin importar backoff", motivo == CACHE_MISS_CONTENT_CHANGED and reusar is False, motivo)

entrada_en_backoff_2 = {
    "content_hash": "hash-x", "prompt_version": "version-vieja", "ia_exitosa": False,
    "ai_attempts": 6, "last_ai_attempt": ahora.isoformat(),
}
reusar2, motivo2 = decidir_cache_editorial(entrada_en_backoff_2, "hash-x")
check("prompt_version cambiado -> PROMPT_VERSION sin importar backoff", motivo2 == CACHE_MISS_PROMPT_VERSION and reusar2 is False, motivo2)

print()
print("=== caché HIT definitivo solo con content+prompt+ia_exitosa=True ===")
entrada_ok = {"content_hash": "hash-x", "prompt_version": PROMPT_VERSION, "ia_exitosa": True}
reusar3, motivo3 = decidir_cache_editorial(entrada_ok, "hash-x")
check("hit definitivo", reusar3 is True and motivo3 == CACHE_HIT, motivo3)

entrada_fallback = {"content_hash": "hash-x", "prompt_version": PROMPT_VERSION, "ia_exitosa": False}
reusar4, motivo4 = decidir_cache_editorial(entrada_fallback, "hash-x")
check("ia_exitosa=False nunca es hit aunque content/prompt coincidan", reusar4 is False and motivo4 == CACHE_MISS_AI_NOT_SUCCESSFUL, motivo4)

print()
if fallos:
    print(f"RESULTADO: {len(fallos)} fallo(s): {fallos}")
    sys.exit(1)
print("RESULTADO: todos los tests pasaron")
