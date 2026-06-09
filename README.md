# Alhaurin al Dia

Web local independiente para recopilar noticias, guia util, servicios, comercios y planes de Alhaurin el Grande.

## Documentación

- [Arquitectura de la web](docs/ARQUITECTURA.md): visión técnica completa del frontend, datos, scripts, generación de páginas, SEO, sitemaps y despliegue.
- [Manual de administración](docs/MANUAL_ADMINISTRACION.md): guía operativa para actualizar noticias, avisos, agenda, farmacias, comercios, guía útil, SEO y publicación.
- [Plan operativo de contenido](docs/PLAN_OPERATIVO_CONTENIDO.md): rutina de validación, próximos pasos y criterios editoriales.

## Estructura del proyecto

- index.html: estructura principal de la web.
- styles.css: estilos visuales.
- app.js: carga dinamica de noticias y guia util.
- home-live.js: carga el panel diario de portada, incluyendo tiempo, avisos y agenda.
- data/noticias.json: noticias publicadas.
- data/guia-util.json: recursos de la guia local.
- data/tiempo-aemet.json: resumen del tiempo usado en portada.
- scripts/generar_noticias.py: generador de noticias desde feeds.
- scripts/validar_contenido.py: validación editorial y técnica antes de publicar.

## Validación

Antes de pasar cambios a main, ejecutar:

```bash
python scripts/validar_contenido.py
```

También existe un workflow de GitHub Actions en `.github/workflows/validar-contenido.yml` que valida el contenido en pushes, pull requests y ejecución manual.

## Secciones actuales

- Noticias locales.
- Guia util.
- Avisos locales.
- Tiempo.
- Planes y rincones.
- Comercios destacados.
- Espacios publicitarios preparados.

## Proximos pasos

- Endurecer el generador para rechazar titulares cortados.
- Mejorar deduplicación editorial entre fuentes.
- Automatizar la actualización de `data/tiempo-aemet.json`.
- Crear paginas internas SEO para farmacias, tramites, telefonos, transporte y restaurantes.
- Conectar formulario real para anunciantes.
- Preparar aviso legal, privacidad y cookies antes de monetizar.
