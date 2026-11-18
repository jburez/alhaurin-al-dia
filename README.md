# Alhaurín al Día

Guía práctica de Alhaurín el Grande (Málaga): farmacia de guardia, tiempo, avisos, agenda de planes, guías de trámites y servicios y directorio de comercios. Las noticias de otros medios quedan en segundo plano, en la sección «Actualidad».

Web estática (HTML/CSS/JS vanilla) con el contenido en JSON dentro de `data/` y páginas generadas por scripts de Node y Python.

## Documentación

- [Arquitectura de la web](docs/ARQUITECTURA.md): visión técnica completa; el apartado 15 resume el reposicionamiento como guía práctica (noviembre 2026).
- [Manual de administración](docs/MANUAL_ADMINISTRACION.md): guía operativa para actualizar noticias, avisos, agenda, farmacias, comercios, guía útil, SEO y publicación.
- [Plan operativo de contenido](docs/PLAN_OPERATIVO_CONTENIDO.md): rutina de validación, próximos pasos y criterios editoriales.

## Secciones

| Sección | URL |
|---|---|
| Portada | `/` |
| Farmacia de guardia | `/farmacia-de-guardia/` |
| Tiempo | `/tiempo/` |
| Avisos | `/avisos/` |
| Agenda | `/agenda/`, `/este-fin-de-semana/`, fichas en `/planes/<slug>/` |
| Guías prácticas | `/guias/`, `/guias/<slug>/` |
| Guía útil | `/guia-util/` |
| Comercios | `/comercios/`, `/comercios/<categoria>/` |
| Anúnciate | `/anunciarse/` |
| Actualidad (noticias RSS, noindex) | `/noticias/` |
| Sobre el proyecto, contacto y legales | `/sobre-nosotros/`, `/contacto/`, `/privacidad/`, `/cookies/`, `/aviso-legal/` |

## Ficheros de `data/` principales

- `guias.json`: guías prácticas (`estado`: `borrador` | `publicada`).
- `agenda-local.json`: eventos de entrada (scrapers y panel de administración).
- `agenda.json`: agenda normalizada, generada (no editar a mano).
- `agenda-overrides.json`: datos manuales por evento (descripción propia, dirección, precio, organizador…).
- `agenda_borradores.json`: eventos detectados en feeds con `--modo agenda`, pendientes de revisar.
- `comercios.json`: directorio de comercios y categorías.
- `farmacias.json` y `guardias-farmacias-2026.json`: farmacias y calendario de guardias.
- `avisos-locales.json` y `avisos-oficiales.json`: avisos municipales y de AEMET.
- `tiempo-aemet.json`: previsión.
- `noticias.json` y `noticias-archivo.json`: noticias, con campo `origen` (`rss` | `original`).
- `guia-util.json`: fichas de la guía útil.
- `nav.json`: navegación principal.

## Generar noticias

```bash
python3 scripts/generar_noticias_seguro.py
```

Flags:

- `--reescribir-ia`: activa la reescritura de titulares y entradillas con OpenAI. **Apagado por defecto.**
- `--modo agenda`: las entradas que parecen eventos se guardan como borrador en `data/agenda_borradores.json` en vez de publicarse como noticia.

Todo lo que genera el script lleva `origen: "rss"`: su página sale con `noindex, follow`, la fuente visible y enlace `rel="nofollow noopener"`, y queda fuera de los sitemaps.

## Build y validación

Pipeline completo (descarga feeds y regenera todo):

```bash
npm run build
```

Lo mismo sin descargar feeds:

```bash
npm run build:site
```

Comprobaciones antes de publicar:

```bash
python scripts/validar_contenido.py
```

```bash
npm run publish:check
```

La auditoría SEO (`npm run seo:audit`) avisa de páginas indexables con poco texto propio y falla si hay páginas en el sitemap con `noindex`, URLs existentes que han desaparecido (frente a `reports/urls-baseline.txt`), marcadores `[PENDIENTE` en páginas indexables, JSON-LD inválido o eventos sin los campos obligatorios.

## Sitemaps

`sitemap-index.xml` enlaza `sitemap.xml`, `sitemap-farmacias.xml`, `sitemap-servicios.xml`, `sitemap-guias.xml`, `sitemap-agenda.xml`, `sitemap-comercios.xml` y, solo cuando haya noticias originales, `sitemap-noticias.xml` y `sitemap-news.xml`. Ninguna página con `noindex` entra en un sitemap.

## Publicidad y consentimiento

Los anuncios solo se cargan a través de `js/consent.js` cuando hay un gestor de consentimiento (CMP) certificado por Google compatible con TCF. Ver `docs/ARQUITECTURA.md`, apartado 15.3.

## Despliegue

Cada push a `develop` dispara `.github/workflows/publicar-produccion.yml`, que fusiona en `main` y publica. Para cambios que deban revisarse antes, trabajar en una rama aparte.
