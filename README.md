# Gastos Familia

App para anotar los gastos de la casa entre dos (o más) personas. **Lo que carga uno aparece al instante en el celular del otro.** Se instala en el celular como una app, y si no hay internet igual se puede cargar: se sube sola cuando vuelve la conexión.

## Qué hace

- **Cargar gastos**: monto, descripción, categoría, quién pagó y fecha.
- **Resumen del mes**: total gastado, cuánto por categoría y cuánto puso cada uno.
- **Presupuesto mensual** opcional, con barra que se pone naranja al 80 % y roja al pasarse.
- **Lista de gastos** por día, con filtros por persona, categoría y búsqueda. Tocando un gasto se edita o se borra.
- **Ajustes compartidos**: personas, categorías, moneda y presupuesto son los mismos para los dos.
- **Copias**: bajar todo en JSON o en CSV (para Excel), e importar gastos.

## Cómo funciona la sincronización

Los gastos se guardan en **Firebase** (de Google, gratis para este uso). Cada uno entra con su correo y contraseña, y los dos ven el mismo "libro" de gastos. Solo los correos que ustedes pongan en las reglas pueden ver o tocar los datos.

## Puesta en marcha (una sola vez, ~15 minutos)

### 1. Crear el proyecto en Firebase

1. Entrá a <https://console.firebase.google.com> con una cuenta de Google.
2. **Crear un proyecto** → ponele un nombre (por ejemplo `gastos-casa`). Google Analytics no hace falta, lo podés desactivar.

### 2. Crear las dos cuentas

1. En el menú de la izquierda: **Compilación → Authentication → Comenzar**.
2. En **Método de acceso**, elegí **Correo electrónico/contraseña**, activalo y guardá.
3. En la pestaña **Usuarios**, tocá **Agregar usuario** y creá uno para cada uno (correo + contraseña). Esa es la clave con la que van a entrar a la app.

### 3. Crear la base de datos y protegerla

1. En el menú: **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación: `southamerica-east1 (São Paulo)` es la más cercana si están en Sudamérica. Elegí **modo de producción**.
3. Andá a la pestaña **Reglas**, borrá lo que hay y pegá el contenido de [`firestore.rules`](firestore.rules), **cambiando los dos correos por los de ustedes** (los mismos del paso 2). Tocá **Publicar**.

### 4. Conectar la app con Firebase

1. Tocá el engranaje ⚙️ → **Configuración del proyecto**.
2. Abajo, en **Tus apps**, tocá el ícono web **`</>`**, poné un nombre y **Registrar app** (no hace falta Firebase Hosting).
3. Te muestra un bloque `const firebaseConfig = { ... }`. Copiá esos valores en [`firebase-config.js`](firebase-config.js).

> Estos datos no son secretos (van dentro de cualquier app web que use Firebase). Lo que protege los gastos son las reglas del paso 3.

### 5. Publicar la app (GitHub Pages, gratis)

1. En GitHub: **Settings → Pages**.
2. En *Source* elegí **Deploy from a branch**, la rama y la carpeta `/ (root)` → **Save**.
3. En un par de minutos te da una dirección tipo `https://tu-usuario.github.io/app-gastos-familia/`.

### 6. Instalarla en los celulares

Abrí esa dirección en cada celular, entrá con tu correo y contraseña, y:

- **Android (Chrome)**: menú ⋮ → **Agregar a la pantalla principal** / **Instalar app**.
- **iPhone (Safari)**: botón compartir → **Agregar a inicio**.

La sesión queda guardada; no hay que volver a poner la clave.

## Probarla en la computadora

Son archivos estáticos, sin nada que instalar:

```bash
python3 -m http.server 8000
# y abrí http://localhost:8000
```

Para probar sin tocar los datos reales se pueden usar los emuladores de Firebase (`firebase emulators:start --only auth,firestore`) y abrir `http://localhost:8000/?emulador`.

## Costos

El plan gratuito de Firebase (Spark) permite 50.000 lecturas y 20.000 escrituras por día, muchísimo más de lo que usa una familia. No hace falta cargar tarjeta.

## Ideas para más adelante

- Gastos fijos que se repiten todos los meses (alquiler, servicios, suscripciones).
- Gráfico de cómo van los gastos mes a mes.
- Cuentas claras: quién le debe a quién si los gastos se dividen a medias.
