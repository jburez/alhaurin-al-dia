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

- [ ] `/`, `/noticias/`, `/guia-util/` tienen enlaces `<a href>` reales a contenido en el HTML servido (curl/view-source, sin ejecutar JS)
- [ ] Las 30+ páginas de noticia tienen JSON-LD `NewsArticle` válido (validar con el test de resultados enriquecidos de Google)
- [ ] `sitemap-index.xml` referencia los 5 sitemaps existentes
- [ ] 0 enlaces internos rotos (repetir el script de verificación de enlaces usado en esta auditoría)
- [ ] Twitter Card completa (title+description+image) en páginas de noticia y hubs principales
- [ ] Contraste AA en `.section-kicker` y cualquier uso de `--muted`
- [ ] Foco visible en los 2 inputs corregidos
- [ ] Menú móvil funcional en `404.html`
