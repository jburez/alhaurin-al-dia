# Auditoría técnica, de automatizaciones y de diseño — Agosto 2026

Auditoría de solo lectura sobre `develop` (sitio en producción, `https://alhaurinaldia.es/`), realizada en desktop (1440px) y móvil (390px) sobre el sitio real, más lectura completa de los 8 workflows de GitHub Actions, sus scripts, y el CSS modular. No se ha modificado ningún fichero de contenido ni de código como parte de esta auditoría.

---

## 0. Aviso previo — estado del working tree

Al iniciar esta sesión `git status` estaba limpio. Durante la sesión aparecieron **273 ficheros sin trackear con sufijo " 2"** (`data/evento-slugs 2.json`, decenas de `planes/e-*/index 2.html`, `planes/calendario 2.js`, etc.). Se ha verificado que su contenido es **idéntico** al del fichero original correspondiente (`diff` vacío en la muestra comprobada), con timestamp unos minutos anterior y permisos distintos (`-rw-------` sin flags extendidos, frente a `-rw-r--r--@` del original).

Este patrón (`nombre 2.ext`) es típico de una **copia de conflicto de sincronización de iCloud Drive** — el repositorio vive en `~/Documents`, una ruta que en macOS suele estar sincronizada con iCloud Drive por defecto. No es un efecto de esta auditoría (de solo lectura, sin escritura de ficheros) ni de los workflows de GitHub Actions (no tienen acceso al disco local).

**No se ha tocado nada.** Recomendación: antes de tu próximo `git add`, revisa `git status` y decide si quieres `git clean` (revisa antes con `git clean -ndx` para ver qué borraría) o si prefieres primero confirmar en Ajustes del Sistema → Apple ID → iCloud Drive si "Escritorio y Documentos" está activado, para evitar que se repita.

---

## 1. Auditoría técnica — desktop y móvil

### 1.1 Qué se ha probado
Home, `/noticias/`, un artículo, `/categoria/municipal/`, `/guia-util/`, `/tiempo/`, `/avisos/`, `/boletin-oficial/`, `/planes/`, `/comercios/`, `/mi-alhaurin/`, `/seguimiento/`, `/radar-social/` y una URL 404 de prueba, en viewport desktop (1440×900) y móvil (390×844).

### 1.2 Resultado general
**Sólido.** Cero errores de JavaScript propios del sitio en consola (el único error visto viene de una extensión de Chrome del entorno de prueba, no del sitio). Todas las peticiones a `data/*.json` devuelven 200. El sitio tiene página 404 personalizada y bien diseñada, con CTAs de recuperación (volver a portada, ver noticias, guía útil, farmacias, teléfonos).

### 1.3 Rendimiento
- Home: `DOMContentLoaded` ≈ 106 ms, `load` ≈ 382 ms, TTFB ≈ 18 ms — muy rápido.
- **13 hojas de estilo cargadas en `<head>` de forma render-blocking** en la home (`css/styles.css`, `mobile.css`, `ads.css`, `news-meta.css`, `home-hero.css`, `home-live.css`, `home-guardia.css`, `home-agenda.css`, `home-commerce.css`, `home-news.css`, `ux-desktop.css`, `ux-mobile.css`, `mobile-appview.css`, más Google Fonts) — 13 peticiones HTTP antes de poder pintar. Peso conjunto ≈ 124 KB sin comprimir; destaca `home-live.css` (36,5 KB) y `styles.css` (37,3 KB) como los más pesados. No es crítico gracias a HTTP/2, pero es candidato claro a bundling/minificación si se quiere apurar el rendimiento, sobre todo en 3G/4G real (Lighthouse probablemente penaliza por "render-blocking resources").
- JS bien resuelto: 5 scripts locales con `defer`, solo el script de AdSense es `async` — patrón correcto, no bloquea el render.

### 1.4 Desktop — hallazgos
- Diseño y comportamiento consistentes en todas las plantillas probadas.
- Un único hallazgo verificado y descartado: en `/categoria/municipal/` las imágenes de las noticias no cargaron en el navegador de prueba. Se comprobó con `curl -I` que las URLs de imagen (`i1.ytimg.com`, `alhaurinelgrande.es/wp-content/...`) devuelven `200` y `content-type: image/jpeg` correctos — **no es un bug del sitio**, sino un bloqueo del propio entorno de automatización (extensión de Chrome) hacia esos dominios externos. Descartado tras verificación.

### 1.5 Móvil — hallazgos
- Menú hamburguesa con overlay de tarjetas grandes, muy buen tamaño de tap target (~80px de alto por opción).
- Barra de navegación inferior fija tipo app (Inicio / Mi Alhaurín / Guardia / Noticias / Radar) — buen patrón de UX móvil, **pero solo aparece en la home**. En páginas de artículo, guía útil, avisos, etc. no está presente. Si es intencional (para no robar espacio de lectura) no hace falta tocarlo, pero conviene confirmar que es decisión de producto y no un olvido de integración.
- El calendario de `/planes/` (grid de mes en desktop) se transforma automáticamente en una **lista/agenda vertical por día** en móvil, en vez de intentar comprimir la cuadrícula — muy buena decisión de responsive, evita el problema típico de calendarios ilegibles en pantallas pequeñas.
- Un evento de la agenda ("Velá de Gracia") contiene la palabra suelta **"Screenshot"** dentro de la descripción visible (`¡Os esperamos el 1 de agosto...! Screenshot`) — no es un problema de diseño sino un resto de copia/OCR que se coló en el dato de origen; repórtalo en el pipeline de agenda (`scripts/actualizar_agenda_ayto.py` / `actualizar_agenda_alhaurinhoy.py`, ver §2).
- Sin errores de consola propios del sitio en móvil.

---

## 2. Auditoría de automatizaciones — qué se actualiza, cuándo y desde dónde

Investigación completa de los 8 workflows de `.github/workflows/`, todos los scripts que invocan, y contraste contra `docs/ARQUITECTURA.md`, `docs/MANUAL_ADMINISTRACION.md` y `docs/AUDITORIA-2026-07.md`. Hoy (14-ago-2026) España está en CEST (UTC+2); en horario de invierno (CET) los horarios de pared se adelantan 1h.

| Sección de la web | Qué la actualiza | Frecuencia (hora Madrid) | Fuente de datos original | Salida |
|---|---|---|---|---|
| **Noticias** | `generar-noticias.yml` → `generar_noticias_seguro.py` → dedupe → archivado → render | Cada 2h en punto (12×/día) + manual | 11 feeds RSS/Atom activos en `data/fuentes.json` (Ayuntamiento, Hermandad Ntro. Padre Jesús Nazareno, RTV Alhaurín, ATV YouTube, Fedelhorce, CD Alhaurino, Diario SUR, Málaga Hoy, Europa Press, Revista Lugar de Encuentro, GDR Valle del Guadalhorce) | `data/noticias.json`, `noticias/*.html`, `categoria/*/` |
| **Farmacia de guardia** | Render automático (cada build), pero el calendario **no** | Contenido: solo manual, sin cron | 12 imágenes/año del Ayuntamiento (extracción por color de celda, sin OCR) | `data/guardias-farmacias-2026.json` |
| **Avisos AEMET** | `actualizar-avisos-aemet.yml` | Cada hora en punto (24×/día) | Feed RSS público AEMET, zona "Sol y Guadalhorce" | `data/avisos-oficiales.json` |
| **Boletín oficial (BOP + Sede Electrónica)** | `actualizar-boletin-oficial.yml` | 09:00, 1×/día | BOP Málaga vía IMAP a Gmail personal (etiqueta `BOP-Malaga`) + scraping de la Sede Electrónica municipal | `data/boletin-oficial.json` |
| **Agenda/eventos** | `actualizar-agenda-ayto.yml` | 02:00, 08:00, 14:00, 20:00 (4×/día) | API REST WordPress del Ayuntamiento + API REST de alhaurinhoy.es (ambas fusionadas) | `data/agenda-local.json` |
| **Estado local (tráfico/avisos manuales de portada)** | Solo render | Sin fuente automática — edición humana directa del JSON | — | `data/estado-local.json`, `avisos-locales.json` |
| **Tiempo/AEMET (widget, 7 días, sol/luna, embalses)** | `update-local-status.yml` (nombre interno real "Actualizar tiempo AEMET") | 08:15, 12:15, 17:15 (3×/día) | XML público AEMET por municipio (código INE 29008) | `data/tiempo-aemet.json` |
| **Comercios destacados** | Solo render | Edición humana directa | — | `data/comercios-destacados.json` |
| **Guía útil** | Render dentro del build cada 2h | Contenido 100% manual | — | `data/guia-util.json`, `guia-util/*/` |
| **Sitemaps/SEO** | Dentro de `npm run build` | Cada 2h | Deriva del resto de `data/*.json` | `sitemap*.xml` |
| **Publicación** | `publicar-produccion.yml` | En cada push a `develop` (disparado 4 veces al día por los workflows de datos) | — | Merge a `main` + purga Cloudflare |

No existe ningún disparador fuera de GitHub Actions (sin `cron` de sistema, sin Zapier/IFTTT/webhooks externos) — la única superficie de automatización real son estos 8 workflows.

### 2.1 Secciones que dependen 100% de edición manual
Farmacia de guardia (calendario base), estado local/tráfico/avisos manuales de portada, comercios destacados, guía útil, transporte CTMAM, y las 5 páginas protegidas de guía útil (farmacias, vivir-en-alhaurin, aparcamiento, restaurantes, veterinarios).

### 2.2 Riesgos detectados
1. **Ningún workflow avisa si falla.** Todos los scripts están diseñados para conservar el último dato válido y salir sin error si la fuente externa cae — buen patrón defensivo, pero sin ningún aviso (Slack/email/issue), un fallo puede pasar desapercibido indefinidamente.
2. **`AEMET_API_KEY` es un secret sin uso real**: se declara en `update-local-status.yml` pero el script nunca lo lee (el XML de AEMET es público).
3. **Datos de `tiempo-aemet.json` presentados como "Fuente: AEMET" que en realidad están hardcodeados**: la fase lunar/orto/ocaso y los niveles de los 4 embalses del Guadalhorce son constantes fijas en el script, no datos reales — se desactualizarán con el tiempo (especialmente el nivel de los embalses, que varía por temporada) mostrando información incorrecta bajo una etiqueta de fuente oficial.
4. **Bug en el resumen de WhatsApp**: `generate-whatsapp-summary.js` busca campos que no existen en `tiempo-aemet.json`, así que el boletín (comiteado cada 2h) siempre muestra "Despejado / Soleado" en vez del tiempo real.
5. **Doble disparo de `publicar-produccion.yml`** en cada actualización de datos (push automático + llamada explícita) — inofensivo pero desperdicia minutos de Actions.
6. Acceso IMAP del BOP contra el Gmail **personal** del usuario (riesgo ya asumido conscientemente, documentado en el histórico de decisiones — no es nuevo, se reconfirma aquí).
7. **Fuentes RSS de terceros que pueden romperse sin aviso** (11 feeds externos): si cambian de formato, el filtrado silencioso hace que el contenido deje de aparecer sin ningún error visible.

### 2.3 ⚠️ Conflicto con una decisión de producto ya cerrada
En julio decidiste explícitamente: *"Agenda local: cuando se conecte la fuente 'Alhaurín Hoy', sustituye a `data/agenda-local.json` (no conviven ambas fuentes de agenda)"*. La implementación de hoy (commits de esta misma jornada, `actualizar_agenda_ayto.py` + `actualizar_agenda_alhaurinhoy.py`) hace lo contrario: **ambas fuentes conviven**, fusionadas por deduplicación difusa (fecha + tema) en el mismo `agenda-local.json`. Puede ser una decisión consciente y mejor que la original (más cobertura), pero como contradice algo ya cerrado, lo señalo explícitamente en vez de asumir que es correcto — mereces decidir si mantenerlo así o volver al criterio original de "una sola fuente sustituye a la otra".

### 2.4 Documentación desactualizada
- `docs/ARQUITECTURA.md` no menciona el bloque completo de agenda/eventos del Ayuntamiento + alhaurinhoy.es (todo de hoy) ni `actualizar_sede_electronica.py`.
- `docs/MANUAL_ADMINISTRACION.md` sigue instruyendo "editar `generar_noticias.py`" para añadir fuentes; desde hace semanas basta con editar `data/fuentes.json`.
- El fichero `update-local-status.yml` tiene un nombre engañoso: internamente se llama "Actualizar tiempo AEMET" y solo toca el widget de tiempo, no el "estado local" (tráfico/avisos) que su nombre de fichero sugiere.

---

## 3. Auditoría de diseño global

Punto de partida: el aspecto actual gusta y funciona — el sistema de tarjetas con borde fino, esquinas redondeadas suaves (6–8px), paleta cálida terrosa (`--bg #fbf9f5`, `--ink #1c1f1b`, verde oliva `--accent #455c36`), tipografía Inter y botones-píldora negros es coherente y reconocible en la inmensa mayoría del sitio. Lo que sigue son puntos concretos de **unificación**, no de rediseño.

### 3.1 Hallazgo principal: dos footers distintos en el sitio
Solo `index.html` usa el footer completo (`class="site-footer"`, fondo verde oscuro, 4 columnas: identidad + WhatsApp/contacto, Secciones, Tiempo y Seguimiento, Servicios, más el CTA "Destaca en Google Noticias"). **Las otras 499 páginas HTML del sitio** (todas las noticias, categorías, páginas de guía útil, planes de evento, etc.) usan un `<footer>` distinto, mucho más simple: una línea de copyright + una fila de 6 enlaces básicos (Noticias, Guía útil, Avisos, Tiempo, Planes, Comercios).

No es solo estético: el footer rico de la home enlaza a secciones que el footer simple **no** tiene (Boletín Oficial, Comparador, Agro Meteo, Radar Social, Sobre Nosotros, Contacto, Anunciarse, canal de WhatsApp) — desde cualquier noticia o página de guía útil, esos enlaces internos no existen. Unificar a un solo componente de footer (el rico) en las 500 páginas reforzaría tanto la coherencia visual como el enlazado interno/SEO. Nota: ya había constancia previa de una inconsistencia de navegación relacionada (el enlace a Boletín Oficial en el header solo se añadió a las 9 páginas de nivel superior, no a las ~60 de categoría/artículo/guía) — este hallazgo del footer es más amplio (500 páginas) y probablemente la misma causa raíz: las plantillas de página interna no comparten componente de footer/nav con la home.

### 3.2 Botón "Anunciarse" con color fuera de la paleta, solo en móvil
En el menú móvil (drawer de hamburguesa), el botón CTA "Anunciarse" usa:

```css
/* css/mobile.css:187, dentro del media query móvil */
.nav-links .nav-cta {
    background: linear-gradient(135deg, var(--brand), #254c72);
}
```

`#254c72` es un azul marino que **no existe como token** en `:root` de `css/styles.css` (la paleta declarada es `--bg`, `--paper`, `--ink`, `--muted`, `--line`, `--accent`, `--accent-dark`, `--accent-soft`, `--red-soft`). En cualquier otro sitio del site (nav desktop, `.nav-cta` base en `styles.css:213`, "Unirme al Canal", "Ver Guía Útil completa", filtros activos) el mismo tipo de botón primario es sólido `var(--brand)` (negro/tinta, `#1c1f1b`) o, cuando lleva degradado, combina `--brand` con `--accent-dark` (verde oscuro de la propia paleta) — nunca con un azul ajeno. Es un detalle de una sola línea de CSS, pero es el único punto de todo el sitio donde aparece un color que no pertenece al sistema.

### 3.3 Cosas que están funcionando muy bien (para no tocar)
- El calendario de `/planes/` que se convierte en agenda-lista en móvil en vez de comprimir la cuadrícula.
- El panel "Mi Alhaurín" (`/mi-alhaurin/`) y "Seguimiento" (`/seguimiento/`) mantienen exactamente el mismo lenguaje visual (tarjetas, chips de filtro, botones píldora) que el resto, a pesar de ser las páginas más "funcionales/dashboard" del sitio — no se han convertido en un widget desentonado, que es el riesgo típico en este tipo de páginas.
- La página 404 personalizada, con el mismo sistema de tarjetas y CTAs de recuperación coherentes con el resto.
- Consistencia de iconografía emoji + etiqueta de categoría en mayúsculas pequeñas en absolutamente todas las cards de contenido (noticias, guía, planes, avisos, edictos).

---

## 4. Resumen y prioridades sugeridas

1. **Revisar los 273 ficheros " 2" sin trackear** antes del próximo commit (§0) — no bloqueante pero conviene resolverlo pronto para no arrastrarlo.
2. **Decidir sobre el conflicto de la fuente de agenda** (§2.3) — es una decisión de producto tuya, no técnica.
3. **Unificar el footer** a un solo componente en las 500 páginas (§3.1) — el cambio de diseño con más impacto real (SEO + navegación + coherencia visual) de todo lo encontrado.
4. Corregir el azul `#254c72` del botón "Anunciarse" en móvil por `var(--accent-dark)` o negro sólido (§3.2) — cambio de una línea.
5. Revisar los datos hardcodeados de `tiempo-aemet.json` (sol/luna, embalses) que se muestran como si fueran de AEMET en tiempo real (§2.2.3).
6. Considerar bundlear/minificar las 13 hojas de estilo de la home si se quiere apurar rendimiento (§1.3) — no urgente, el sitio ya carga rápido.
7. Quitar el "Screenshot" suelto colado en la descripción del evento "Velá de Gracia" (§1.5) y revisar si el scraper de agenda deja más restos de este tipo.
