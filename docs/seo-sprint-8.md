# Sprint SEO 8: limpieza controlada de noticias huérfanas

Este sprint añade una limpieza explícita y controlada para páginas HTML de noticias que ya no aparecen en `data/noticias.json`.

## Estado previo comprobado

Antes de iniciar este sprint se comprobó que ya no existen en `develop`:

- `tmp/alhaurin_fase1/`
- `farmacias-de-guardia-alhaurin-grande/`

## Objetivos

- Detectar HTML de `/noticias/` que no están en `data/noticias.json`.
- Permitir una simulación sin borrar nada.
- Permitir una limpieza explícita con `--delete`.
- Generar informe local revisable.
- Evitar incluir el borrado en `npm run build` para no eliminar páginas accidentalmente.

## Comandos nuevos

### Simulación

```bash
npm run news:orphans:dry
```

Genera:

```bash
reports/orphan-news-clean-report.json
```

No borra nada.

### Limpieza real

```bash
npm run news:orphans:clean
```

Borra únicamente archivos `.html` dentro de `/noticias/` que no estén referenciados por `data/noticias.json`.

## Flujo recomendado

```bash
npm run news:orphans:dry
cat reports/orphan-news-clean-report.json
```

Si el informe es correcto:

```bash
npm run news:orphans:clean
npm run sitemap
npm run seo:orphans
npm run seo:audit
```

Después revisar:

```bash
git status
git diff --stat
```

Si solo se han eliminado noticias huérfanas y regenerado sitemaps:

```bash
git add noticias sitemap*.xml
git commit -m "Limpia noticias huérfanas"
git push origin develop
```

## Importante

La limpieza se basa en `data/noticias.json` como fuente de verdad. Si una noticia no aparece ahí, se considera fuera del conjunto activo.
