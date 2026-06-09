# Plan operativo de contenido

Este documento resume el flujo recomendado para mantener Alhaurín al Día actualizado sin perder control editorial ni calidad SEO.

## Estado actual

- Las noticias se generan desde `scripts/generar_noticias.py`.
- El resultado principal se publica en `data/noticias.json`.
- El generador crea páginas individuales en `noticias/`.
- El generador crea páginas de categoría en `categoria/`.
- La portada carga las noticias desde `app.js`.
- El panel diario de portada carga información desde `data/estado-local.json`, `data/avisos-locales.json` y `data/tiempo-aemet.json` mediante `home-live.js`.
- El tiempo ya está integrado en el panel diario y también enlaza con Andalmet/AEMET.

## Validación antes de publicar

El script `scripts/validar_contenido.py` revisa:

- Que `data/noticias.json` exista y sea JSON válido.
- Que cada noticia tenga campos obligatorios.
- Que los titulares no estén cortados ni terminen a medias.
- Que las descripciones sean frases completas.
- Que no haya puntos suspensivos en titulares o entradillas.
- Que las categorías estén dentro del listado permitido.
- Que fechas y URLs sean válidas.
- Que las páginas generadas existan.
- Que las páginas publicadas estén incluidas en `sitemap.xml`.
- Que no haya duplicados por `id`, `url`, `enlace`, `pagina` o título.
- Que se avise de posibles duplicados editoriales por similitud de titulares.

Ejecución local:

```bash
python scripts/validar_contenido.py
```

## Workflow recomendado

1. Trabajar siempre en `develop`.
2. Ejecutar o revisar la actualización automática de noticias.
3. Ejecutar la validación de contenido.
4. Revisar avisos editoriales si los hubiera.
5. Corregir el generador si el problema se repite.
6. Pasar a `main` solo cuando `develop` esté validado.

## Frecuencia recomendada

### Diario

- Revisar noticias generadas.
- Comprobar que no haya titulares cortados.
- Confirmar que el tiempo y avisos locales siguen cargando correctamente.

### Semanal

- Revisar categorías con poca cobertura.
- Revisar duplicados por tema.
- Revisar Search Console: indexación, sitemap y páginas con impresiones.
- Actualizar agenda local y avisos programados.

### Mensual

- Revisar fuentes RSS activas.
- Analizar qué fuentes aportan tráfico y cuáles generan ruido.
- Revisar espacios publicitarios y llamadas a anunciantes.
- Revisar páginas evergreen de guía útil.

## Próximos pasos técnicos

### 1. Endurecer el generador de noticias

Prioridad alta.

- Aplicar un saneado final después de IA/fallback.
- Rechazar titulares con comillas abiertas, puntos suspensivos o final sospechoso.
- Evitar guardar noticias cuyo título no pueda corregirse automáticamente.
- Mejorar la generación de slugs para evitar cortes poco elegantes.

### 2. Mejorar deduplicación editorial

Prioridad alta.

- Detectar noticias iguales aunque vengan de fuentes distintas.
- Priorizar fuente oficial cuando el mismo tema ya esté cubierto.
- Mantener varias fuentes solo si aportan información complementaria.

### 3. Separar contenido informativo y agenda

Prioridad media.

- Las noticias de agenda deberían alimentar también `data/avisos-locales.json` o un futuro `data/agenda.json`.
- Los eventos con fecha futura deberían tener tratamiento distinto a las noticias pasadas.

### 4. Automatizar tiempo

Prioridad media.

- Mantener `data/tiempo-aemet.json` actualizado mediante script independiente.
- Evitar introducir datos meteorológicos manuales en la portada.
- Guardar fuente, fecha de actualización y URL oficial.

### 5. SEO local

Prioridad media.

- Revisar sitemap después de cada generación.
- Crear páginas evergreen para búsquedas recurrentes: farmacias, teléfonos, trámites, autobuses, restaurantes, aparcamiento, feria y turismo.
- Añadir más datos estructurados específicos donde proceda.

## Criterio editorial

Alhaurín al Día debe priorizar:

1. Información local útil.
2. Fuentes oficiales o verificables.
3. Titulares claros y completos.
4. Enlaces siempre a la fuente original.
5. Evitar duplicar contenido si no aporta valor adicional.

## Checklist rápido antes de pasar a `main`

```bash
python scripts/validar_contenido.py
```

Además, revisar visualmente:

- Portada.
- Página `/noticias/`.
- Una página de categoría.
- Una noticia individual reciente.
- Panel de tiempo/estado local.
- `sitemap.xml`.
