# Sprint SEO 5: portada estática e indexable

Este sprint mejora la portada para que las noticias y recursos principales estén presentes en el HTML inicial, no solo cargados por JavaScript.

## Objetivos

- Renderizar una noticia destacada directamente en `index.html`.
- Renderizar tres noticias secundarias en `index.html`.
- Renderizar recursos principales de la guía útil en `index.html`.
- Mantener `app.js` como mejora progresiva para refrescar y enriquecer la interfaz.
- Integrar el render estático dentro de `npm run build`.

## Comando nuevo

```bash
npm run home:static
```

Lee:

```bash
data/noticias.json
data/guia-util.json
```

Y actualiza en `index.html`:

```html
<div class="featured-news" id="featured-news">...</div>
<div class="grid-3 home-latest-grid" id="news-container">...</div>
<div class="guide-grid" id="guide-container">...</div>
```

## Build actualizado

```bash
npm run build
```

Ahora ejecuta:

1. Generación de noticias.
2. Deduplicación.
3. Limpieza SEO.
4. Render estático de portada.
5. Sitemaps.
6. Auditoría SEO.

## Validación recomendada

Después de mergear:

```bash
npm run home:static
npm run seo:audit
git diff --stat
```

Si se ejecuta el build completo:

```bash
npm run build
npm run seo:audit
```

Revisar especialmente `index.html` para confirmar que se han insertado:

- noticia destacada;
- tres noticias secundarias;
- recursos de guía útil.

## Nota

Este sprint no elimina la carga dinámica por JavaScript. La mantiene como mejora progresiva para no romper filtros, refrescos o futuras funcionalidades.
