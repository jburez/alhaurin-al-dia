# Arquitectura de Alhaurín al Día

Documento actualizado para la rama `develop`.

## 1. Visión general

Alhaurín al Día es una web estática hiperlocal publicada como sitio HTML/CSS/JavaScript. No depende de un backend propio en tiempo de ejecución: las páginas se sirven como ficheros estáticos y el contenido dinámico se obtiene leyendo archivos JSON ubicados en `data/`.

Desde noviembre de 2026 el sitio se posiciona como **guía práctica de Alhaurín el Grande** (ver §15). Sus objetivos, por orden:

1. Utilidades diarias: farmacia de guardia, tiempo y avisos.
2. Agenda de planes indexable y página «Este fin de semana».
3. Guías prácticas propias (trámites, salud, educación, transporte, ocio…) y la guía útil de servicios.
4. Directorio de comercios con espacios de comercio destacado.
5. Actualidad: titulares de fuentes externas en segundo plano (noindex, con atribución visible).

## 2. Capas de la arquitectura

```text
Usuario / navegador
        |
        v
GitHub Pages / hosting estático
        |
        +-- HTML estático
        +-- CSS modular
        +-- JavaScript cliente
        +-- JSON en /data
        +-- Assets e imágenes
        |
        v
Scripts de generación ejecutados en local o CI
        |
        +-- Feeds externos de noticias
        +-- OpenAI opcional para edición SEO
        +-- Generación de páginas HTML
        +-- Generación de sitemaps
```

## 3. Estructura principal del repositorio

```text
/
├── index.html
├── app.js
├── home-live.js
├── home-guardia.js
├── home-agenda.js
├── home-commerce.js
├── styles.css
├── mobile.css
├── ads.css
├── article.css
├── data/
│   ├── noticias.json
│   ├── noticias-archivo.json
│   ├── fuentes.json
│   ├── geografia.json
│   ├── avisos-oficiales.json
│   ├── boletin-oficial.json
│   ├── guia-util.json
│   ├── estado-local.json
│   ├── avisos-locales.json
│   ├── agenda-local.json
│   ├── comercios-destacados.json
│   ├── farmacias.json
│   └── guardias-farmacias-2026.json
├── noticias/
│   ├── index.html
│   ├── archivo/
│   │   └── index.html
│   └── *.html
├── categoria/
│   └── */index.html
├── guia-util/
│   └── */index.html
├── scripts/
│   ├── generar_noticias.py
│   ├── generar_noticias_seguro.py
│   ├── dedupe-news.js
│   ├── archive-orphan-news.js
│   ├── render-news-archive.js
│   ├── render-home-static.js
│   ├── render-guide-pages.js
│   ├── generate-sitemaps.js
│   ├── audit-seo.js
│   ├── audit-orphan-pages.js
│   └── check-publish.js
├── sitemap.xml
├── sitemap-index.xml
├── sitemap-news.xml
├── sitemap-noticias.xml
├── sitemap-farmacias.xml
└── package.json
```

## 4. Frontend

### 4.1 `index.html`

> **Desde noviembre de 2026** la portada la genera entera `scripts/render-home.js` (ver §15.2). Lo que sigue describe la portada anterior y se conserva como referencia histórica.

Era la plantilla principal de la portada. Incluía:

- Metadatos SEO básicos.
- Canonical de la home.
- Open Graph.
- JSON-LD de `WebSite`, `NewsMediaOrganization` y `WebPage`.
- Cabecera, navegación, hero, panel diario, farmacia de guardia, agenda, comercio destacado, últimas noticias y guía útil.
- Carga de CSS modular.
- Carga de JavaScript por bloques.

La home funciona como una plantilla semiestática: algunos contenedores quedan vacíos y son rellenados por JavaScript con datos procedentes de JSON.

Contenedores dinámicos importantes:

- `#daily-status`: panel diario.
- `#home-pharmacy-guard`: farmacia de guardia.
- `#home-agenda-list`: agenda próxima.
- `#featured-commerce-list`: comercios destacados.
- `#featured-news`: noticia destacada.
- `#news-container`: noticias secundarias.
- `#guide-container`: tarjetas de guía útil.

### 4.2 CSS

La web usa una estrategia de CSS modular. `styles.css` actúa como base visual global y el resto de hojas refuerzan secciones concretas.

Archivos principales:

- `styles.css`: tokens visuales, layout general, tipografía, tarjetas, botones, cabecera y footer.
- `mobile.css`: ajustes responsive generales.
- `ads.css`: espacios publicitarios.
- `article.css`: páginas de noticia.
- `news-meta.css`: metadatos de noticias.
- `home-hero.css`: hero de portada.
- `home-live.css`: panel diario y widget de tiempo.
- `home-guardia.css`: bloque de farmacia de guardia.
- `home-agenda.css`: agenda de portada.
- `home-commerce.css`: comercios destacados.
- `home-news.css`: últimas noticias en home.
- `ux-desktop.css` y `ux-mobile.css`: mejoras específicas de experiencia de usuario.

### 4.3 JavaScript cliente

La web no usa framework. Todo el comportamiento se implementa con JavaScript vanilla.

#### `app.js`

Responsabilidades:

- Detecta la raíz del sitio para resolver rutas relativas.
- Inicializa el menú móvil.
- Carga `data/noticias.json`.
- Renderiza noticia destacada y listado de noticias.
- Carga `data/guia-util.json`.
- Renderiza tarjetas de guía útil.
- Inserta sugerencias de hubs útiles dentro de páginas de noticia.
- Inserta bloques comerciales patrocinados en páginas concretas.

#### `home-live.js`

Responsabilidades:

- Carga `data/estado-local.json`.
- Carga `data/avisos-locales.json`.
- Fusiona avisos activos con las tarjetas base del panel diario.
- Renderiza estado de tiempo, tráfico, avisos, agenda y servicios.

#### `home-guardia.js`

Responsabilidades:

- Carga `data/farmacias.json`.
- Carga `data/guardias-farmacias-2026.json`.
- Calcula la clave del día actual en formato `YYYY-MM-DD`.
- Muestra la farmacia de guardia correspondiente.
- Si no hay guardia configurada, muestra estado pendiente y enlaces a calendario/fuente oficial.

#### `home-agenda.js`

Responsabilidades:

- Carga `data/agenda-local.json`.
- Filtra eventos activos y futuros.
- Ordena por fecha de inicio.
- Muestra hasta 4 eventos próximos.

#### `home-commerce.js`

Responsabilidades:

- Carga `data/comercios-destacados.json`.
- Filtra comercios activos.
- Muestra hasta 2 comercios destacados en portada.
- Si no hay comercios activos, muestra CTA para anunciarse.

## 5. Datos JSON

La carpeta `data/` es el centro editorial de la web.

### 5.1 `data/noticias.json`

Contiene las noticias publicadas. Lo genera `scripts/generar_noticias_seguro.py` (envuelve a `scripts/generar_noticias.py`, ver sección 6).

Campos habituales por noticia:

```json
{
  "id": "identificador-unico",
  "titulo": "Titular SEO",
  "descripcion": "Entradilla breve",
  "cuerpo": "Texto de la noticia",
  "categoria": "Actualidad",
  "fuente": "Fuente original",
  "fecha": "2026-05-13T12:00:00+02:00",
  "enlace": "https://fuente-original/",
  "pagina": "noticias/titular.html",
  "imagen": "https://...",
  "seo_keywords": ["alhaurín", "noticias"],
  "requiere_revision_geografica": false
}
```

`requiere_revision_geografica` lo añade el filtro geográfico de `data/geografia.json` (ver 5.9) cuando el texto menciona el municipio principal junto a un municipio limítrofe (p. ej. Alhaurín de la Torre). No bloquea la publicación por sí solo — queda como aviso no bloqueante en `scripts/validar_contenido.py`, a la espera del panel de revisión editorial previsto para cuando se conecten fuentes de nivel de confianza C/D.

`scripts/dedupe-news.js` (`npm run news:dedupe`) limita este fichero a `MAX_NOTICIAS_TOTAL` (variable de entorno, por defecto 30) noticias activas, ordenadas por fecha descendente. Las que superan el límite no se pierden: se archivan en `data/noticias-archivo.json` (ver 5.1.1).

#### 5.1.1 `data/noticias-archivo.json`

Histórico de noticias que salieron de `data/noticias.json` por el límite de `MAX_NOTICIAS_TOTAL`, con el mismo esquema de campos que 5.1. No tiene límite de tamaño ni fecha de expiración. Alimenta `/noticias/archivo/` (`scripts/render-news-archive.js`, `npm run news:archive:page`).

Antes de esta hemeroteca, la limpieza de huérfanas (`scripts/clean-orphan-news.js`, ya eliminado) borraba directamente el HTML de las noticias que salían del listado activo. Eso generaba cientos de URLs que Google había indexado y que luego devolvían 404 al desaparecer del disco. Ahora ese HTML se conserva sin más — el archivo JSON solo existe para poder listarlo en `/noticias/archivo/` — y `scripts/archive-orphan-news.js` (`npm run news:orphans:archive`) actúa como red de seguridad para huérfanas que aparezcan por otra vía, dándolas de alta a partir de los metadatos del propio HTML si aún no están archivadas.

### 5.2 `data/guia-util.json`

Base de datos de recursos de guía útil. Alimenta tarjetas en portada y páginas internas generadas.

Campos habituales:

```json
{
  "id": "telefonos",
  "titulo": "Teléfonos útiles",
  "descripcion": "Emergencias y contactos básicos.",
  "categoria": "Guía útil",
  "icono": "☎️",
  "pagina": "guia-util/telefonos/",
  "items": ["Emergencias 112"],
  "links": [
    { "texto": "Fuente oficial", "url": "https://..." }
  ]
}
```

### 5.3 `data/estado-local.json`

Configura el panel diario base: tiempo, tráfico, avisos, agenda y servicios. Cada `item` puede tener los campos `id`, `icono`, `titulo`, `valor`, `detalle`, `estado`, `fuente`, `cta` y `url`.

Estados visuales admitidos:

- `ok`: situación normal.
- `warning`: aviso.
- `alert`: atención alta.
- `neutral`: información general.

### 5.4 `data/avisos-locales.json`

Lista avisos activos o programados. `home-live.js` puede sustituir tarjetas base del panel diario si encuentra avisos activos de tráfico, agenda o avisos generales.

Estructura recomendada:

```json
{
  "actualizado": "2026-05-13T12:25:00+02:00",
  "resumen": "Avisos locales activos.",
  "avisos": [
    {
      "activo": true,
      "tipo": "tráfico",
      "titulo": "Corte puntual en calle ejemplo",
      "valor": "Corte activo",
      "detalle": "Descripción breve del aviso.",
      "estado": "warning",
      "inicio": "2026-05-13T09:00:00+02:00",
      "fin": "2026-05-13T14:00:00+02:00",
      "fuente": "Ayuntamiento",
      "cta": "Ver aviso",
      "url": "./avisos/"
    }
  ]
}
```

### 5.5 `data/agenda-local.json`

Eventos próximos para la portada.

```json
{
  "actualizado": "2026-05-13T00:00:00+02:00",
  "resumen": "Agenda local.",
  "eventos": [
    {
      "activo": true,
      "tipo": "Agenda",
      "titulo": "Evento local",
      "descripcion": "Resumen del evento.",
      "lugar": "Alhaurín el Grande",
      "inicio": "2026-05-14T20:00:00+02:00",
      "fin": "2026-05-14T22:00:00+02:00",
      "estado": "neutral",
      "cta": "Ver detalle",
      "url": "./planes/"
    }
  ]
}
```

### 5.6 `data/comercios-destacados.json`

Comercios o patrocinadores destacados de portada.

Campos habituales:

- `activo`
- `nombre`
- `descripcion`
- `categoria`
- `zona`
- `telefonoHref`
- `url`
- `imagen`
- `etiqueta`
- `cta`

### 5.7 `data/farmacias.json` y `data/guardias-farmacias-2026.json`

`farmacias.json` contiene las fichas base de farmacias. `guardias-farmacias-2026.json` relaciona cada fecha con el `id` de farmacia correspondiente.

```json
{
  "meta": {
    "fuente": "https://alhaurinelgrande.es/farmacias/",
    "descripcion": "Calendario de guardias de farmacias de Alhaurín el Grande. Horario habitual de 9:30 a 9:30.",
    "timezone": "Europe/Madrid",
    "huecos_sin_dato": ["2026-03-01", "2026-09-11", "2026-09-12", "2026-09-13"]
  },
  "guardias": {
    "2026-05-13": "farmacia-ejemplo"
  }
}
```

**Fuente y extracción (`scripts/extraer_calendario_farmacias.py`, 2026-07-31)**: el Ayuntamiento no publica el calendario de guardias en texto, tabla ni API — publica 12 imágenes (una por mes) en su galería de WordPress, cada una un gráfico con una cuadrícula de días coloreada según una leyenda de 7 colores (uno por farmacia). En vez de OCR (poco fiable para decidir qué farmacia abre de noche), el script calcula matemáticamente en qué celda de la cuadrícula cae cada día (módulo `calendar` de Python) y clasifica el color de esa celda por distancia RGB a los 7 colores de la leyenda, muestreados de la propia imagen. Verificado visualmente mes a mes contra las 12 imágenes reales de 2026.

- **Herramienta manual, no un workflow programado**: la fuente solo cambia cuando el Ayuntamiento publica un calendario nuevo (una vez al año), así que no tiene cron en GitHub Actions. Se re-ejecuta a mano cuando haya un calendario nuevo, revisando visualmente antes de confiar en el resultado (recalibrar `GRID_COL_BOUNDS`/`GRID_ROW_BOUNDS`/`LEGEND_2026` si cambia el diseño).
- **`huecos_sin_dato`**: la propia imagen del Ayuntamiento tiene huecos reales (celdas sin colorear) para el 1 de marzo y el 11-13 de septiembre de 2026 — verificado visualmente, no es un fallo de extracción. Esos días no tienen entrada en `guardias`; la interfaz ya está preparada para mostrar "Sin dato"/"Guardia pendiente de completar" en vez de asumir una farmacia.
- **Celdas fusionadas**: cuando el último día del mes desborda la cuadrícula de 5 filas, la imagen del Ayuntamiento lo fusiona visualmente con el día anterior en la misma celda de color (visto en el 31 de agosto y el 30 de noviembre de 2026); el script reutiliza el color del día anterior en ese caso concreto, no de forma genérica.

### 5.8 `data/fuentes.json`

Registro de fuentes de noticias (sustituye a la constante `FUENTES` que antes vivía dentro de `scripts/generar_noticias.py`). Cada entrada es una fuente RSS/Atom con su nivel de confianza editorial.

```json
{
  "id": "ayuntamiento-alhaurin-el-grande",
  "nombre": "Ayuntamiento Alhaurín el Grande",
  "url": "https://alhaurinelgrande.es/feed/",
  "metodo": "rss",
  "nivel_confianza": "A",
  "prioridad": 120,
  "activa": true,
  "categoria_contenido": "noticia",
  "condiciones_reutilizacion": "Fuente oficial municipal; imagen destacada reutilizable como fuente oficial.",
  "notas": ""
}
```

Niveles de confianza (A–D, ver el informe de auditoría de fuentes 2026-07-20, sección G.2):

- **A — oficial**: Ayuntamiento y organismos públicos.
- **B — entidad local verificada**: hermandades, medios locales, clubes, asociaciones.
- **C — medio periodístico**: agencias y prensa provincial/regional.
- **D — redes sociales / ciudadanía**: no automatizable, siempre revisión manual (aún sin fuentes activas de este nivel).

Añadir una fuente RSS/Atom nueva ya no requiere tocar código: basta con añadir una entrada con `activa: true` a este fichero. `scripts/generar_noticias.py` la carga en `obtener_noticias()` vía `cargar_fuentes()`, y `prioridad_fuente()` consulta el campo `prioridad` de esta misma lista en vez de un `if/elif` fijo en el código.

### 5.9 `data/geografia.json`

Filtro geográfico compartido, sustituye a la comprobación de texto plano que antes vivía solo dentro de `es_noticia_relevante_local()`.

```json
{
  "municipio_principal": "Alhaurín el Grande",
  "codigo_ine": "29008",
  "codigo_postal": "29120",
  "entidades_inclusion": ["Alhaurín el Grande", "Sierra de Alhaurín", "Valle del Guadalhorce", "A-404", "A-355"],
  "entidades_revision_manual": ["Alhaurín de la Torre", "Coín", "Cártama", "Mijas", "Málaga capital"],
  "entidades_exclusion_si_solas": ["Alhaurín de la Torre"]
}
```

`evaluar_relevancia_geografica()` en `scripts/generar_noticias.py` usa tres capas:

1. **Exclusión**: menciona una entidad de `entidades_exclusion_si_solas` sin el municipio principal → se descarta.
2. **Inclusión**: no menciona el municipio ni ninguna `entidades_inclusion` → se descarta.
3. **Revisión manual**: menciona el municipio junto a una entidad de `entidades_revision_manual` (riesgo de confundir Alhaurín el Grande con un municipio limítrofe) → se mantiene, pero se marca `requiere_revision_geografica: true` en la noticia en vez de publicarse sin más.

### 5.10 `data/avisos-oficiales.json`

Avisos oficiales con ciclo de vida, generado por `scripts/actualizar_avisos_aemet.py`. Ver la sección 14 (Modelo de contenido — tipos) para el esquema completo y el detalle de la fuente AEMET conectada.

## 6. Generación de noticias

El punto de entrada del pipeline es `scripts/generar_noticias_seguro.py` (`npm run news`). Envuelve a `scripts/generar_noticias.py`, que sigue conteniendo la lógica base de extracción, filtrado y generación de páginas.

Flujo:

1. `generar_noticias.py` lee las fuentes activas de `data/fuentes.json` (ver 5.8).
2. Filtra noticias relevantes con el filtro geográfico de 3 capas de `data/geografia.json` (ver 5.9).
3. Limpia HTML y normaliza texto.
4. Calcula prioridad por fuente (desde `data/fuentes.json`) y fecha.
5. Detecta categoría automáticamente.
6. Solo si se ejecuta con `--reescribir-ia` **y** existe `OPENAI_API_KEY`, mejora titular, entradilla, cuerpo y keywords con IA. Por defecto está apagado: reescribir contenido ajeno con IA es lo que Google penaliza como contenido de poco valor. Las entradas ya reescritas en ejecuciones anteriores siguen reutilizándose desde la caché del registro editorial, sin llamadas nuevas.
7. Toda noticia generada lleva `"origen": "rss"`. En `--modo agenda`, las entradas que parecen eventos (palabra clave como «concierto», «feria», «taller», «procesión», «convocatoria»… más una fecha futura en el texto; ver `scripts/lib/detector_eventos.py`) se guardan como borrador en `data/agenda_borradores.json` en vez de publicarse como noticia. Los borradores nunca se publican solos.
8. `generar_noticias_seguro.py` sanea los titulares (rescata o descarta los cortados/incompletos) y deduplica por URL/ID exacto — la deduplicación fina por similitud editorial vive en `scripts/dedupe-news.js` (`npm run news:dedupe`, paso siguiente del pipeline), no aquí.
9. Genera `data/noticias.json`.
10. Genera páginas HTML individuales en `noticias/` (noindex si `origen` es `rss`).
11. Genera páginas de categoría en `categoria/` (noindex mientras no contengan noticias originales).

Flags (en `generar_noticias.py` y `generar_noticias_seguro.py`):

```bash
python3 scripts/generar_noticias_seguro.py                    # modo noticias, sin IA (por defecto)
python3 scripts/generar_noticias_seguro.py --reescribir-ia    # activa la reescritura con OpenAI
python3 scripts/generar_noticias_seguro.py --modo agenda      # desvía eventos a data/agenda_borradores.json
npm run news:agenda                                           # equivalente a --modo agenda
```

`generar_noticias.py` acepta los mismos flags y delega en `generar_noticias_seguro.py`.

Fuentes actuales: ver `data/fuentes.json` (5.8) — ya no se documentan aquí como lista fija, para evitar que este documento y el dato real diverjan.

Variables de entorno relevantes:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

Sin `--reescribir-ia` (o sin API key), el script usa el fallback editorial local.

## 7. Generación de páginas

### 7.1 Noticias

Las noticias individuales se generan desde `generar_noticias.py`. Cada noticia tiene HTML propio, canonical, schema `NewsArticle`, breadcrumbs y enlaces relacionados.

### 7.2 Categorías

También se generan desde `generar_noticias.py`. Agrupan noticias por categoría y crean páginas bajo `categoria/<slug>/index.html`.

### 7.3 Guía útil

`scripts/render-guide-pages.js` lee `data/guia-util.json` y genera páginas internas para cada recurso, excepto IDs protegidos en `SKIP_IDS`.

IDs protegidos actuales:

- `farmacias`
- `vivir-en-alhaurin`
- `aparcamiento`
- `restaurantes`
- `veterinarios`

Estos se excluyen porque tienen diseño o lógica específica.

### 7.4 Home estática limpia (histórico)

> Sustituido en noviembre de 2026: `render-home-static.js` y `render-home-widgets-static.js` delegan ahora en `scripts/render-home.js`.

`scripts/render-home-static.js` limpiaba los contenedores dinámicos de la home para evitar que se queden restos HTML embebidos antes de que `app.js` renderice el contenido.

Contenedores limpiados:

- `featured-news`
- `news-container`
- `guide-container`

## 8. SEO y sitemaps

La arquitectura SEO se basa en:

- HTML estático indexable.
- Canonical por página.
- Metadescripciones por página.
- Open Graph.
- JSON-LD.
- Sitemaps segmentados.
- Google News sitemap para noticias recientes.

`scripts/generate-sitemaps.js` genera:

- `sitemap.xml`: sitemap principal (todas las URLs indexables).
- `sitemap-farmacias.xml`: URLs de farmacias de la guía útil.
- `sitemap-servicios.xml`: utilidades e información (farmacia de guardia, avisos, tiempo, guía útil, contacto, sobre el proyecto, legales).
- `sitemap-guias.xml`: `/guias/` y guías publicadas.
- `sitemap-agenda.xml`: `/agenda/`, `/este-fin-de-semana/` y fichas de evento indexables (futuras y de los últimos 30 días).
- `sitemap-comercios.xml`: directorio de comercios y `/anunciarse/`.
- `sitemap-noticias.xml` y `sitemap-news.xml`: solo noticias con `origen: "original"`.
- `sitemap-index.xml`: índice; los sitemaps vacíos se escriben pero no se anuncian.

Regla general: **ninguna página con `noindex` entra en un sitemap** (`isNoindex()`), y `audit-seo.js` falla si detecta lo contrario.

## 9. Scripts npm

Definidos en `package.json`:

```bash
npm run news                # Genera noticias desde feeds
npm run news:dedupe         # Deduplica noticias escribiendo cambios
npm run news:dedupe:dry     # Deduplica en modo simulación
npm run news:orphans:dry     # Detecta páginas huérfanas de noticias
npm run news:orphans:archive # Archiva huérfanas que aún no estén en noticias-archivo.json
npm run news:archive:page    # Regenera /noticias/archivo/ desde noticias-archivo.json
npm run seo                 # Limpia SearchAction
npm run home:static         # Genera la portada (scripts/render-home.js)
npm run news:origin         # Aplica origen rss/original: noindex y atribución en noticias
npm run news:agenda         # Noticias en --modo agenda (eventos a borradores)
npm run guias:static        # Genera /guias/ y /guias/<slug>/
npm run agenda:static       # Normaliza la agenda y genera fichas, /agenda/ y /este-fin-de-semana/
npm run utilidades:static   # Genera /farmacia-de-guardia/ y /avisos/
npm run comercios:static    # Genera /comercios/, categorías, fichas y /anunciarse/
npm run info:static         # Genera sobre el proyecto, contacto y páginas legales
npm run chrome:sync         # Propaga nav, pie y bloque de consentimiento a todo el HTML
npm run build:site          # Build completo sin descargar feeds
npm run guide:pages         # Genera páginas internas de guía útil
npm run sitemap             # Regenera sitemaps
npm run seo:audit           # Auditoría SEO no bloqueante
npm run seo:audit:strict    # Auditoría SEO estricta
npm run seo:orphans         # Auditoría de huérfanas no bloqueante
npm run seo:orphans:strict  # Auditoría de huérfanas estricta
npm run publish:check       # Comprobación previa a publicar
npm run daily               # Build + comprobación de publicación
npm run build               # Pipeline completo (news + build:site)
```

## 10. Pipeline recomendado

```text
Editar datos / código
        |
        v
npm run build
        |
        +-- Generar noticias
        +-- Deduplicar
        +-- Aplicar SEO
        +-- Limpiar home
        +-- Generar guía útil
        +-- Generar sitemaps
        +-- Auditar SEO
        +-- Auditar huérfanas
        |
        v
npm run publish:check
        |
        v
git status / revisión manual
        |
        v
commit en develop
        |
        v
merge a main cuando esté validado
```

## 11. Despliegue

> **Atención:** el workflow `publicar-produccion.yml` se dispara con cada push a `develop`, fusiona en `main` y purga la caché de Cloudflare. Un push a `develop` es, por tanto, un despliegue. Para trabajo que deba revisarse antes, usar una rama aparte.

La web está preparada para publicarse como sitio estático, por ejemplo con GitHub Pages o equivalente. La rama de trabajo recomendada es `develop`; la rama `main` debe recibir únicamente cambios ya validados.

Flujo Git recomendado:

```bash
git checkout develop
git pull origin develop
npm run build
npm run publish:check
git status
git add .
git commit -m "descripción del cambio"
git push origin develop
```

Para publicar en `main`:

```bash
git checkout main
git pull origin main
git merge develop
npm run publish:check
git push origin main
```

## 12. Riesgos arquitectónicos actuales

1. La web depende de JSON locales; un JSON mal formado puede romper bloques dinámicos.
2. La generación de noticias depende de feeds externos que pueden cambiar formato o caer.
3. La IA es opcional, pero si la API key existe y no tiene cuota el script debe caer a fallback o registrar error.
4. La portada depende de varios JS independientes; si se elimina un ID del HTML, el módulo asociado dejará de renderizar.
5. El contenido local sensible, como farmacia de guardia o avisos, debe verificarse siempre con fuente oficial.
6. Hay páginas protegidas de guía útil que no deben ser sobrescritas por generación automática.

## 13. Principios de mantenimiento

- Mantener `develop` como rama de trabajo.
- No editar a mano páginas generadas si proceden de scripts; editar la fuente JSON o el script.
- Validar siempre JSON antes de subir.
- Ejecutar `npm run build` antes de publicar.
- Confirmar farmacias, avisos y datos sensibles con fuentes oficiales.
- Mantener sitemaps regenerados tras cambios de páginas.
- Evitar duplicar lógica: si un bloque se usa en varias páginas, convertirlo en dato JSON o función JS.

## 14. Modelo de contenido — tipos

El modelo de datos histórico solo representaba un tipo de contenido: **noticia** (`data/noticias.json`). El informe de auditoría de fuentes (2026-07-20, sección E.2/G.1) identificó esto como una carencia de fondo — forzar avisos, eventos o convocatorias al esquema de noticia fue la causa directa de titulares duplicados detectados y corregidos esa misma sesión.

Desde la Fase 1a de ese roadmap, la entidad **aviso** ya tiene una fuente real conectada: `scripts/actualizar_avisos_aemet.py` alimenta `data/avisos-oficiales.json` con los avisos activos de AEMET para la zona **Sol y Guadalhorce** (incluye Alhaurín el Grande), vía el feed RSS público de esa zona — no requiere `AEMET_API_KEY`. Se ejecuta cada hora (`.github/workflows/actualizar-avisos-aemet.yml`), con el mismo patrón defensivo que `actualizar_tiempo_aemet.py`: si AEMET no responde, conserva el último fichero válido.

```json
{
  "id": "aemet-AFAZ612903ATTA2219",
  "tipo": "meteorologico",
  "nivel": "amarillo",
  "titulo": "Aviso. Nivel amarillo. Temperaturas máximas. Sol y Guadalhorce",
  "descripcion": "Aviso de temperatura máxima de nivel amarillo de 13:00 22-07-2026 CEST (UTC+2) a 20:59 22-07-2026 CEST (UTC+2).",
  "fenomeno": "Temperaturas máximas",
  "zona": "Sol y Guadalhorce",
  "inicio": "2026-07-22T13:00:00+02:00",
  "fin": "2026-07-22T20:59:00+02:00",
  "fuente": "AEMET",
  "fuente_url": "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/cap/...",
  "estado_ciclo_vida": "creado",
  "actualizado_en": "2026-07-20T10:15:25+00:00",
  "historial": []
}
```

Puntos de diseño:

- **No es lo mismo que `data/avisos-locales.json`**: ese fichero sigue siendo el panel manual de tráfico/obras/incidencias de portada (ver 5.4). `aviso` es una entidad estructurada con ciclo de vida propio, pensada para fuentes oficiales automatizadas (AEMET, y en el futuro 112/INFOCA si llegan a tener un canal de datos público).
- **Ciclo de vida, no republicación**: `scripts/actualizar_avisos_aemet.py` identifica cada aviso por un id estable (extraído del `guid` del feed, independiente de la marca de tiempo de regeneración) y actualiza el mismo registro cuando cambia de nivel o vigencia (`estado_ciclo_vida: "actualizado"`, estado anterior movido a `historial`), en vez de crear uno nuevo. Cuando un aviso deja de aparecer en el feed se marca `estado_ciclo_vida: "finalizado"` — no desaparece sin dejar rastro — y se poda pasados 30 días. Ver la sección G.5 del informe de auditoría para el resto de dominios con el mismo problema (incendios, contratación, eventos), aún sin implementar.
- **`historial`** existe para no repetir el problema ya observado en el modelo de noticia (sección E.8 del informe): cuando se fusiona o cierra un registro, hoy no queda ningún rastro de que existió ni de qué lo sustituye.
- **Presentación**: `js/home-live.js` (`mergeAvisosOficiales()`) lee `data/avisos-oficiales.json` en la home, filtra los avisos activos (no finalizados y dentro de la ventana `inicio`/`fin`, reutilizando `isActiveNotice()`) y los muestra en el panel diario con prioridad sobre un aviso manual de `data/avisos-locales.json` en el mismo hueco.

### 14.1 Entidad `edicto` — BOP Málaga

BOP Málaga (BOPMA) no tiene RSS ni API pública (investigado en la auditoría de fuentes 2026-07-20; ver `docs/AUDITORIA-2026-07.md`). El dato llega empujado por su servicio de "Lista de Correo Personalizada": una búsqueda guardada en bopmalaga.es (configurada para Alhaurín el Grande) envía por correo los edictos nuevos. `scripts/actualizar_bop_malaga.py` lee ese correo por **IMAP contra la cuenta personal de Gmail del usuario** (`BOP_EMAIL_USER`/`BOP_EMAIL_APP_PASSWORD`, secrets de GitHub Actions), restringido a la etiqueta `BOP-Malaga` que un filtro de Gmail aplica a los correos de `listacorreo@bopmalaga.es` — el script solo lee esa etiqueta, nunca el resto de la bandeja. Decisión consciente del usuario (2026-07-31): usar el correo personal en vez de una casilla dedicada; la contraseña de aplicación da acceso IMAP a toda la cuenta (Gmail no permite restringir el alcance a una etiqueta), riesgo asumido a cambio de no crear una cuenta nueva.

```json
{
  "id": "bop-20260729-02625-2026",
  "numero_edicto": "2625/2026",
  "organismo": "Ayuntamiento",
  "criterio_busqueda": "Búsqueda 1",
  "expediente": "20696/2026",
  "resumen": "ADMINISTRACIÓN LOCAL ALHAURÍN EL GRANDE Anuncio MRA/GESTIÓN TRIBUTARIA ...",
  "enlace": "https://www.bopmalaga.es/edicto.php?edicto=20260729-02625-2026&control=4273624367",
  "fuente": "BOP Málaga",
  "fecha_alerta": "2026-07-29",
  "detectado_en": "2026-07-29T08:00:00+00:00"
}
```

Puntos de diseño:

- **No es la entidad `aviso`**: un edicto no caduca ni tiene niveles de vigencia como una alerta meteorológica — es un registro administrativo permanente (padrón, expediente de crédito, notificación...). Por eso `data/boletin-oficial.json` es una lista simple, deduplicada por `id`, sin ciclo de vida (`estado_ciclo_vida`/`historial`) ni ventana `inicio`/`fin`.
- **Sin filtro geográfico propio**: a diferencia de las fuentes RSS de `data/fuentes.json`, el filtrado por municipio ya lo hace la búsqueda guardada en bopmalaga.es, no `evaluar_relevancia_geografica()`. Si en el futuro se añaden más criterios de búsqueda que no estén acotados a Alhaurín el Grande, este punto habría que revisarlo.
- **`id` estable**: se extrae del parámetro `edicto=YYYYMMDD-NNNNN-YYYY` del enlace a bopmalaga.es (no del número de edicto NNNN/YYYY visible, que por sí solo no es único entre organismos).
- **Lectura no destructiva del correo**: el script solo procesa mensajes `UNSEEN` de la etiqueta `BOP-Malaga` y los marca `\Seen` tras un parseo correcto; si el HTML no produce ningún edicto (posible cambio de formato de BOPMA) el mensaje se deja sin marcar para poder diagnosticarlo en la siguiente ejecución, en vez de perder el aviso silenciosamente.
- **Patrón defensivo**: si faltan credenciales, falla IMAP o no hay mensajes nuevos, conserva el último `data/boletin-oficial.json` válido y sale con código 0 — mismo criterio que `actualizar_avisos_aemet.py`.
- **Presentación**: página propia `boletin-oficial/` (listado simple, sin panel de portada) — no comparte hueco con `avisos-oficiales.json` en `home-live.js`.


## 15. Reposicionamiento como guía práctica (noviembre 2026)

Motivo: AdSense rechazó el sitio por «contenido de poco valor» (el contenido central eran noticias agregadas de RSS, a veces reescritas con IA). Se mantienen todas las URLs existentes (comprobado contra `reports/urls-baseline.txt`).

### 15.1 Secciones y URLs

| Sección | URL | Generador |
|---|---|---|
| Portada | `/` | `scripts/render-home.js` |
| Farmacia de guardia | `/farmacia-de-guardia/` | `scripts/render-utilidades.js` |
| Avisos | `/avisos/` | `scripts/render-utilidades.js` |
| Tiempo | `/tiempo/` | `scripts/render-tiempo-static.js` |
| Agenda | `/agenda/`, `/este-fin-de-semana/`, `/planes/<slug>/` | `scripts/normalizar-agenda.js` + `scripts/render-agenda.js` |
| Guía útil (guías) | `/guia-util/`, `/guia-util/<slug>/` (desde la fase 6; `/guias/` redirige con 301) | `scripts/render-guias.js` |
| Farmacias (fichas y calendario) | `/guia-util/farmacias/<id>/`, `/guia-util/farmacias/calendario/` | `scripts/render-farmacias.js` |
| Comercios | `/comercios/`, `/comercios/<categoria>/`, `/comercios/<categoria>/<slug>/` | `scripts/render-comercios.js` |
| Anúnciate | `/anunciarse/` | `scripts/render-comercios.js` |
| Actualidad | `/noticias/` | `scripts/render-news-static.js` |
| Sobre el proyecto, contacto, legales | `/sobre-nosotros/`, `/contacto/`, `/privacidad/`, `/cookies/`, `/aviso-legal/` | `scripts/render-paginas-info.js` |

Todas las páginas nuevas usan la plantilla común `scripts/lib/layout.js` (head SEO, JSON-LD, consentimiento, nav, pie, huecos de anuncio) y los estilos `css/guia.css` (paleta `--alh-verde #24402B`, `--alh-oliva #5C7A4A`, `--alh-oro #D9A441`, `--alh-crema #F6F3EA`, añadidas sin tocar las variables existentes).

### 15.2 Ficheros de `data/` nuevos o normalizados

- `data/guias.json`: guías (`slug`, `titulo`, `categoria`, `resumen`, `estado` borrador|publicada, `actualizado`, `secciones`, `datos_clave`, `faq`, `fuentes`, `relacionadas`). Solo las publicadas se indexan, salen en portada y en `sitemap-guias.xml`.
- `data/agenda.json`: agenda normalizada y acumulativa (`slug`, `titulo`, `fecha_inicio`, `fecha_fin`, `hora`, `lugar`, `direccion`, `descripcion`, `categoria`, `precio`/`gratuito`, `organizador`, `url_fuente`, `imagen`…). **No editar a mano**: se genera desde `agenda-local.json`.
- `data/agenda-overrides.json`: datos añadidos a mano por id de evento. Una ficha de evento es indexable solo si tiene `descripcion` propia (≥ 80 caracteres) y `lugar` o `direccion`; pasa a noindex 30 días después de su fecha de fin.
- `data/agenda_borradores.json`: borradores de eventos detectados en los feeds (`--modo agenda`). Nunca se publican solos.
- `data/comercios.json`: directorio (`slug`, `nombre`, `categoria`, `descripcion`, `direccion`, `zona`, `telefono`, `web`, `redes`, `horario`, `destacado`, `patrocinado_hasta`) y categorías con `intro` propia. Ficha propia solo con descripción y dirección u horario. Destacado = `destacado: true` y `patrocinado_hasta` ≥ hoy (las fichas activas del panel en `comercios-destacados.json` cuentan como vigentes).
- `data/noticias.json` / `noticias-archivo.json`: campo `origen` (`rss` | `original`). `scripts/apply-news-origin.js` lo garantiza y ajusta robots y atribución en todo el HTML de noticias.
- `data/nav.json`: navegación Hoy · Agenda · Guías · Comercios · Actualidad.

### 15.3 Consentimiento y publicidad

- El `<head>` de todas las páginas lleva el bloque `<!-- alh-consent:start -->…<!-- alh-consent:end -->` (meta `google-adsense-account`, Consent Mode por defecto denegado, hueco para el script del CMP y `js/consent.js`). `scripts/sync-site-chrome.js` lo propaga en cada build.
- Ya no se carga `adsbygoogle.js` directamente. `js/consent.js` lo carga solo cuando un CMP TCF v2.2 ha registrado la decisión del usuario, y rellena los huecos `[data-ad-ubicacion]` según `CONFIG.adSlots`.
- Para activar anuncios: (1) pegar el script del CMP certificado en el hueco «CMP:» de `CONSENT_HEAD_HTML` (`scripts/lib/layout.js`) y ejecutar el build; (2) rellenar los IDs de bloque en `js/consent.js`.
- Los huecos de anuncio (`adSlot()` en `layout.js`) tienen altura fija desde el primer render (`--alh-ad-contenido`, `--alh-ad-banda`) para evitar CLS.
- El enlace «Configurar cookies» del pie (`[data-consent-open]`) reabre el CMP.
- Cloudflare Web Analytics no usa cookies y se carga sin consentimiento; cualquier analítica futura con cookies debe usar `AlhConsent.whenAllowed()`.

### 15.4 Auditoría (`scripts/audit-seo.js`)

Críticos: páginas en sitemap con noindex o inexistentes, URLs de `reports/urls-baseline.txt` que ya no existen, `[PENDIENTE` en páginas indexables, JSON-LD con errores de sintaxis y `Event` sin `name`/`startDate`/`location`. Aviso: páginas indexables con menos de 150 palabras de texto propio.

### 15.5 Marcadores `[PENDIENTE: …]`

Cuando falta un dato que no debe inventarse se usa `[PENDIENTE: …]`. Las páginas legales y de categorías de comercio que los contienen se generan con noindex hasta completarlos.


## 16. Fase 6: calidad de contenido (noviembre 2026)

### 16.1 Noticias

- `scripts/apply-news-origin.js` recorre **todas** las páginas de `/noticias/` en cada build. Todo lo que no tenga `origen: "original"` queda en `noindex, follow` con la fuente visible (recuperada de `noticias.json`, `noticias-archivo.json`, `noticias-editorial.json` o, como último recurso, del dominio de la imagen); sin fuente, «Información recopilada de fuentes públicas».
- Las páginas de redirección (meta refresh) llevan noindex y se reapuntan a la noticia final que exista siguiendo `fusionadaEn`; esas redirecciones se declaran también como 301 en `_redirects` (bloque `alh-noticias-fusionadas`). Si el destino no existe, la página se convierte en una página mínima en noindex (nunca 404).
- Noticias ajenas a Alhaurín: `data/geografia.json → entidades_ajenas` + `scripts/lib/noticias-ajenas.js`. Se desenlazan de Actualidad, portada, archivo, feed RSS, resumen de WhatsApp y bloques de relacionadas. Se puede forzar con `"ajena": true | false` en la noticia. Las de municipios de la comarca sin mención a Alhaurín se listan como dudosas, sin tocarlas.
- `generar-noticias.yml` se ejecuta una vez al día (06:17 UTC, 07:17/08:17 en Madrid) y ya no recibe `OPENAI_API_KEY`. Ese build diario también regenera la farmacia de guardia y la portada.

### 16.2 Guías: un solo sistema en `/guia-util/`

- `data/guias.json` es la única fuente. `data/guia-util.json` se conserva porque lo leen otras piezas (validaciones, `js/app.js`), pero ya no genera páginas.
- Indexable = `estado: "publicada"` **y** criterios: más de 300 palabras propias, ningún `[PENDIENTE]`, al menos una fuente y fecha de actualización (`criteriosPublicacion()` en `render-guias.js`). Si no se cumplen, la página se genera en noindex con el aviso «Guía en revisión».
- `"generador"` añade secciones con datos de `data/` (`scripts/lib/guias-datos.js`): `farmacias` (farmacias.json + guardias-farmacias-2026.json) y `transporte` (transporte-ctmam.json).
- Retirados del build: `render-guide-pages.js`, `render-guide-static.js`, `render-movilidad-static.js` y `render-farmacia-guardia-static.js`.

### 16.3 Agenda

- **Fuentes**: `data/fuentes-agenda.json` (`id`, `nombre`, `tipo` = `wp-tribe | ical | rss | manual | pistas`, `url`, `alternativa`, `activa`, `publicar`). `scripts/actualizar_agenda_fuentes.py` las lee (paginación, User-Agent, registro del código HTTP y los totales, iCal como alternativa). `actualizar_agenda_ayto.py` delega en él. Añadir una fuente nueva no requiere tocar código.
- **alhaurinhoy.es** es una fuente de pistas: sus eventos futuros van a `data/agenda_borradores.json` y no se publican. Para publicar uno, se edita desde el panel de administración (queda `gestionado`) escribiendo lugar y descripción propia (≥ 80 caracteres); también vale `"validado": true` + `descripcion` + `lugar` en `data/agenda-overrides.json`. Las fichas ya existentes de alhaurinhoy se conservan en noindex y fuera de los listados. El texto de la fuente (`extracto_fuente`) nunca se publica.
- **Lugares**: `data/lugares.json`. Solo lugares con dirección que ya consta en `data/`; el resto `[PENDIENTE]`. `normalizar-agenda.js` asigna lugar y dirección por alias y lo anota en `reports/agenda-lugares-asignados.json`.
- Si hay menos de 5 planes en 14 días, `/agenda/` y `/este-fin-de-semana/` muestran un bloque con enlaces útiles.

### 16.4 Comercios

- `data/comercios.json` manda. Carga desde hoja de cálculo: `data/comercios-plantilla.csv` + `npm run comercios:importar -- fichero.csv` (valida) y `--escribir` (guarda; `--reemplazar` sustituye la lista).
- `/comercios/<categoria>/` indexable solo con texto introductorio propio y al menos 5 comercios con ficha completa; `/comercios/` solo si alguna categoría lo es.

### 16.5 Auditoría

`audit-seo.js` añade errores para: noticias indexables sin `origen: "original"`, páginas indexables de `/guia-util/` con menos de 300 palabras o `[PENDIENTE`, fichas de evento de alhaurinhoy indexables sin validar y URLs de `reports/urls-indexables-antes-fase6.txt` que darían 404 (se admiten noindex y 301 en `_redirects`). Muestra las páginas indexables por sección antes y después.
