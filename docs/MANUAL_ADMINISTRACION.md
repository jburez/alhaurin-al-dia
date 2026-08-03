# Manual de administración de Alhaurín al Día

Documento operativo para mantener la web correctamente desde la rama `develop`.

## 1. Reglas básicas

1. Trabaja siempre en `develop`.
2. Antes de tocar nada, actualiza el repositorio.
3. No publiques cambios sin ejecutar el build.
4. No edites manualmente páginas generadas si existe un JSON o script que las genera.
5. Verifica datos sensibles con fuente oficial: farmacia de guardia, cortes, tráfico, alertas, horarios y teléfonos.
6. Después de añadir, borrar o regenerar páginas, actualiza sitemaps.

Comandos iniciales recomendados:

```bash
git checkout develop
git pull origin develop
```

## 2. Arranque local

La web puede probarse en local sin desplegar continuamente.

Desde la raíz del proyecto:

```bash
python3 -m http.server 8000
```

Luego abre:

```text
http://localhost:8000/
```

No abras directamente `index.html` con doble clic, porque las llamadas `fetch()` a JSON pueden fallar por restricciones del navegador.

## 3. Instalación y requisitos

La web usa scripts de Node.js y Python.

Requisitos:

- Node.js.
- Python 3.
- Dependencias Python usadas por `scripts/generar_noticias.py`: `feedparser`, `requests`, `urllib3`, `python-dotenv` y opcionalmente `openai`.
- Archivo `.env` local si quieres usar IA.

Ejemplo de `.env`:

```bash
OPENAI_API_KEY=tu_api_key
OPENAI_MODEL=gpt-4.1-mini
```

No subas `.env` al repositorio.

## 4. Flujo diario recomendado

### 4.1 Actualizar repo

```bash
git checkout develop
git pull origin develop
```

### 4.2 Revisar datos diarios

Revisa o actualiza estos archivos:

- `data/estado-local.json`
- `data/avisos-locales.json`
- `data/agenda-local.json`
- `data/guardias-farmacias-2026.json`
- `data/comercios-destacados.json`

### 4.3 Generar noticias y páginas

```bash
npm run build
```

Este comando ejecuta el pipeline completo:

1. Genera noticias desde feeds.
2. Deduplica noticias.
3. Aplica ajustes SEO.
4. Limpia la home dinámica.
5. Genera páginas de guía útil.
6. Genera sitemaps.
7. Ejecuta auditorías SEO y de páginas huérfanas en modo no bloqueante.

### 4.4 Validación previa a publicar

```bash
npm run publish:check
```

### 4.5 Probar en local

```bash
python3 -m http.server 8000
```

Comprueba manualmente:

- Home.
- Noticias.
- Una noticia individual.
- Guía útil.
- Farmacias.
- Tiempo.
- Avisos.
- Menú móvil.
- Sitemaps.

### 4.6 Subir cambios a develop

```bash
git status
git add .
git commit -m "actualizar contenido diario"
git push origin develop
```

## 5. Publicar cambios en main

Cuando `develop` esté validada:

```bash
git checkout main
git pull origin main
git merge develop
npm run publish:check
git push origin main
```

Después vuelve a `develop`:

```bash
git checkout develop
```

Si hay conflicto en `data/noticias.json`, revisa con calma. Es uno de los archivos más propensos a conflictos porque lo modifican los scripts.

## 6. Administración de noticias

### 6.1 Generar noticias

```bash
npm run news
```

O dentro del pipeline completo:

```bash
npm run build
```

El script lee feeds configurados en `scripts/generar_noticias.py` y genera:

- `data/noticias.json`
- páginas bajo `noticias/`
- páginas de categoría bajo `categoria/`

### 6.2 Fuentes actuales

Las fuentes se configuran en `FUENTES`, dentro de `scripts/generar_noticias.py`.

Fuentes incluidas actualmente:

- RTV Alhaurín el Grande.
- ATV Alhaurín YouTube.
- Europa Press Andalucía.
- Diario SUR Málaga.
- Ayuntamiento Alhaurín el Grande.
- Hermandad Nuestro Padre Jesús Nazareno.

### 6.3 Añadir una nueva fuente RSS

Edita `scripts/generar_noticias.py` y añade una entrada a `FUENTES`:

```python
{"nombre": "Nombre de la fuente", "url": "https://ejemplo.com/feed/"}
```

Después ejecuta:

```bash
npm run news
npm run news:dedupe
npm run sitemap
```

Comprueba que las noticias generadas son relevantes y no están duplicadas.

### 6.4 Categorías

Las categorías válidas están definidas en `CATEGORIAS_VALIDAS` dentro de `scripts/generar_noticias.py`.

Categorías actuales:

- Actualidad
- Fiestas y Tradiciones
- Agenda Cultural
- Deportes
- Municipal
- Obras y Servicios
- Tráfico y Movilidad
- Educación
- Comercio y Empresa
- Turismo y Patrimonio
- Sucesos
- Vídeos

Si añades una categoría nueva:

1. Añádela a `CATEGORIAS_VALIDAS`.
2. Actualiza la función de detección de categoría si procede.
3. Ejecuta `npm run build`.
4. Revisa que se genere `categoria/<slug>/index.html`.

### 6.5 Deduplicar noticias

Simulación:

```bash
npm run news:dedupe:dry
```

Aplicar cambios:

```bash
npm run news:dedupe
```

### 6.6 Archivar noticias huérfanas

Cuando una noticia sale del listado activo (por el límite de `MAX_NOTICIAS_TOTAL` en `dedupe-news.js`), su página HTML ya no se borra: se conserva en `noticias/` y queda listada en `/noticias/archivo/` a partir de `data/noticias-archivo.json`. Esto evita que Google indexe una URL y luego se encuentre un 404 cuando la noticia caduca del listado principal.

`dedupe-news.js` archiva automáticamente las noticias que recorta por límite. `archive-orphan-news.js` es la red de seguridad para huérfanas que aparecieran por otra vía (edición manual, migraciones): detecta HTML sin entrada activa y, si aún no está en el archivo, la da de alta extrayendo sus metadatos del propio HTML.

Simulación:

```bash
npm run news:orphans:dry
```

Escritura real (da de alta en el archivo las huérfanas que falten):

```bash
npm run news:orphans:archive
```

Después de archivar, regenera la página de listado:

```bash
npm run news:archive:page
```

## 7. Administración de portada diaria

La portada se alimenta de varios JSON. La mayoría de cambios diarios se hacen en `data/`.

### 7.1 Panel “Hoy en Alhaurín”

Archivo:

```text
data/estado-local.json
```

Campos importantes:

- `actualizado`: fecha ISO con zona horaria.
- `resumen`: texto interno/descriptivo.
- `items`: tarjetas del panel.

Ejemplo de actualización rápida:

```json
{
  "id": "trafico",
  "icono": "🚗",
  "titulo": "Tráfico",
  "valor": "Normal",
  "detalle": "Sin incidencias destacadas comunicadas en accesos principales.",
  "estado": "ok",
  "cta": "Consultar DGT",
  "url": "https://www.dgt.es/conoce-el-estado-del-trafico/"
}
```

Estados permitidos:

- `ok`: todo normal.
- `warning`: aviso moderado.
- `alert`: atención alta.
- `neutral`: información general.

### 7.2 Avisos locales

Archivo:

```text
data/avisos-locales.json
```

Sirve para cortes de agua, luz, tráfico, procesiones, obras o incidencias.

Ejemplo:

```json
{
  "actualizado": "2026-05-13T12:25:00+02:00",
  "resumen": "Avisos locales activos de Alhaurín el Grande.",
  "avisos": [
    {
      "activo": true,
      "tipo": "tráfico",
      "titulo": "Corte puntual en calle ejemplo",
      "valor": "Corte activo",
      "detalle": "Corte previsto por trabajos municipales.",
      "estado": "warning",
      "inicio": "2026-05-13T09:00:00+02:00",
      "fin": "2026-05-13T14:00:00+02:00",
      "fuente": "Ayuntamiento de Alhaurín el Grande",
      "cta": "Ver aviso",
      "url": "./avisos/"
    }
  ]
}
```

Buenas prácticas:

- Usa `activo: false` para ocultar sin borrar.
- Usa `inicio` y `fin` para programar visibilidad.
- Incluye `fuente` siempre que sea posible.
- No publiques avisos críticos sin fuente verificable.

### 7.3 Agenda próxima

Archivo:

```text
data/agenda-local.json
```

Ejemplo:

```json
{
  "activo": true,
  "tipo": "Cultura",
  "titulo": "Concierto local",
  "descripcion": "Actividad cultural confirmada.",
  "lugar": "Casa de la Cultura",
  "inicio": "2026-05-15T20:00:00+02:00",
  "fin": "2026-05-15T22:00:00+02:00",
  "estado": "neutral",
  "cta": "Ver detalle",
  "url": "./planes/"
}
```

La portada muestra hasta 4 eventos futuros activos.

### 7.4 Comercio destacado

Archivo:

```text
data/comercios-destacados.json
```

Ejemplo:

```json
{
  "activo": true,
  "nombre": "Negocio local",
  "descripcion": "Descripción breve del comercio.",
  "categoria": "Restaurante",
  "zona": "Centro",
  "telefonoHref": "+34951000000",
  "url": "./comercios/",
  "imagen": "./assets/comercios/negocio.jpg",
  "etiqueta": "Comercio destacado",
  "cta": "Ver ficha"
}
```

La portada muestra hasta 2 comercios activos.

## 8. Administración de farmacias

### 8.1 Fichas de farmacia

Archivo:

```text
data/farmacias.json
```

Cada farmacia debe tener un `id` estable. Ese `id` se usa en el calendario de guardias.

Campos habituales:

- `id`
- `nombre`
- `direccion`
- `telefono`
- `telefonoHref`
- `url` o `pagina`

### 8.2 Calendario de guardias

Archivo:

```text
data/guardias-farmacias-2026.json
```

Formato:

```json
{
  "guardias": {
    "2026-05-13": "id-de-farmacia"
  }
}
```

Reglas:

- Usa fechas en formato `YYYY-MM-DD`.
- El valor debe coincidir exactamente con un `id` de `farmacias.json`.
- Confirma siempre con la fuente oficial antes de completar guardias.
- Si una fecha no existe, la home mostrará “Guardia pendiente de completar”.

## 9. Administración de guía útil

### 9.1 Editar recursos

Archivo:

```text
data/guia-util.json
```

Cada recurso genera tarjeta y, salvo excepciones, página interna.

Ejemplo:

```json
{
  "id": "telefonos",
  "titulo": "Teléfonos útiles",
  "descripcion": "Emergencias, atención municipal y contactos básicos.",
  "categoria": "Guía útil",
  "icono": "☎️",
  "pagina": "guia-util/telefonos/",
  "items": [
    "Emergencias: 112"
  ],
  "links": [
    { "texto": "Ayuntamiento", "url": "https://alhaurinelgrande.es/" }
  ]
}
```

### 9.2 Generar páginas de guía

```bash
npm run guide:pages
```

O con todo el build:

```bash
npm run build
```

### 9.3 Páginas protegidas

Algunas páginas tienen diseño propio y no se sobrescriben desde `data/guia-util.json`:

- `farmacias`
- `vivir-en-alhaurin`
- `aparcamiento`
- `restaurantes`
- `veterinarios`

Si necesitas tocar estas páginas, edita su HTML directamente con cuidado.

## 10. Administración de SEO

### 10.1 Generar sitemaps

```bash
npm run sitemap
```

Archivos generados:

- `sitemap.xml`
- `sitemap-index.xml`
- `sitemap-news.xml`
- `sitemap-noticias.xml`
- `sitemap-farmacias.xml`
- `sitemap-servicios.xml`

### 10.2 Auditoría SEO

Modo aviso:

```bash
npm run seo:audit
```

Modo estricto:

```bash
npm run seo:audit:strict
```

### 10.3 Auditoría de páginas huérfanas

Modo aviso:

```bash
npm run seo:orphans
```

Modo estricto:

```bash
npm run seo:orphans:strict
```

### 10.4 Después de publicar

En Google Search Console:

1. Reenvía `sitemap-index.xml` si ha cambiado mucho el sitio.
2. Solicita indexación de páginas prioritarias.
3. Revisa cobertura, páginas descubiertas y errores.

## 11. Validación de JSON

Antes de hacer commit, valida los JSON editados.

Ejemplo con Python:

```bash
python3 -m json.tool data/estado-local.json > /dev/null
python3 -m json.tool data/avisos-locales.json > /dev/null
python3 -m json.tool data/agenda-local.json > /dev/null
python3 -m json.tool data/comercios-destacados.json > /dev/null
python3 -m json.tool data/guia-util.json > /dev/null
```

Si el comando no muestra nada, el JSON es válido. Si hay error, corrige comas, comillas o llaves.

## 12. Checklist antes de publicar

- [ ] Estoy en `develop`.
- [ ] He hecho `git pull origin develop`.
- [ ] Los JSON editados son válidos.
- [ ] He ejecutado `npm run build`.
- [ ] He ejecutado `npm run publish:check`.
- [ ] He probado la web en local con servidor HTTP.
- [ ] La home carga noticias.
- [ ] La home carga panel diario.
- [ ] La farmacia de guardia es correcta o aparece pendiente de completar.
- [ ] No hay enlaces rotos evidentes en navegación principal.
- [ ] Los sitemaps se han actualizado.
- [ ] `git status` solo muestra cambios esperados.

## 13. Solución de problemas frecuentes

### 13.1 “No se han podido cargar las noticias”

Causas probables:

- `data/noticias.json` no existe.
- `data/noticias.json` tiene JSON inválido.
- Se ha abierto la web con `file://` en vez de servidor local.
- La ruta relativa se ha roto al mover scripts o HTML.

Acciones:

```bash
python3 -m json.tool data/noticias.json > /dev/null
python3 -m http.server 8000
npm run news
```

### 13.2 La farmacia de guardia aparece pendiente

Causas probables:

- No existe la fecha de hoy en `data/guardias-farmacias-2026.json`.
- El `id` de guardia no coincide con ningún `id` de `data/farmacias.json`.
- JSON inválido.

Acciones:

```bash
python3 -m json.tool data/farmacias.json > /dev/null
python3 -m json.tool data/guardias-farmacias-2026.json > /dev/null
```

Revisa que la fecha tenga formato `YYYY-MM-DD`.

### 13.3 El build falla en noticias

Causas probables:

- Feed externo caído.
- Dependencia Python no instalada.
- Problema de cuota o API key de OpenAI.
- Cambio de formato en una fuente.

Acciones:

```bash
python3 scripts/generar_noticias.py
```

Lee el error concreto. Si el problema es OpenAI, revisa `.env` o ejecuta sin `OPENAI_API_KEY` para usar fallback editorial.

### 13.4 Hay conflicto al fusionar develop en main

Archivo típico: `data/noticias.json`.

Acciones:

```bash
git status
```

Abre el archivo con conflicto, conserva la versión correcta, valida JSON y termina el merge:

```bash
python3 -m json.tool data/noticias.json > /dev/null
git add data/noticias.json
git commit
```

### 13.5 La home muestra contenido duplicado

Ejecuta:

```bash
npm run home:static
```

Este script limpia contenedores dinámicos de la home.

### 13.6 Sitemaps desactualizados

Ejecuta:

```bash
npm run sitemap
```

Y revisa `sitemap-index.xml`.

## 14. Buenas prácticas editoriales

- No copiar artículos completos de terceros.
- Resumir, atribuir y enlazar la fuente original.
- Evitar titulares sensacionalistas.
- Priorizar utilidad local: horarios, ubicación, fecha, fuente, impacto para vecinos.
- En sucesos, extremar prudencia y no añadir datos no confirmados.
- En avisos o guardias, usar lenguaje orientativo y recordar confirmar en fuente oficial.
- Mantener categorías coherentes.

## 15. Buenas prácticas comerciales

- Separar siempre publicidad de contenido editorial.
- Usar etiquetas como “Espacio patrocinado”, “Comercio destacado” o “Ficha patrocinada”.
- No mezclar farmacia de guardia con publicidad de salud de forma que pueda confundir.
- Mantener fichas comerciales claras: nombre, zona, categoría, descripción, CTA y contacto.

## 16. Comandos rápidos

```bash
# Actualizar trabajo
git checkout develop && git pull origin develop

# Servidor local
python3 -m http.server 8000

# Build completo
npm run build

# Validación publicación
npm run publish:check

# Solo noticias
npm run news

# Deduplicar noticias
npm run news:dedupe

# Regenerar guía
npm run guide:pages

# Regenerar sitemaps
npm run sitemap

# Auditoría SEO
npm run seo:audit

# Ver cambios
git status
```
