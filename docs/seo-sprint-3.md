# Sprint SEO 3: auditoría automática y control de duplicados

Este sprint añade una capa de control de calidad SEO para evitar que el proyecto vuelva a acumular problemas silenciosos al regenerar noticias, páginas y sitemaps.

## Objetivos

- Detectar duplicados reales en `data/noticias.json`.
- Detectar posibles noticias duplicadas por similitud de título y descripción.
- Avisar si vuelve a aparecer `SearchAction` mientras no exista `/buscar/`.
- Avisar si una página HTML indexable no tiene canonical, title o meta description.
- Comprobar coherencia básica de `robots.txt` y sitemaps.
- Generar un informe JSON revisable en `reports/seo-audit-report.json`.

## Comandos nuevos

```bash
npm run seo:audit
```

Ejecuta la auditoría en modo aviso. Genera informe, muestra resumen y no bloquea el flujo aunque haya avisos.

```bash
npm run seo:audit:strict
```

Ejecuta la auditoría en modo estricto. Si detecta problemas críticos, devuelve código de error.

```bash
npm run build
```

Ahora ejecuta:

1. Generación de noticias.
2. Limpieza SEO.
3. Generación de sitemaps.
4. Auditoría SEO en modo aviso.

## Qué considera crítico

- HTML indexable sin canonical.
- HTML con `SearchAction` o `/buscar/` mientras no exista buscador.
- HTML sin title.
- HTML sin meta description útil.
- `robots.txt` sin `sitemap-index.xml`.
- `robots.txt` declarando `sitemap-servicios.xml`.
- `sitemap.xml` incluyendo `index_old.html`.
- Duplicados exactos de página en `data/noticias.json`.
- Duplicados exactos de URL original en `data/noticias.json`.

## Qué considera aviso

- Posibles duplicados de noticias por similitud de título y entradilla.

Estos avisos no borran nada automáticamente. Sirven para revisar antes de limpiar contenido.

## Flujo recomendado

Después de regenerar noticias:

```bash
npm run build
cat reports/seo-audit-report.json
```

Si el informe detecta duplicados probables, revisarlos antes de publicar en `main`.

## Siguiente mejora prevista

Cuando el informe sea estable, se puede añadir una fase de deduplicación asistida que proponga una URL canónica por grupo y marque las demás para revisión, sin borrarlas automáticamente.
