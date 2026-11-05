# Generador Pabbly

Generador de JavaScript para **Pabbly Connect** a partir de una tabla editable o pegada desde Excel. Valida los pesos, asigna variables `p0`, `p1`, `p2`… y produce el código listo para copiar o descargar.

La aplicación es 100 % estática: todo el procesamiento ocurre en el navegador. No hay backend, no se guardan datos y no se usa `localStorage`, `sessionStorage` ni autoguardado.

## Características

- Tabla editable con pegado directo desde Excel (incluye detección de la columna «N.º Eje» y de la fila de encabezado).
- Pesos de 0 a 100, incluido **0 %**, con tolerancia decimal de `0.05`.
- Variables numeradas desde `p0`, sin saltos al agregar o eliminar filas.
- Validación con fila y columna exactas, bloqueo de columnas adicionales y avisos de pegado.
- Salida compacta o formateada, con resaltado de sintaxis, copiar y descargar.
- Tema claro/oscuro según el sistema, con cambio manual solo durante la sesión.
- Build con **Vite** y despliegue automático en **GitHub Pages**.

## Requisitos

- Node.js **24 o superior**.

## Uso local

```bash
npm install
npm run dev
```

Abre `http://127.0.0.1:5173` con recarga automática.

En Windows también puedes hacer doble clic en `INICIAR.bat`: instala dependencias si faltan, compila y sirve la versión final en `http://127.0.0.1:8765`.

## Compilar y probar

```bash
npm test          # Pruebas del motor (19 grupos de casos)
npm run build     # Genera dist/
npm run preview   # Sirve dist/ en http://127.0.0.1:4173
npm start         # Compila y sirve dist/ en http://127.0.0.1:8765
npm run serve     # Sirve dist/ sin recompilar
```

`dist/` es la carpeta publicable: puede subirse a GitHub Pages, Netlify o cualquier hosting estático. Está incluida en `.gitignore` porque GitHub Actions la genera desde el código fuente.

## Publicar en GitHub Pages

1. Crea un repositorio vacío en GitHub.
2. Desde la raíz del proyecto:

   ```bash
   git init
   git add .
   git commit -m "Generador Pabbly con Vite"
   git branch -M main
   git remote add origin https://github.com/USUARIO/REPOSITORIO.git
   git push -u origin main
   ```

3. En el repositorio: **Settings → Pages → Build and deployment → Source** y selecciona **GitHub Actions**.
4. El flujo [`.github/workflows/pages.yml`](.github/workflows/pages.yml) se ejecuta en cada push a `main`: instala con `npm ci`, corre las pruebas, compila y publica `dist/`.
5. La URL queda disponible en **Settings → Pages** y en la pestaña **Actions**:

   ```
   https://USUARIO.github.io/REPOSITORIO/
   ```

`vite.config.mjs` usa `base: './'`, así que los recursos se cargan con rutas relativas y funcionan tanto en la raíz como en una subcarpeta de GitHub Pages.

> El flujo escucha la rama `main`. Si tu rama principal se llama `master`, ajusta `branches` en `pages.yml`. También puedes lanzar el despliegue manualmente desde **Actions → Deploy to GitHub Pages → Run workflow**.

## Estructura

```text
index.html                 Entrada de Vite
src/app.js                 Interfaz: tabla, pegado, validación, botones
src/style.css              Estilos y temas
public/theme.js            Tema aplicado antes del primer pintado
public/favicon.svg         Icono
generator.js               Motor independiente de validación y generación
tests/check.js             Pruebas del motor
vite.config.mjs            Configuración de Vite
server.js                  Servidor local para dist/
.github/workflows/         CI/CD de GitHub Pages
```

## Privacidad

La tabla y el código generado solo existen en la memoria de la pestaña. Al refrescar o cerrar se pierden. La aplicación no envía datos a ningún servidor y no incluye ningún mecanismo de persistencia.
