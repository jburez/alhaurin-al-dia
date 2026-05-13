# Sprint SEO 7: auditoría de páginas huérfanas

Este sprint añade una auditoría para detectar páginas HTML publicadas que ya no tienen respaldo en los datos del proyecto.

## Objetivos

- Detectar noticias HTML que existen en `/noticias/` pero no aparecen en `data/noticias.json`.
- Detectar páginas de guía útil que existen bajo `/guia-util/` pero no aparecen en `data/guia-util.json`.
- Detectar páginas temporales bajo `/tmp/`.
- Detectar HTML inesperados que no forman parte de las rutas estructurales conocidas.
- Generar un informe local en `reports/orphan-pages-report.json`.

## Comandos nuevos

```bash
npm run seo:orphans
```

Ejecuta la auditoría en modo aviso. No bloquea el flujo.

```bash
npm run seo:orphans:strict
```

Ejecuta la auditoría en modo estricto. Si detecta huérfanas o temporales, devuelve código de error.

## Build actualizado

```bash
npm run build
```

Ahora ejecuta:

1. Generación de noticias.
2. Deduplicación.
3. Limpieza SEO.
4. Portada estática.
5. Páginas hub de guía útil.
6. Sitemaps.
7. Auditoría SEO.
8. Auditoría de páginas huérfanas.

## Informe generado

```bash
reports/orphan-pages-report.json
```

Incluye:

- `orphanNewsPages`
- `orphanGuidePages`
- `temporaryPages`
- `unexpectedHtmlPages`

## Importante

Este sprint no borra nada automáticamente. Primero detecta y documenta. La limpieza automática o semiautomática debe hacerse en un sprint posterior, con revisión de URLs y estrategia para no romper indexación.

## Flujo recomendado

```bash
npm run seo:orphans
cat reports/orphan-pages-report.json
```

Si el informe es razonable, se puede decidir qué páginas eliminar, conservar, redirigir o excluir del sitemap.
