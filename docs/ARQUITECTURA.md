# Arquitectura de Alhaurín al Día

Documento actualizado para la rama `develop`.

## 1. Visión general

Alhaurín al Día es una web estática hiperlocal publicada como sitio HTML/CSS/JavaScript. No depende de un backend propio en tiempo de ejecución: las páginas se sirven como ficheros estáticos y el contenido dinámico se obtiene leyendo archivos JSON ubicados en `data/`.

La arquitectura está pensada para tres objetivos principales:

1. Publicar noticias locales y páginas SEO individuales.
2. Mantener una guía útil de servicios locales con páginas indexables.
3. Ofrecer una portada diaria consultable con tiempo, avisos, farmacia de guardia, agenda y comercios destacados.

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
│   ├── guia-util.json
│   ├── estado-local.json
│   ├── avisos-locales.json
│   ├── agenda-local.json
│   ├── comercios-destacados.json
│   ├── farmacias.json
│   └── guardias-farmacias-2026.json
├── noticias/
│   ├── index.html
│   └── *.html
├── categoria/
│   └── */index.html
├── guia-util/
│   └── */index.html
├── scripts/
│   ├── generar_noticias.py
│   ├── dedupe-news.js
│   ├── clean-orphan-news.js
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

Es la plantilla principal de la portada. Incluye:

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
- Inserta widget de Andalmet en portada.
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

Contiene las noticias publicadas. Lo genera `scripts/generar_noticias.py`.

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
  "seo_keywords": ["alhaurín", "noticias"]
}
```

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
  "guardias": {
    "2026-05-13": "farmacia-ejemplo"
  }
}
```

## 6. Generación de noticias

El script principal es `scripts/generar_noticias.py`.

Flujo:

1. Lee feeds RSS/Atom configurados en `FUENTES`.
2. Filtra noticias relevantes para Alhaurín el Grande.
3. Limpia HTML y normaliza texto.
4. Calcula prioridad por fuente y fecha.
5. Detecta categoría automáticamente.
6. Si existe `OPENAI_API_KEY`, mejora titular, entradilla, cuerpo y keywords con IA.
7. Genera `data/noticias.json`.
8. Genera páginas HTML individuales en `noticias/`.
9. Genera páginas de categoría en `categoria/`.

Fuentes actuales:

- RTV Alhaurín el Grande.
- ATV Alhaurín YouTube.
- Europa Press Andalucía.
- Diario SUR Málaga.
- Ayuntamiento Alhaurín el Grande.
- Hermandad Nuestro Padre Jesús Nazareno.

Variables de entorno relevantes:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

Si no hay API key, el script usa fallback editorial local.

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

### 7.4 Home estática limpia

`scripts/render-home-static.js` limpia los contenedores dinámicos de la home para evitar que se queden restos HTML embebidos antes de que `app.js` renderice el contenido.

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

- `sitemap.xml`: sitemap principal.
- `sitemap-farmacias.xml`: URLs de farmacias.
- `sitemap-servicios.xml`: URLs de servicios.
- `sitemap-noticias.xml`: noticias y categorías.
- `sitemap-news.xml`: noticias recientes compatibles con Google News.
- `sitemap-index.xml`: índice de sitemaps.

## 9. Scripts npm

Definidos en `package.json`:

```bash
npm run news                # Genera noticias desde feeds
npm run news:dedupe         # Deduplica noticias escribiendo cambios
npm run news:dedupe:dry     # Deduplica en modo simulación
npm run news:orphans:dry    # Detecta páginas huérfanas de noticias
npm run news:orphans:clean  # Borra páginas huérfanas
npm run seo                 # Aplica ajustes SEO de home y limpia SearchAction
npm run home:static         # Limpia contenedores dinámicos de home
npm run guide:pages         # Genera páginas internas de guía útil
npm run sitemap             # Regenera sitemaps
npm run seo:audit           # Auditoría SEO no bloqueante
npm run seo:audit:strict    # Auditoría SEO estricta
npm run seo:orphans         # Auditoría de huérfanas no bloqueante
npm run seo:orphans:strict  # Auditoría de huérfanas estricta
npm run publish:check       # Comprobación previa a publicar
npm run daily               # Build + comprobación de publicación
npm run build               # Pipeline completo
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
