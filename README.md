# Gastos Familia

App web sencilla para registrar los gastos de la familia. Funciona en el móvil y en el ordenador, se puede instalar como app (PWA) y funciona sin conexión.

## Qué hace

- **Registrar gastos**: importe, descripción, categoría, quién pagó y fecha.
- **Resumen mensual**: total gastado, desglose por categoría y por persona.
- **Presupuesto mensual** opcional, con barra de progreso (se pone naranja al 80 % y roja al pasarse).
- **Lista de gastos** agrupada por día, con filtros por persona, categoría y búsqueda por texto. Toca un gasto para editarlo o borrarlo.
- **Ajustes**: personas, categorías (con emoji), moneda y presupuesto.
- **Copia de seguridad**: exportar/importar en JSON y exportar a CSV para abrirlo en Excel.

## Cómo usarla

No necesita instalación ni dependencias: son archivos estáticos (`index.html`, `styles.css`, `app.js`).

Para probarla en local:

```bash
python3 -m http.server 8000
# y abre http://localhost:8000
```

### Publicarla gratis con GitHub Pages

1. En GitHub: **Settings → Pages**.
2. En *Source* elige **Deploy from a branch**, la rama y la carpeta `/ (root)`.
3. Abre la URL que te da GitHub desde el móvil y usa **"Añadir a pantalla de inicio"** para instalarla como app.

## Dónde se guardan los datos

Los datos se guardan en el navegador de cada dispositivo (`localStorage`). Eso significa que:

- Son privados: no salen de tu móvil.
- **No se sincronizan solos** entre los móviles de la familia. Para pasar los datos de un dispositivo a otro, usa *Ajustes → Exportar copia* e *Importar copia*.
- Conviene exportar una copia de vez en cuando.

## Próximos pasos posibles

- Sincronización entre los móviles de la familia (por ejemplo con Firebase o Supabase).
- Gastos recurrentes (alquiler, suscripciones…).
- Gráfico de evolución mes a mes.
- Ingresos además de gastos.
