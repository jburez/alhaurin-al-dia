# Sprint SEO 4: deduplicación conservadora de noticias

Este sprint introduce una capa de deduplicación posterior a la generación de noticias.

La deduplicación no borra archivos HTML antiguos ni elimina contenido manualmente. Trabaja sobre `data/noticias.json` y deja un informe revisable para evitar que el listado principal, las categorías y los sitemaps sigan creciendo con noticias repetidas.

## Objetivos

- Evitar URLs duplicadas en `data/noticias.json`.
- Evitar noticias repetidas por misma fuente original.
- Detectar noticias muy parecidas publicadas el mismo día.
- Conservar la versión de mayor calidad como canónica.
- Mantener el máximo de noticias dentro del límite configurado.
- Generar un informe revisable antes o después de escribir cambios.

## Comandos nuevos

### Simulación sin escribir

```bash
npm run news:dedupe:dry
```

Genera un informe en:

```bash
reports/news-dedupe-report.json
```

No modifica `data/noticias.json`.

### Deduplicación escribiendo cambios

```bash
npm run news:dedupe
```

Actualiza `data/noticias.json` con la lista deduplicada y genera el informe.

### Build completo

```bash
npm run build
```

Ahora ejecuta:

1. Generación de noticias.
2. Deduplicación de `data/noticias.json`.
3. Limpieza SEO.
4. Generación de sitemaps.
5. Auditoría SEO.

## Criterios de deduplicación

El script agrupa noticias como posibles duplicadas si:

- tienen la misma URL original;
- tienen la misma página interna;
- tienen alta similitud de título + descripción y misma fecha.

Dentro de cada grupo conserva la noticia con mejor puntuación editorial:

- prioridad de fuente;
- presencia de imagen;
- presencia de página interna;
- longitud razonable de título, entradilla y cuerpo;
- palabras clave SEO si existen.

## Flujo recomendado

Antes de regenerar todo:

```bash
npm run news:dedupe:dry
cat reports/news-dedupe-report.json
```

Si el informe es razonable:

```bash
npm run build
```

Después revisar:

```bash
git status
git diff --stat
npm run seo:audit
```

## Limitación importante

Este sprint no borra páginas HTML antiguas que ya no aparezcan en `data/noticias.json`. Esa limpieza debe abordarse en un sprint posterior con una estrategia de redirecciones, canonical o eliminación controlada.
