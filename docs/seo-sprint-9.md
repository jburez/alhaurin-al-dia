# Sprint SEO 9: publicación diaria segura

Este sprint añade una comprobación final antes de publicar cambios en `main`.

## Objetivos

- Tener un comando diario único para generar y validar.
- Comprobar que existen archivos críticos.
- Comprobar que los sitemaps contienen URLs clave.
- Comprobar que `robots.txt` apunta al sitemap index.
- Comprobar que la home mantiene canonical, JSON-LD y contenido estático.
- Comprobar que no hay críticos SEO ni páginas huérfanas.
- Evitar publicar si falta `noticias/index.html` o si reaparecen rutas antiguas.

## Comandos nuevos

```bash
npm run publish:check
```

Ejecuta el comprobador final de publicación.

```bash
npm run daily
```

Ejecuta:

```bash
npm run build && npm run publish:check
```

## Flujo diario recomendado

```bash
git checkout develop
git pull origin develop
npm run daily
git status
git diff --stat
```

Si todo está correcto:

```bash
git add .
git commit -m "Actualiza noticias y sitemaps"
git push origin develop
```

Después publicar en `main`:

```bash
git checkout main
git pull origin main
git merge develop
git push origin main
```

## Limpieza de noticias huérfanas

La limpieza sigue siendo explícita. No forma parte de `daily`.

Para revisar:

```bash
npm run news:orphans:dry
```

Para limpiar, solo cuando se haya revisado el informe:

```bash
npm run news:orphans:clean
npm run sitemap
npm run seo:orphans
npm run seo:audit
npm run publish:check
```

## Archivos de informes

Los informes de `reports/*.json` son locales y deben permanecer ignorados por Git.
