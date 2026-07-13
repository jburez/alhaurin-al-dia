# Auditoría técnica, SEO y de accesibilidad — Julio 2026

Fase A del proyecto "Auditoría técnica, SEO y rediseño editorial". Auditoría de solo lectura sobre `develop`, sin cambios de código salvo la limpieza previa (punto 0, ya commiteada). Objetivo: máxima indexación, rendimiento y cero bugs de cara a monetización (AdSense, comercios patrocinados, newsletter).

## 0. Limpieza previa (ya ejecutada, antes de esta auditoría)

- 22 CSS/JS sueltos en la raíz movidos a `css/` y `js/`, con las 78 páginas HTML y 4 generadores actualizados (0 referencias rotas, verificado exhaustivamente).
- Eliminados `styles_old.css`, `app_old.js`, `index_old.html`, `backup/app_old.js` (sin uso).
- Eliminados duplicados `generar_noticias_seguro 2.py` y `validar_contenido 2.py`.
- `.DS_Store` fuera del tracking de git.

4 commits en `develop`: `f0973e94`, `7c1ccf1f`, `4a04c25f`, `71f4cacb`.

---

## 1. Hallazgo central: renderizado estático vs. JavaScript

El "punto crítico" que pedía comprobar el brief tiene una respuesta matizada:

- **Las páginas individuales de noticia (`noticias/*.html`) y las páginas de categoría (`categoria/*/index.html`) SÍ son HTML estático completo**: título, cuerpo, imagen, enlaces de "relacionadas" y navegación son `<a href>` reales servidos en el HTML inicial. Bien indexadas.
- **Pero los tres hubs más importantes del sitio renderizan su listado principal solo con JavaScript**, con contenedores vacíos en el HTML servido:
  - `index.html`: `<div id="featured-news"></div>`, `<div id="news-container"></div>`, `<div id="guide-container"></div>`
  - `noticias/index.html`: `<div id="featured-news"></div>`, `<div id="source-filters"></div>`, `<div id="news-container"></div>`
  - `guia-util/index.html`: `<div id="guide-category-filters"></div>`, `<div id="guide-page-container"></div>`

  Estas páginas se rellenan en cliente desde `data/noticias.json` / `data/guia-util.json` vía `app.js`. Googlebot ejecuta JS pero con presupuesto de rastreo limitado y demora — para un sitio que vive de indexación diaria de noticias, que la página `/noticias/` (la que enlaza a *todo* el catálogo) no tenga ni un solo `<a>` a un artículo en el HTML inicial es el hallazgo más importante de toda la auditoría.
  - Además, `noticias/index.html` declara en su JSON-LD `"@type": "ItemList", "numberOfItems": 0` — dato estructurado incorrecto (placeholder nunca actualizado).

Esto define directamente el trabajo de la Fase B (punto B.1 del brief).

---

## 2. Hallazgos CRÍTICOS

| # | Hallazgo | Evidencia | Impacto |
|---|---|---|---|
| C1 | Portada, `/noticias/` y `/guia-util/` sin contenido/enlaces indexables en el HTML inicial (ver §1) | `index.html`, `noticias/index.html`, `guia-util/index.html` | Indexación — los hubs son el punto de entrada de rastreo a todo el catálogo |
| C2 | **0 de 30 páginas de noticia tienen JSON-LD `NewsArticle`** | grep exhaustivo, 0 coincidencias | El sitio ya publica `sitemap-news.xml` (Google News) sin el marcado que Google espera para noticias |
| C3 | **6 enlaces internos rotos**: páginas de categoría enlazan a noticias ya eliminadas por `news:dedupe`/`news:orphans:clean` | `categoria/comercio-y-empresa`, `deportes`, `obras-y-servicios`, `videos`, `sucesos`, `turismo-y-patrimonio` → 6 URLs de `noticias/` inexistentes | 404 real para usuarios navegando desde categorías; señal negativa para Google. Causa: los scripts de limpieza borran el artículo pero no regeneran las páginas de categoría que lo enlazan |
| C4 | Contraste `.section-kicker` (dorado `#b88746` sobre `#fff6e8`, 11px mayúsculas) ≈ **2,97:1** | `css/styles.css:203-211` | Falla WCAG AA (necesita 4,5:1); es la etiqueta de sección usada en todo el sitio (portada, noticias, guía) |
| C5 | `outline: none` sin sustituto en 2 inputs reales del sitio | `css/styles.css:753` (buscador guía útil), `css/styles.css:989` (input email newsletter) | Ambos anulan por especificidad la regla global de foco (`ux-desktop.css:27-31`); navegación por teclado sin indicador visible en los dos únicos campos interactivos del sitio |
| C6 | `404.html` no carga ningún `<script>` ni tiene botón `.menu-toggle` en su nav | `404.html` | El menú móvil depende 100% de JS (`initMobileMenu` en `app.js`); en la página 404, en móvil, la navegación queda inaccesible |
| C7 | En cada tarjeta de noticia, el único elemento clicable es el enlace "Leer noticia →" (13px, sin padding en móvil) — el `<h3>` del título no está envuelto en `<a>` | `js/app.js:308-334`, `mobile.css:465-468` | Área de toque muy por debajo de 44×44px + trampa de UX (la tarjeta entera parece clicable y no lo es) |

## 3. Hallazgos IMPORTANTES

| # | Hallazgo | Evidencia | Impacto |
|---|---|---|---|
| I1 | `og:title` de portada no coincide con `<title>` | `index.html:8` vs `:18` | Mensaje inconsistente al compartir en redes |
| I2 | Twitter Cards incompletas en **todo el sitio**: solo `twitter:card`, nunca `twitter:title`/`description`/`image` | 60/77 páginas afectadas | Previsualización pobre al compartir en X |
| I3 | 13 páginas sin ningún meta Open Graph | `avisos/`, `comercios/`, `planes/`, `anunciarse/`, `404.html`, 8 fichas de `guia-util/farmacias/*` | Sin previsualización social en páginas de conversión/negocio |
| I4 | `sitemap-index.xml` solo referencia `sitemap.xml` y `sitemap-news.xml` | `sitemap-index.xml:4-10`, `scripts/generate-sitemaps.js:159-163` | `sitemap-noticias.xml`, `sitemap-farmacias.xml` y `sitemap-servicios.xml` se generan pero quedan huérfanos para crawlers que solo siguen el índice |
| I5 | `lastmod` fijo (fecha de build) para las 76+ URLs de la mayoría de sitemaps | `sitemap.xml` y derivados | Señal de frescura poco fiable; no refleja fecha real de publicación/edición |
| I6 | Fichas de farmacia con estructura HTML inconsistente entre sí | `farmacia-brenan`, `jose-luis-quintela`, `farmacia-camino-de-malaga` sin head/header/nav/footer completos, vs. `farmacia-del-centro` que sí los tiene | Inconsistencia de plantilla dentro del mismo tipo de página |
| I7 | Categoría carga `article.css` (11,8 KB) sin usar ningún elemento `.article-*` | 11 páginas de `categoria/*/index.html` | ~130 KB de transferencia desperdiciada en total |
| I8 | Ninguna `<img>` del sitio tiene `width`/`height` explícitos | Muestra de noticias (30 img) y categorías (36 img) | Riesgo real de CLS en todas las plantillas |
| I9 | Noticias no usan `loading="lazy"` en **ninguna** imagen (ni en relacionadas) | Muestra de 30 img en `noticias/*.html` | Categoría sí lo hace bien (100% lazy); noticia no |
| I10 | 12 CSS bloqueantes en portada; ningún `<script>` del sitio usa `defer`/`async` | `index.html` y confirmado en todo el repo | Home carga 5 JS secuenciales sin defer al final del body |
| I11 | Todas las imágenes son hotlinked de dominios externos (ytimg.com, medios locales), sin WebP/AVIF ni control propio | Todas las `noticias/*.html` | LCP depende del origen externo, sin margen de optimización propia |
| I12 | `--muted #667085` sobre `--bg` crema directo ≈ 4,42:1 (por debajo de 4,5:1) | `css/styles.css` (usado en 9 sitios: líneas 119,318,391,498,512,605,641,867,1008) | Pasa si va sobre tarjeta blanca (4,97:1), falla si cae directo sobre el fondo crema |
| I13 | `article-share.css` es CSS 100% huérfano — nada lo enlaza | Ya detectado en la limpieza previa | El HTML de "compartir" (`.share-card`) se genera en cada noticia sin ningún estilo aplicado. Pendiente de resolver en Fase C: enlazar el CSS o retirar el bloque |
| I14 | `guia-util/index.html` duplica inline la lógica de `initMobileMenu()` en vez de reusar `app.js` | `guia-util/index.html:219-236` | Deuda de mantenibilidad — dos implementaciones del mismo comportamiento |
| I15 | Texto de enlace "Leer noticia →" idéntico en todas las tarjetas | `js/app.js:330` | Dificulta a usuarios de lector de pantalla distinguir destinos (WCAG 2.4.4) |
| I16 | Faltan JSON-LD `Event` (agenda/agenda-cultural) y `LocalBusiness` genérico para comercios no farmacéuticos | — | `comercios/index.html` solo tiene `ItemList` genérico; farmacias sí tienen `Pharmacy` |
| I17 | `scripts/generar_guia.py` no está enganchado a ningún script de `package.json` ni CI — `guide:pages` usa `render-guide-pages.js` en su lugar | `package.json`, `.github/workflows/` | Posible generador obsoleto/duplicado a evaluar (mismo caso que los CSS/JS "_old" ya limpiados) |

## 4. Hallazgos MENORES

| # | Hallazgo | Evidencia |
|---|---|---|
| M1 | Las 11 páginas de categoría tienen title/description técnicamente únicos pero de plantilla casi idéntica (`"Últimas noticias de {X} en Alhaurín el Grande..."`) | Riesgo leve de contenido fino a ojos de Google |
| M2 | Los "formularios" del sitio son en realidad enlaces `mailto:` estilizados como botón — no hay ningún `<form>` en todo el repo | `anunciarse/index.html`, `contacto/index.html`. No es un bug, pero conviene no "arreglar" algo que es una decisión de diseño |
| M3 | `sitemap-news.xml` usa `news:publication_date` real por artículo, pero los 30 timestamps caen en la misma ventana de ~5ms del último `build` | No refleja fechas históricas reales de publicación |
| M4 | `404.html` no carga `ux-desktop.css`/`ux-mobile.css` (sí los carga el resto del sitio) | Inconsistencia visual leve respecto al resto del sitio |
| M5 | `_redirects`/`_headers` no tienen regla explícita de 404; se confía en el comportamiento por defecto de la plataforma de hosting (no hay `netlify.toml`/`wrangler.toml` en el repo que lo confirme) | Sin evidencia de que esté roto, pero no verificado explícitamente |

## 5. Lo que ya funciona bien (no tocar sin necesidad)

- Canonical correcto y autorreferente en el 100% de la muestra.
- Jerarquía de encabezados correcta (1 `h1` por página, sin saltos) en toda la muestra.
- 0 enlaces de navegación por `onclick`; todo son `<a href>` reales.
- `alt` presente y descriptivo en el 100% de la muestra de imágenes.
- `robots.txt` correcto y minimalista, referencia bien `sitemap-index.xml`.
- `sitemap.xml` (76 URLs) coincide exactamente con el recuento real de páginas existentes.
- JSON-LD ya presente y correcto en hubs (`WebSite`, `Organization`, `BreadcrumbList`), en `guia-util/*` (`FAQPage`) y en farmacias (`Pharmacy`+`PostalAddress`).
- Contraste de texto principal, botones y la mayoría de la paleta: excelente (ratios 6,7:1 a 14,4:1).
- Foco visible: hay una regla global bien pensada (`:focus-visible` con offset), solo rota por los 2 `outline:none` de C5.
- `menu-toggle` es un `<button>` real con `aria-expanded` gestionado correctamente por JS (excepto en 404, ver C6).
- Skip-link presente y funcional; `lang="es"` correcto en toda la muestra.
- Tamaños táctiles del menú, nav y botones (`.btn`) ≥ 44px.
- Estados vacíos/error bien manejados en todo el JS (`.catch()`, `Array.isArray`, mensajes explícitos) — ningún "Cargando..." infinito.
- `prefers-reduced-motion` ya implementado en 3 hojas de estilo.
- No hay imágenes locales rotas ni `fetch()` a rutas inexistentes.
- Fuentes 100% de sistema (sin `@font-face` externo) — coste de red cero, nada que optimizar ahí.

---

## 6. Plan de ejecución propuesto

### Fase B — SEO técnico
- Convertir portada, `/noticias/` y `/guia-util/` en HTML estático con enlaces reales (C1), manteniendo `data/*.json` como fuente y el JS solo para mejoras progresivas (filtros, "cargar más").
- Corregir el `numberOfItems: 0` del `ItemList` de `/noticias/` al regenerar esa página como estática.
- Añadir JSON-LD `NewsArticle` a las 30 páginas de noticia (C2), `LocalBusiness` a comercios no farmacéuticos y `Event` a agenda (I16).
- Completar Twitter Cards (I2) y añadir OG a las 13 páginas que no lo tienen (I3); corregir el `og:title` de portada (I1).
- Arreglar `sitemap-index.xml` para que enlace los 3 sitemaps huérfanos (I4) y mover `lastmod` a fechas reales por página (I5).
- Unificar la estructura HTML de las fichas de farmacia (I6).
- Evaluar si `scripts/generar_guia.py` se retira (I17) — para no tocar `data/` sin confirmar contigo.

### Fase C — Rendimiento y bugs
- Corregir los 6 enlaces rotos de categoría (C3) y decidir cómo evitar que vuelva a pasar (¿regenerar categorías tras cada dedupe/limpieza?).
- Añadir el `<script>`/botón de menú que falta en `404.html` (C6) y unificar sus CSS (M4).
- Resolver `article-share.css` (I13): enlazarlo o retirar el bloque `.share-card`.
- Envolver la tarjeta de noticia completa en el enlace, o ampliar el área táctil de "Leer noticia →" (C7), y variar/mejorar el texto del enlace para lectores de pantalla (I15).
- Quitar `article.css` de las páginas de categoría (I7).
- Añadir `width`/`height` a todas las `<img>` (I8) y `loading="lazy"` a las imágenes de noticia que lo necesiten (I9).
- Añadir `defer` a los `<script>` (I10).
- Corregir el contraste de `.section-kicker` (C4) y los 2 `outline:none` (C5); revisar usos de `--muted` fuera de tarjetas (I12).
- Deduplicar `initMobileMenu()` de `guia-util/index.html` (I14).
- Verificar cobertura real de 404 (M5).

### Fase D — Rediseño editorial
Como está definido en el brief; el trabajo de Fase B/C deja una base limpia (HTML estático en hubs, sin CSS muerto, con foco/contraste correctos) sobre la que aplicar los nuevos tokens y plantillas sin arrastrar estos bugs al nuevo diseño.

---

## 7. Checklist SEO para verificar tras cada fase

- [x] `/`, `/noticias/`, `/guia-util/` tienen enlaces `<a href>` reales a contenido en el HTML servido (curl/view-source, sin ejecutar JS)
- [x] Las 30+ páginas de noticia tienen JSON-LD `NewsArticle` válido (validar con el test de resultados enriquecidos de Google)
- [x] `sitemap-index.xml` referencia los 5 sitemaps existentes
- [x] 0 enlaces internos rotos (repetir el script de verificación de enlaces usado en esta auditoría)
- [x] Twitter Card completa (title+description+image) en páginas de noticia y hubs principales
- [x] Contraste AA en `.section-kicker` y cualquier uso de `--muted`
- [x] Foco visible en los 2 inputs corregidos
- [x] Menú móvil funcional en `404.html`

---

## 8. Ejecutado en Fase B — SEO técnico

6 commits (`07267d32` → `b350f317`). Resumen:

- **C1 resuelto**: portada, `/noticias/` y `/guia-util/` ahora renderizan su listado principal como HTML estático real (`scripts/lib/cards.js` + `render-home-static.js`/`render-news-static.js`/`render-guide-static.js`, nuevos pasos `news:static`/`guide:static` en el build). `app.js` sigue re-renderizando en cliente sin cambio de comportamiento visible.
- **C2 resuelto**: JSON-LD `NewsArticle`+`BreadcrumbList` activo en las 30 noticias; `CollectionPage`+`ItemList`+`BreadcrumbList` en categorías. El código ya existía en `generar_noticias.py` pero nunca se había usado para regenerar los HTML publicados (`scripts/regenerar_paginas_noticias.py`, nuevo, re-renderiza desde `data/noticias.json` sin red y sin tocar el JSON).
- **LocalBusiness**: listo en `js/sponsored-cards.js`, sin efecto visible porque hay 0 fichas patrocinadas activas todavía.
- **I3/I6 resueltos**: 8 fichas de farmacia unificadas (header/nav/footer/menú móvil + OG/Twitter); 6 no tenían navegación funcional en absoluto.
- **I1/I2 resueltos**: Twitter Card completa en todo el sitio (`scripts/add-twitter-cards.js`, backstop permanente en el build); OG añadido a 5 páginas que no tenían ninguno; título unificado a "Titular — Alhaurín al Día" salvo 4 páginas de guía con subtítulo propio más informativo.
- **I4/I5 resueltos**: `sitemap-index.xml` enlaza los 5 sitemaps; los generadores ya no reescriben páginas sin cambios reales (`escribir_si_cambia` en Python, comparación de contenido en los renderers Node), así que `lastmod` reflejará fechas reales a partir de ahora en vez de la fecha del último build.
- **Bug propio detectado y corregido**: `schema_website()` generaba `SearchAction` (apunta a `/buscar/`, que no existe) y dependía de `remove-searchaction.js` para limpiarlo después; ese doble paso generar-y-limpiar rompía la detección de "sin cambios". Se eliminó en la fuente.

## 9. Ejecutado en Fase C — Rendimiento y bugs

4 commits (`ff69a922` → `16507062`). Resumen:

- **C3 resuelto**: `generar_paginas_categorias` regenera siempre las 12 categorías conocidas (no solo las que tienen noticias activas), con estado vacío correcto cuando no hay artículos. Elimina los 6 enlaces rotos de categoría→noticia-borrada.
- **C4 resuelto**: `404.html` ahora carga `app.js` y tiene botón de menú — antes era inaccesible en móvil.
- **C6 resuelto**: contraste de `.section-kicker` subido de ~2,97:1 a ~5:1 (`--gold` de `#b88746` a `#8f6128`).
- **C5 resuelto**: quitados los 2 únicos `outline: none` del sitio; el foco de teclado global vuelve a funcionar en el buscador de guía útil y el input de email.
- **C7 resuelto**: la tarjeta de noticia completa es el área de toque real (antes solo "Leer noticia →", <44px), vía enlace expandido en CSS sin tocar el marcado. Aprovechado para añadir `aria-label` con el titular completo (I15).
- **I7/I13 resueltos**: categorías ya no cargan `article.css` (~11,8 KB × 12 páginas); `article-share.css` (huérfano) se enlaza en la plantilla de noticia — la funcionalidad de compartir es real y ahora tiene estilos.
- **I8 resuelto**: `width`/`height` en todas las `<img>` del sitio. El hero de noticia (único caso sin altura reservada en CSS, más allá de los atributos HTML) tiene ahora `aspect-ratio: 16/9`.
- **I10 resuelto**: `defer` en los 11 patrones de `<script src>` del sitio, verificado que ningún script depende del orden de ejecución de otro.
- **I12 resuelto**: `--muted` oscurecido de `#667085` a `#5f6b81` (4,42:1 → 4,78:1 sobre `--bg`), para que pase AA independientemente de si el texto cae sobre una tarjeta blanca o el fondo crema directo.
- **Bug propio detectado y corregido**: `scripts/add-twitter-cards.js` (del bloque de Fase B) no soportaba metas autocerradas estilo XHTML ni multilínea, usadas en `index.html` y `tiempo/index.html` — dejó `twitter:description` vacío y `twitter:title` con un valor obsoleto en esos 2 archivos. Corregido el extractor y regenerados ambos.

### No abordado en Fase C (decisiones explícitas, no pendientes silenciosos)

- **WebP/AVIF (I11)**: las imágenes son 100% hotlinked de dominios externos (ytimg.com, medios locales). Convertir formato implicaría descargar, transformar y re-alojar cada imagen — un cambio de arquitectura (almacenamiento, CDN, actualizar el pipeline de noticias) que excede el alcance de esta fase. Recomendado como mejora futura si se quiere reducir el peso de imágenes.
- **Minificación CSS/JS y consolidación de ficheros**: el workflow `.github/workflows/generar-noticias.yml` ejecuta `npm run build` cada 2h sin `npm install` previo y commitea los archivos generados directamente al repo (no hay build separado en la plataforma de hosting). Minificar con una dependencia nueva (terser/clean-css) requeriría añadir `npm ci` al workflow; generar `.min.css`/`.min.js` y cambiar las 78+ referencias sin also actualizar qué commitea el workflow arriesgaba dejar el sitio sirviendo assets rotos o desatualizados tras el próximo cron. La portada pesa ~165 KB (33% del objetivo de 500 KB) sin minificar, así que no es urgente. La consolidación de los 16 CSS en pocos ficheros por plantilla se hará en Fase D junto con los tokens de diseño nuevos, para no reescribir el CSS dos veces.
- **Fuentes**: ya eran 100% de sistema (`Inter, ui-sans-serif, system-ui...` + `Georgia`/`Arial`), sin `@font-face` externo. Nada que optimizar — el máximo de 2 familias y el coste de red cero ya se cumplían antes de esta fase.
- **I14 (deuda técnica menor)**: `guia-util/index.html` sigue duplicando `initMobileMenu()` inline en vez de reusar `js/app.js`. No se tocó: `app.js` intentaría poblar `#featured-news`/`#news-container`/`#guide-container`, que no existen en esa página (usa IDs propios `#guide-page-container`), así que el riesgo de tocarlo no compensaba el beneficio de deduplicar código en este bloque.

## 10. Peso antes/después

| Página | Antes (Fase A) | Después (Fase C) | Objetivo |
|---|---|---|---|
| Portada (HTML+CSS+JS) | 134,7 KB | 164,6 KB* | < 500 KB ✅ |
| Noticia (HTML+CSS+JS) | 77,9 KB | 84,5 KB* | — |
| Categoría (HTML+CSS+JS) | — | 70,0 KB | — |

\* El aumento es esperado y deseado: portada y noticia ahora incluyen contenido HTML real (tarjetas de noticia/guía estáticas, JSON-LD, Twitter Card completa, `article-share.css`) que antes no existía o vivía solo en JS. Sigue muy por debajo del objetivo de 500 KB.

Verificado tras cada bloque de Fase B y C: 0 problemas de balance HTML, 0 JSON-LD inválido, 0 enlaces internos rotos nuevos, 0 referencias CSS/JS rotas — en los 78 archivos HTML del sitio.

---

## 11. Fase D — Plan de diseño (aprobado)

### Concepto
Periódico digital de pueblo con nivel de medio nacional: editorial, limpio, jerarquía tipográfica fuerte. La portada responde en 5 segundos a "¿qué pasa hoy en Alhaurín?" — noticia principal grande + franja de utilidad inmediata visible sin scroll en móvil.

### Paleta — "sierra y olivar"
Acento único en oliva: raíz local directa (Alhaurín el Grande a los pies de la Sierra de Mijas, paisaje de olivar) y neutral respecto a las dos hermandades locales.

```css
--bg: #faf7f2;   --paper: #ffffff;   --ink: #1c1f1b;   --muted: #5b6058;   --line: #e4e0d5;
--accent: #455c36;   --accent-dark: #34462a;   --accent-soft: #eaeee1;
```

Contraste verificado (WCAG): `ink/bg` 15,6:1 · `accent/bg` 6,9:1 · `accent/accent-soft` 6,3:1 · `white/accent-dark` 10,2:1 · `muted/bg` 6,0:1.

### Tipografía
- Display (titulares): **Fraunces** (Google Fonts, pesos 600/700, `font-display: swap`, `preconnect`) — serif editorial con carácter, evita Inter/Roboto para display.
- Cuerpo: pila de sistema existente (ya muy legible, coste de red cero).
- Base móvil 17px (ya cumplía desde una fase SEO anterior).

### Firma visual: "la franja de hoy"
Franja bajo la cabecera con fecha+santoral · tiempo · farmacia de guardia, fondo `--accent-soft`. Versión completa en portada, reducida en el resto del sitio. Resto del sitio disciplinado: sin colores por categoría.

### Wireframes
Ver detalle completo en la conversación de diseño; portada móvil = franja de hoy + noticia principal + ads reservados + listado + comercios + guía; portada desktop = misma jerarquía a 2 columnas con sidebar de publicidad.

### Ejecutado — Bloque "tokens y base común"
- `css/styles.css`: `:root` reescrito con la paleta y escala tipográfica nuevas (tokens `--text-*`), con `--brand`/`--brand-soft`/`--gold` mantenidos como **alias heredados** hacia los tokens nuevos para que el resto de CSS (aún no migrado) siga renderizando coherente hasta que se toque en los siguientes bloques (portada/noticia/secciones).
- Reemplazados los `rgba()`/hex hardcodeados del navy y dorado antiguos por los del nuevo acento en las reglas compartidas de `styles.css` (header, logo, botones, `.section-kicker`, `.featured-label`, `.source-mini-tag`, etc.).
- `font-family: Georgia, "Times New Roman", serif` → `var(--font-display)` en las 6 reglas de `styles.css` que ya usaban Georgia como serif editorial.
- Fraunces cargada en las 78 páginas del sitio (generadores + páginas manuales), con `preconnect` a `fonts.googleapis.com`/`fonts.gstatic.com`.
- `theme-color` de las 16 páginas manuales actualizado de `#17324d` (navy) a `#1c1f1b` (ink).

Pendiente (siguientes commits, uno por plantilla): migrar `home-*.css` (portada), `article.css`/`article-share.css` (noticia), y el resto de CSS de sección (`sponsored-cards.css`, `ux-*.css`, etc.) de los nombres de variable heredados a los tokens nuevos, y aplicar la "franja de hoy" como firma visual real en el HTML de portada.
