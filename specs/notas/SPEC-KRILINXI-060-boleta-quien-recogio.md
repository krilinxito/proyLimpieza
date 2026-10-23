---
id: SPEC-KRILINXI-060
spec: specs/SPEC-KRILINXI-060-boleta-quien-recogio.md
explica: []
---

# SPEC-KRILINXI-060 — Mostrar quién retiró la ropa cuando fue sin boleta

## Qué se construyó

Al abrir una boleta ya entregada, ahora se ve quién se llevó la ropa: nombre y carnet si vino sin boleta, "Con la boleta" si la trajo. Antes ese dato se guardaba pero nadie lo podía mirar después.

## Cómo funciona, paso a paso

Hay dos caminos hasta la misma línea "Retiró", porque hay dos fuentes de datos (CLAUDE.md §6 y §8).

**Admin, sin ropa en su tablet** — una boleta con entrega sin boleta:
1. `GET /api/ordenes` ejecuta la consulta `HISTORIAL` (`backend/src/models/ordenes.model.ts`). Ya hacía `LEFT JOIN entregas e` para el precio final; ahora también selecciona `e.tipo_retiro`, `e.retirado_por_nombre` y `e.retirado_por_carnet`.
2. `listar()` arma `retiro`: `null` si `tipo_retiro` es null (no hay entrega), si no `{ tipo, nombre, carnet }`. El controller no cambió: devuelve lo que le da el model.
3. En el front, `leerBoleta` (`features/historial/api/historialApi.ts`) comprueba el contrato (`leerRetiro`) y descarta la página entera si no encaja, como con el resto de los campos.
4. `DetalleDeSoloLectura` agrega el par "Retiró" con `textoDelRetiro`.

**Quien atiende, sin internet** — `SELECT_ORDENES` (`features/ordenes/api/ropaLocal.ts`) ya cruzaba `entregas`; se le sumaron las tres columnas. `aRetiro` arma el mismo `Retiro` desde la fila local y `DetalleOrden` lo muestra. El historial local (`historialLocal.ts`) lo copia a `BoletaListada`.

## Dónde encaja en la arquitectura

El SQL sigue en el model y la redacción de la frase, en un solo lugar del front (`features/ordenes/retiro.ts`), igual que el saldo vive solo en `pagos/saldo.ts`. Ninguna pantalla decide cómo se dice quién retiró. Es una lectura: no hay endpoint ni escritura nuevos.

## Decisiones y por qué

- **Par `<dt>`/`<dd>` "Retiró" → "Con la boleta"**, no una frase suelta "Retiró con la boleta": es la convención de los detalles (cada dato es un par) y así lo buscan los tests y lo leen los lectores de pantalla.
- **Campo `retiro` anidado** en vez de tres campos planos en la boleta: nombre y carnet solo tienen sentido juntos con el tipo, y una boleta sin entregar es un solo `null`.
- Una fila local con un `tipo_retiro` que no se entiende da `null` (no muestra nada) en vez de romper la pantalla, como hace `aOrden` con los datos rotos.

## Los tests

Se reusaron `boletaDePrueba` / `paginaDeBoletas` (ahora con `retiro: null` por defecto), `entregaDePrueba` y `crearEntrega` del backend, que ganó el parámetro opcional `sinBoleta: { nombre, carnet }` para probar contra Postgres real.

## Si mañana tenés que tocar esto

Una columna nueva de la entrega que se quiera mostrar va en tres sitios: `HISTORIAL` (backend), `SELECT_ORDENES` (front local) y el contrato de `leerBoleta`.
