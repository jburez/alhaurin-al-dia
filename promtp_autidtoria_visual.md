# Auditoría técnica y hoja de ruta UX/UI de Alhaurín al Día

Trabaja sobre el repositorio:

`jburez/alhaurin-al-dia`

## Regla obligatoria inicial

Antes de analizar o proponer cualquier cambio:

1. Comprueba el estado de Git.
2. Revisa la rama `develop`.
3. Ejecuta `git status`.
4. Confirma la rama activa.
5. Actualiza las referencias remotas.
6. Inspecciona siempre la versión más reciente de `develop`.

No analices `main` como fuente principal.

No descartes, sobrescribas ni modifiques cambios locales existentes.

Si el árbol de trabajo no está limpio, informa de ello y realiza el análisis sobre `origin/develop` sin alterar los archivos locales.

---

# 1. Objetivo

Realiza una auditoría completa de experiencia de usuario, diseño visual, arquitectura de información, accesibilidad y comportamiento responsive de la web de Alhaurín al Día.

El resultado debe convertirse en una **hoja de ruta de rediseño preparada para una futura implementación**, pero en esta tarea:

* No debes modificar código.
* No debes editar archivos.
* No debes crear commits.
* No debes abrir pull requests.
* No debes implementar componentes.
* No debes cambiar HTML, CSS, JavaScript ni datos.
* No debes instalar dependencias.
* No debes crear todavía nuevas páginas.
* No debes hacer un rediseño directamente.

Tu trabajo en esta fase es exclusivamente de:

* Inspección.
* Diagnóstico.
* Priorización.
* Definición funcional.
* Preparación de tareas.
* Identificación de dependencias.
* Definición de criterios de aceptación.

La salida debe ser un informe técnico y funcional que pueda utilizarse posteriormente como plan de ejecución.

---

# 2. Contexto del producto

Alhaurín al Día es una web hiperlocal independiente centrada en Alhaurín el Grande.

Combina varias funciones:

* Medio de noticias locales.
* Panel diario de información útil.
* Avisos locales.
* Tiempo.
* Farmacia de guardia.
* Agenda.
* Guía de servicios.
* Planes y rincones.
* Comercios locales.
* Espacios publicitarios.
* Páginas individuales optimizadas para buscadores.

El objetivo estratégico es que la web sea:

* Muy útil para los vecinos.
* Rápida de consultar.
* Visualmente atractiva.
* Moderna, pero no artificiosa.
* Editorial, sin parecer un panel corporativo.
* Fácil de utilizar desde el móvil.
* Creíble como medio independiente.
* Preparada para monetización local.
* Accesible.
* Rápida.
* Escalable sin introducir un framework innecesario.

La personalidad visual deseada es:

> Editorial, mediterránea, local, calmada, útil, cercana y profesional.

Debe evitar parecer:

* Una plantilla genérica.
* Un dashboard SaaS.
* Una web institucional.
* Un tablón de anuncios.
* Una colección de tarjetas desconectadas.
* Un portal saturado de publicidad.

---

# 3. Revisión obligatoria del repositorio

Inspecciona como mínimo:

## Estructura general

* `README.md`
* `docs/ARQUITECTURA.md`
* `docs/MANUAL_ADMINISTRACION.md`
* `docs/PLAN_OPERATIVO_CONTENIDO.md`
* `index.html`
* Páginas de noticias.
* Páginas de categorías.
* Páginas de guía útil.
* Avisos.
* Tiempo.
* Planes.
* Comercios.
* Anunciarse.
* Contacto.
* Footer y páginas legales existentes.

## CSS

Localiza y revisa todas las hojas relevantes, incluyendo, cuando existan:

* `css/styles.css`
* `css/mobile.css`
* `css/ads.css`
* `css/news-meta.css`
* `css/home-hero.css`
* `css/home-live.css`
* `css/home-guardia.css`
* `css/home-agenda.css`
* `css/home-commerce.css`
* `css/home-news.css`
* `css/ux-desktop.css`
* `css/ux-mobile.css`
* `css/article.css`
* CSS de páginas internas.
* CSS de componentes patrocinados.

Analiza especialmente:

* Variables.
* Colores.
* Tipografía.
* Espaciados.
* Radios.
* Sombras.
* Breakpoints.
* Selectores duplicados.
* Reglas contradictorias.
* Sobrescrituras entre archivos.
* Código visual heredado.
* Colores fuera del sistema de diseño.
* Diferencias entre portada y páginas internas.

## JavaScript de interfaz

Revisa, cuando existan:

* `js/app.js`
* `js/home-live.js`
* `js/home-guardia.js`
* `js/home-agenda.js`
* `js/home-commerce.js`
* Scripts relacionados con navegación, carga y renderizado.

Analiza:

* Menú móvil.
* Manipulación del DOM.
* Renderizado de noticias.
* Renderizado de la guía.
* Estados de carga.
* Contenido estático sustituido mediante JavaScript.
* Riesgos de parpadeo.
* Riesgos de cambios de layout.
* Manejo del foco.
* Escape y clic exterior.
* Carga fallida.
* Ausencia de datos.
* Secciones vacías.
* Enlaces y áreas clicables.

## Datos

Revisa la estructura de:

* Noticias.
* Estado local.
* Avisos.
* Agenda.
* Farmacias.
* Comercios destacados.
* Guía útil.
* Tiempo.

Determina qué limitaciones del diseño proceden realmente del modelo de datos y cuáles pueden resolverse únicamente mediante presentación.

---

# 4. Revisión visual real

No te limites a leer el código.

Abre la web publicada:

`https://alhaurinaldia.es`

Inspecciona visualmente:

* Portada.
* Noticias.
* Artículo individual.
* Guía útil.
* Página interna de guía.
* Avisos.
* Tiempo.
* Planes.
* Comercios.
* Anunciarse.
* Contacto.
* Footer.
* Menú móvil.

Utiliza herramientas del navegador y, cuando sea posible, capturas de pantalla.

Analiza al menos las siguientes anchuras:

* 320 px.
* 360 px.
* 375 px.
* 390 px.
* 430 px.
* 768 px.
* 820 px.
* 1024 px.
* 1280 px.
* 1440 px.

Comprueba también:

* Zoom del navegador al 200 %.
* Navegación por teclado.
* Preferencia de movimiento reducido.
* Textos largos.
* Titulares largos.
* Noticias sin imagen.
* Secciones sin datos.
* Comercio sin anunciantes.
* Agenda vacía.
* Avisos activos y sin avisos.
* Diferentes longitudes de nombres de farmacias.
* Carga lenta o fallo de JavaScript.

No asumas que el HTML o el CSS representan exactamente el resultado publicado. Contrasta siempre código y comportamiento real.

---

# 5. Diagnóstico de partida

Considera como hipótesis iniciales los siguientes hallazgos, pero verifícalos en el repositorio y en la web antes de aceptarlos.

## 5.1 Fortalezas actuales

* Paleta cálida vinculada a sierra y olivar.
* Identidad local razonablemente diferenciada.
* Tipografía editorial con Fraunces.
* Texto principal legible.
* Buen ancho máximo en escritorio.
* Diseño responsive.
* Áreas táctiles móviles amplias.
* Cabecera sticky.
* Enlace para saltar al contenido.
* Estados de foco.
* Soporte de movimiento reducido.
* Concepto sólido de “Hoy en Alhaurín”.
* Combinación valiosa de actualidad y guía práctica.
* Páginas individuales de noticias.
* Información de fuentes.
* Estructura semántica aceptable.

## 5.2 Problemas principales que debes verificar

### Jerarquía de portada

La portada explica demasiado qué es la web antes de mostrar información real.

El contenido esencial puede estar precedido por:

* Barra superior.
* Cabecera.
* Franja de accesos.
* Hero explicativo.
* Botones.
* Panel de accesos rápidos.
* Espacio publicitario.

La información realmente importante aparece demasiado tarde, especialmente en móvil.

### Exceso de tarjetas

Demasiados elementos utilizan simultáneamente:

* Fondo independiente.
* Borde.
* Radio grande.
* Sombra.
* Etiqueta.
* Botón.
* Gradiente.

La interfaz puede parecer un dashboard y no un medio editorial.

### Exceso de radios y sombras

Se utilizan radios muy grandes y múltiples sombras en casi todos los niveles.

Esto reduce la jerarquía porque todos los módulos reciben un tratamiento visual importante.

### Exceso de etiquetas en forma de píldora

Conviven:

* Eyebrows.
* Section kickers.
* Mini labels.
* Categorías.
* Fuentes.
* Estados.
* Patrocinios.
* Fechas de actualización.
* Botones redondeados.

Cuando todo está encapsulado, ningún elemento destaca.

### Duplicación funcional

Tiempo, farmacia, avisos, movilidad y agenda pueden aparecer en:

* Franja de hoy.
* Hero.
* Panel lateral.
* Dashboard.
* Guía útil.
* Footer.

Esta repetición aumenta la longitud sin añadir necesariamente valor.

### Guía útil demasiado extensa en portada

La portada parece contener gran parte del catálogo de la guía.

Esto:

* Duplica páginas internas.
* Alarga excesivamente la home.
* Reduce el foco editorial.
* Aumenta el número de tarjetas.
* Dificulta llegar al final.

### Comercio vacío

Cuando no existen comercios activos, el bloque puede mostrar mensajes dirigidos al anunciante como:

* Espacio disponible.
* Negocios con visibilidad.
* Comercio pendiente.
* Cargando comercio.

La portada no debe mostrar inventario comercial vacío como contenido principal.

### Publicidad temprana

Existen varios espacios publicitarios en la primera mitad de la portada.

En móvil, la publicidad no debe preceder al estado diario ni a la noticia principal.

### Imágenes editoriales

Gran parte de las imágenes pueden proceder de miniaturas de YouTube o fuentes externas con calidad, encuadre y estilo inconsistentes.

### Navegación en tablet

El menú completo se mantiene en anchuras donde puede quedar comprimido.

El breakpoint del menú compacto podría activarse demasiado tarde.

### Menú móvil

El menú tiene buenas dimensiones táctiles, pero puede repetir el patrón de “tarjeta dentro de tarjeta”.

También se debe comprobar:

* Escape.
* Clic exterior.
* Foco atrapado.
* Restauración del foco.
* Contenido posterior accesible por teclado.
* Bloqueo de scroll.
* Visibilidad del estado activo.

### Noticias móviles

Las tarjetas compactas pueden contener:

* Imagen.
* Categoría.
* Titular.
* Descripción.
* Fecha.
* Fuente.
* Enlace “Leer”.

Existe riesgo de exceso de información y tamaños secundarios demasiado pequeños.

### Clickabilidad

Comprueba si son clicables:

* Imagen.
* Titular.
* Área completa de la tarjeta.
* CTA.

No debe dependerse únicamente de un pequeño enlace “Leer noticia”.

### Frescura

La marca “al Día” exige que la fecha y hora de actualización sean muy visibles.

Revisa:

* Antigüedad de las noticias principales.
* Presentación de fechas.
* Actualización del panel diario.
* Indicación de datos desactualizados.
* Uso de “Últimas noticias”.
* Diferenciación entre información evergreen y actualidad.

### Estados de carga

El JavaScript podría eliminar contenido estático y volver a renderizarlo, provocando:

* Parpadeos.
* Saltos.
* Reaparición de contenido.
* Cambios de altura.
* Sensación de lentitud.
* CLS.

### Páginas de noticia

Verifica:

* Tamaño máximo excesivo del titular.
* Interlineado demasiado compacto.
* Espaciado de letras muy negativo.
* Inconsistencia entre Fraunces y Georgia.
* Uso de capitular en contenidos cortos.
* Gran tarjeta exterior.
* Sidebar con demasiado peso.
* Publicidad dominante.
* Fuente original demasiado alejada del encabezado.
* Acciones de compartir.
* Relación entre imagen, pie de foto y crédito.

### Footer y confianza

El pie puede ser insuficiente para un medio independiente.

Debe revisarse la presencia y visibilidad de:

* Quiénes somos.
* Política editorial.
* Fuentes.
* Correcciones.
* Contacto.
* Sugerir noticia.
* Privacidad.
* Cookies.
* Aviso legal.
* Accesibilidad.
* Publicidad.

---

# 6. Dirección de diseño deseada

La propuesta futura debe reducir elementos, no añadir complejidad.

La portada debería pasar de:

> Una colección de módulos que explica qué ofrece la web.

A:

> Una portada editorial que muestra inmediatamente qué ocurre hoy en Alhaurín.

## Principios

1. Contenido antes que presentación.
2. Estado diario antes que promoción.
3. Jerarquía antes que simetría.
4. Espacio antes que sombras.
5. Tipografía antes que contenedores.
6. Fotografías antes que decoración.
7. Acciones reales antes que textos explicativos.
8. Móvil antes que escritorio.
9. Confianza antes que monetización.
10. Publicidad visible, pero no invasiva.
11. No ocultar la antigüedad de los datos.
12. No mostrar secciones vacías.
13. Mantener HTML, CSS y JavaScript simples.
14. Evitar introducir frameworks sin una necesidad demostrable.

---

# 7. Arquitectura visual objetivo de la portada

Analiza la viabilidad de esta estructura y propón ajustes cuando el contenido real lo requiera.

## Escritorio

### 1. Cabecera

* Logotipo.
* Navegación principal.
* Búsqueda.
* Botón secundario para anunciarse.
* Estado activo de navegación.

### 2. Alerta urgente

Solo visible cuando exista un aviso crítico o relevante.

Ejemplos:

* Corte de agua.
* Incendio.
* Alerta meteorológica.
* Corte de carretera.
* Incidencia municipal importante.

Si no existe alerta, no debe reservarse un bloque vacío.

### 3. Primer bloque

Diseño de dos columnas:

#### Columna principal

* Noticia principal.
* Imagen.
* Categoría.
* Titular.
* Resumen breve.
* Fecha.
* Fuente.

#### Columna secundaria

Panel “Hoy en Alhaurín”:

* Tiempo.
* Farmacia de guardia.
* Avisos.
* Próximo evento.
* Movilidad cuando sea relevante.

### 4. Últimas noticias

* Noticia secundaria con imagen.
* Lista de titulares.
* Jerarquía asimétrica.
* Menos tarjetas idénticas.

### 5. Publicidad

Primer anuncio después de que el usuario haya visto contenido real.

### 6. Servicios

* Farmacia.
* Agenda.
* Movilidad.
* Teléfonos.
* Trámites.

Formato compacto.

### 7. Guía útil

* Buscador.
* Categorías principales.
* Acceso a la guía completa.

No mostrar todas las fichas en portada.

### 8. Comercio

Solo cuando existan comercios activos.

### 9. Footer editorial y legal

Información de confianza y navegación secundaria.

## Móvil

Prioridad visual:

1. Cabecera.
2. Estado de hoy.
3. Alerta, si existe.
4. Noticia principal.
5. Últimas noticias.
6. Primer anuncio.
7. Farmacia y agenda.
8. Búsqueda de guía.
9. Categorías.
10. Comercio patrocinado.
11. Footer.

El usuario debe encontrar el estado del día dentro de la primera pantalla o inmediatamente después de un desplazamiento mínimo.

---

# 8. Sistema visual objetivo

## Colores

Conservar la dirección “sierra y olivar”, pero unificar la paleta.

Sistema recomendado:

* Carbón para texto principal.
* Verde oliva para identidad.
* Papel cálido para fondo.
* Gris cálido para texto secundario.
* Verde de estado.
* Ámbar de advertencia.
* Rojo oscuro de alerta.

Detecta y documenta:

* Azules heredados.
* Dorados heredados.
* Grises fríos.
* Colores duplicados.
* Colores escritos directamente en selectores.
* Inconsistencias entre archivos.

## Tipografía

Propuesta:

* Fraunces para H1, H2 y titulares editoriales importantes.
* Sans de sistema para navegación, botones, etiquetas y servicios.
* Segunda serif de lectura solo si existe una razón clara.

Rangos orientativos:

* H1 portada: 48–64 px en escritorio.
* H1 artículo: 44–60 px en escritorio.
* H1 móvil: 32–44 px.
* Titular de tarjeta: 17–22 px.
* Texto base: 16–18 px.
* Texto secundario: 14–15 px.
* Metadatos: 13–14 px.

No utilices tamaños inferiores a 14 px para información importante.

## Radios

Propuesta orientativa:

* Contenedor principal: 20–24 px.
* Tarjeta: 12–16 px.
* Botón: 10–14 px.
* Chip: redondeado completo.
* Imagen: 8–16 px.

## Sombras

Reservarlas para:

* Menú móvil.
* Cabecera sticky.
* Elemento editorial principal.
* Superposiciones.

El resto debe separarse mediante:

* Espacio.
* Línea.
* Cambio de fondo.
* Jerarquía tipográfica.

## Espaciado

Definir una escala consistente:

* 4.
* 8.
* 12.
* 16.
* 24.
* 32.
* 48.
* 64.
* 96.

Detecta valores arbitrarios y duplicados.

## Iconografía

Utilizar una sola familia coherente.

Evitar la mezcla de:

* Emojis.
* Letras.
* Símbolos tipográficos.
* Flechas diferentes.
* Iconos de varios estilos.

---

# 9. Prioridades de la hoja de ruta

Debes organizar el futuro trabajo en cuatro niveles.

## P0 — Experiencia fundamental

Debe incluir, como mínimo:

1. Reordenar la portada para mostrar información real antes del hero.
2. Reducir o eliminar el hero explicativo.
3. Hacer visible “Hoy en Alhaurín” en el primer recorrido.
4. Mostrar la noticia principal antes de publicidad.
5. Reducir la guía de portada.
6. Ocultar comercio cuando no haya contenido activo.
7. Revisar la posición de anuncios en móvil.
8. Hacer clicables imágenes, titulares y áreas de tarjeta.
9. Mejorar frescura y fecha de actualización.
10. Corregir navegación en tablet.
11. Corregir estados de carga y movimientos visuales.
12. Mejorar el foco.
13. Completar comportamiento accesible del menú móvil.
14. Evitar mensajes internos o placeholders visibles al lector.
15. Diferenciar claramente publicidad, patrocinio y contenido editorial.

## P1 — Unificación visual

1. Consolidar variables.
2. Reducir radios.
3. Reducir sombras.
4. Simplificar píldoras.
5. Unificar colores.
6. Unificar tipografías.
7. Unificar iconos.
8. Definir jerarquía editorial.
9. Normalizar proporciones de imagen.
10. Unificar botones y enlaces.
11. Reducir CSS duplicado.
12. Evitar reglas responsive contradictorias.

## P2 — Confianza y páginas internas

1. Mejorar páginas de noticia.
2. Mejorar fuente y crédito.
3. Rediseñar footer.
4. Mejorar información editorial.
5. Mejorar política de correcciones.
6. Crear estructura coherente para páginas legales.
7. Mejorar acciones en la guía.
8. Mejorar buscador.
9. Mejorar información de fecha de revisión.
10. Ocultar o tratar correctamente contenido incompleto.

## P3 — Evolución

1. Nueva identidad gráfica o monograma.
2. Navegación inferior móvil.
3. Buscador local unificado.
4. Filtros editoriales.
5. Favoritos.
6. Accesos personalizados.
7. Mejora avanzada de imágenes.
8. Sistema de diseño documentado.
9. Analítica de comportamiento.
10. Pruebas con usuarios.
11. Pruebas A/B.
12. Automatización de auditorías visuales.

---

# 10. Formato obligatorio de cada tarea

Convierte cada recomendación en una tarea implementable.

Cada tarea debe incluir exactamente:

## Identificador

Ejemplo:

`UX-P0-001`

## Título

Breve y accionable.

## Prioridad

* P0.
* P1.
* P2.
* P3.

## Problema de usuario

Explica qué dificultad real resuelve.

No describas únicamente un problema de CSS.

## Evidencia actual

Indica:

* Página.
* Componente.
* Archivo.
* Selector.
* Comportamiento observado.
* Captura, cuando sea posible.

## Resultado esperado

Describe el comportamiento futuro sin entrar todavía en código.

## Alcance

Lista qué zonas se verían afectadas.

## Fuera de alcance

Aclara lo que no forma parte de esa tarea.

## Archivos probablemente afectados

Indica archivos concretos, pero verificando previamente que existen.

## Dependencias

Señala las tareas que deben realizarse antes.

## Riesgo

* Bajo.
* Medio.
* Alto.

Explica brevemente el motivo.

## Complejidad

* S.
* M.
* L.
* XL.

No expreses duración temporal.

## Criterios de aceptación

Incluye criterios:

* Funcionales.
* Visuales.
* Responsive.
* Accesibles.
* Editoriales.
* De ausencia de regresiones.

## Validación

Indica cómo comprobar la tarea:

* Resoluciones.
* Teclado.
* Zoom.
* Lectores de pantalla cuando proceda.
* Datos vacíos.
* Titulares largos.
* Sin JavaScript.
* JavaScript lento.
* Herramientas del navegador.
* Lighthouse o equivalente.
* Comparación visual.

---

# 11. Fases recomendadas

Agrupa las tareas en fases coherentes.

## Fase 0 — Línea base

Sin modificar código:

* Inventario de páginas.
* Inventario de componentes.
* Inventario de variables.
* Inventario de breakpoints.
* Inventario de anuncios.
* Inventario de estados vacíos.
* Capturas de referencia.
* Medición inicial.
* Mapa de dependencias.
* Identificación de contenido crítico.

## Fase 1 — Arquitectura de portada

* Jerarquía.
* Orden de bloques.
* Eliminación de duplicaciones.
* Estado diario.
* Noticias.
* Guía resumida.
* Comercio condicional.
* Publicidad.

## Fase 2 — Sistema visual

* Colores.
* Tipografía.
* Espaciado.
* Radios.
* Sombras.
* Botones.
* Enlaces.
* Etiquetas.
* Iconos.
* Imágenes.

## Fase 3 — Responsive y navegación

* Móvil.
* Tablet.
* Menú.
* Cabecera.
* Clickabilidad.
* Franja de hoy.
* Listas de noticias.
* Navegación táctil.

## Fase 4 — Páginas internas

* Artículos.
* Categorías.
* Guía.
* Avisos.
* Tiempo.
* Planes.
* Comercios.
* Anunciarse.
* Contacto.

## Fase 5 — Confianza y monetización

* Footer.
* Fuentes.
* Correcciones.
* Contenido patrocinado.
* Publicidad.
* Páginas legales.
* Etiquetado.
* Transparencia.

## Fase 6 — Accesibilidad y estabilidad

* Foco.
* Teclado.
* Contraste.
* Zoom.
* Movimiento reducido.
* Menú.
* Estados de carga.
* CLS.
* LCP.
* INP.
* Contenido sin JavaScript.

## Fase 7 — Validación final

* Matriz de dispositivos.
* Capturas comparativas.
* Checklist.
* Pruebas manuales.
* Pruebas automáticas.
* Revisión editorial.
* Revisión de contenido real.
* Revisión de publicidad.
* Revisión de regresiones.

---

# 12. Criterios globales de aceptación

El futuro rediseño deberá cumplir como mínimo:

1. El usuario móvil encuentra el tiempo, una alerta o la farmacia en la primera pantalla o inmediatamente después.
2. La noticia principal aparece antes del primer anuncio.
3. No se muestra comercio vacío.
4. No se muestra contenido de carga de forma prolongada.
5. Las tarjetas de noticias son completamente clicables.
6. El menú funciona con teclado.
7. Escape cierra el menú.
8. El foco vuelve al botón al cerrar.
9. El foco no accede al contenido posterior mientras el menú está abierto.
10. El foco visual es claramente perceptible.
11. Los controles relevantes alcanzan al menos 44 × 44 px.
12. La navegación funciona correctamente a 320 px.
13. La web funciona con zoom del 200 %.
14. Los titulares largos no rompen la composición.
15. Las noticias sin imagen tienen un fallback adecuado.
16. Las secciones sin datos desaparecen o muestran un estado útil.
17. La fecha de actualización aparece en información que puede caducar.
18. La fuente editorial aparece cerca del contenido.
19. La publicidad está etiquetada de manera inequívoca.
20. La publicidad no imita contenido editorial.
21. La guía completa no se duplica en portada.
22. El CSS utiliza un sistema visual consistente.
23. No aparecen colores heredados fuera de la paleta.
24. Las descripciones móviles importantes no utilizan tamaños inferiores a 14 px.
25. No se introducen movimientos importantes durante la carga.
26. No se añade un framework para resolver problemas que HTML, CSS y JavaScript existentes puedan solucionar.
27. La solución mantiene SEO, páginas estáticas y datos actuales.
28. La solución no rompe los scripts de generación.
29. La solución no rompe la validación editorial.
30. La solución mantiene rendimiento y simplicidad de despliegue.

---

# 13. Pruebas y métricas futuras

Propón una matriz de validación que contemple:

## Dispositivos

* iPhone pequeño.
* iPhone estándar.
* Android estándar.
* Tablet vertical.
* Tablet horizontal.
* Portátil.
* Escritorio grande.

## Navegadores

* Chrome.
* Safari.
* Firefox.
* Edge.

## Accesibilidad

* Solo teclado.
* Zoom 200 %.
* Movimiento reducido.
* Contraste.
* VoiceOver o NVDA cuando proceda.
* Orden de foco.
* Nombres accesibles.
* Estados dinámicos.

## Rendimiento

Registrar una línea base y objetivos futuros para:

* Largest Contentful Paint.
* Cumulative Layout Shift.
* Interaction to Next Paint.
* Peso de imágenes.
* Número de hojas CSS.
* CSS no utilizado.
* Fuentes externas.
* Scripts bloqueantes.
* Espacios publicitarios.
* Contenido dinámico.

No inventes resultados.

Si no puedes medir alguna métrica, indícalo expresamente.

---

# 14. Salida obligatoria

Entrega el resultado en este orden:

## A. Resumen ejecutivo

Máximo 15 párrafos breves.

## B. Estado actual del repositorio

* Rama revisada.
* Commit o referencia revisada.
* Estado del árbol de trabajo.
* Arquitectura relevante.
* Archivos principales.

## C. Inventario de páginas y componentes

Tabla con:

* Página.
* Componente.
* Función.
* Relevancia.
* Problema principal.
* Prioridad.

## D. Diagnóstico visual

Separado por:

* Identidad.
* Tipografía.
* Color.
* Espaciado.
* Tarjetas.
* Imágenes.
* Navegación.
* Portada.
* Noticias.
* Guía.
* Publicidad.
* Footer.
* Móvil.
* Tablet.
* Escritorio.

## E. Diagnóstico de accesibilidad

Incluye:

* Contraste.
* Foco.
* Teclado.
* Menú.
* Tamaño táctil.
* Zoom.
* Reflow.
* Movimiento.
* Estados dinámicos.

## F. Diagnóstico de estabilidad visual

Incluye:

* Renderizado.
* Parpadeo.
* Layout shifts.
* Imágenes.
* Publicidad.
* Widgets.
* Estados de carga.

## G. Arquitectura de información propuesta

Incluye:

* Portada de escritorio.
* Portada móvil.
* Navegación.
* Footer.
* Guía.
* Noticias.

## H. Sistema visual propuesto

Incluye:

* Tokens.
* Colores.
* Tipografía.
* Espaciado.
* Radios.
* Sombras.
* Botones.
* Etiquetas.
* Iconos.
* Imágenes.

## I. Backlog priorizado

Tabla resumen de todas las tareas.

Columnas:

* ID.
* Título.
* Prioridad.
* Complejidad.
* Riesgo.
* Dependencias.
* Página o componente.

## J. Fichas completas de las tareas P0

Desarrolla íntegramente todas las tareas P0 usando el formato obligatorio.

## K. Fichas resumidas de P1, P2 y P3

Incluye suficiente detalle para desarrollarlas posteriormente.

## L. Orden recomendado de ejecución

Explica dependencias y secuencia.

## M. Matriz de validación

Incluye dispositivos, resoluciones, estados de datos, accesibilidad y pruebas.

## N. Riesgos y decisiones pendientes

Separa:

* Riesgos técnicos.
* Riesgos editoriales.
* Riesgos comerciales.
* Riesgos de accesibilidad.
* Riesgos de rendimiento.

## O. Preguntas que requieren decisión de producto

No detengas el análisis para formularlas.

Haz una recomendación por defecto para cada una.

Ejemplos:

* ¿Se elimina completamente el hero?
* ¿Se incorpora búsqueda en cabecera?
* ¿Se oculta comercio vacío?
* ¿Se introduce navegación inferior?
* ¿Se mantiene Fraunces?
* ¿Se mantiene la capitular?
* ¿Cuántos anuncios se admiten en móvil?
* ¿Cómo se prioriza “Hoy” frente a “Noticias”?

## P. Conclusión

Indica:

* Qué debe hacerse primero.
* Qué no debe hacerse todavía.
* Qué cambios aportarían mayor impacto.
* Qué riesgos podrían invalidar el rediseño.

---

# 15. Restricciones finales

No realices cambios.

No generes código final.

No generes diffs.

No crees ramas.

No crees archivos.

No realices commits.

No publiques nada.

No conviertas esta tarea en una implementación.

No sugieras una migración a React, Vue, Next.js, Astro u otro framework salvo que encuentres una limitación real, demostrable y crítica que no pueda resolverse razonablemente con la arquitectura actual.

No priorices tendencias visuales por encima de:

* Utilidad.
* Legibilidad.
* Información local.
* Accesibilidad.
* Rendimiento.
* Mantenibilidad.
* Confianza editorial.

La conclusión debe producir una hoja de ruta suficientemente precisa para que una segunda tarea de Claude Code pueda implementar cada fase de manera controlada.
