# Señal estelar

Simulación interactiva de exploración planetaria hecha con p5.js y Vite.

## Desarrollo local

Requiere Node.js 18 o posterior.

```sh
npm ci
npm run dev
```

## Compilar y previsualizar

```sh
npm run build
npm run preview
```

Vite genera el sitio estático en `dist/`.

## Publicar en GitHub Pages

El flujo de GitHub Actions de `.github/workflows/deploy.yml` compila y publica el sitio cada vez que hay un push a `main`. En el repositorio, configura **Settings → Pages → Build and deployment → Source** como **GitHub Actions**.

La compilación en GitHub Actions establece automáticamente la ruta base según el nombre del repositorio, para que los recursos funcionen en la URL de Pages.
