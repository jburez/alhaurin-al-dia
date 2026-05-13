# Sprint SEO 6: páginas hub de Guía Útil

Este sprint convierte los datos de `data/guia-util.json` en páginas HTML indexables bajo `/guia-util/<id>/`.

## Objetivos

- Generar páginas hub locales a partir del JSON de guía útil.
- Evitar mantener manualmente decenas de páginas repetidas.
- Añadir canonical, Open Graph, `WebPage`, `BreadcrumbList` y `FAQPage` en cada ficha.
- Preparar páginas con potencial SEO local: teléfonos, trámites, movilidad, taxis, educación, deportes, turismo, restaurantes, etc.
- Mantener fuera del generador la sección de farmacias, porque ya tiene una implementación específica.

## Comando nuevo

```bash
npm run guide:pages
```

Genera páginas desde:

```bash
data/guia-util.json
```

En rutas tipo:

```bash
guia-util/telefonos/index.html
guia-util/tramites/index.html
guia-util/movilidad/index.html
```

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

## Validación recomendada

Después de mergear:

```bash
npm run guide:pages
npm run sitemap
npm run seo:audit
git diff --stat
```

Revisar especialmente:

```bash
guia-util/telefonos/index.html
guia-util/tramites/index.html
guia-util/movilidad/index.html
guia-util/restaurantes/index.html
```

## Nota

La página `/guia-util/farmacias/` se excluye del generador porque tiene una implementación propia con calendario, guardias y lógica específica.
