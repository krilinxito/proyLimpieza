---
id: SPEC-KRILINXI-055
spec: specs/SPEC-KRILINXI-055-quitar-transferencia.md
explica:
  - quitar un valor de un ENUM en Postgres
---

# SPEC-KRILINXI-055 — Quitar la transferencia como forma de pago

## Qué se construyó

La transferencia dejó de ser una forma de pago en toda la app: la base (`metodo_pago` pasa a EFECTIVO, QR y TARJETA), la API (rechaza una transferencia
nueva), los formularios de cobro y las estadísticas, que ahora dibujan tres formas de pago y tres colores de serie.

## Cómo funciona, paso a paso

Un valor de ENUM está repetido en tres capas, y las tres se cambian a la vez. Caso: el empleado cobra un adelanto.

1. **Frontend.** `ElegirMetodo.tsx` pinta una casilla por cada elemento de `METODOS_PAGO` (`frontend/src/lib/dominio.ts:19`), así que al sacar
   `TRANSFERENCIA` de la lista desaparece la opción sin tocar el componente. Lo mismo hacen las estadísticas: `SeccionIngresos` y `SeccionTendencia`
   recorren `METODOS_PAGO`, y los mensajes de «Elige cómo paga» dejaron de nombrar la transferencia.
2. **Backend.** `pagos.controller.ts` valida con `esMetodoPago` (`backend/src/utils/dominio.ts:19`). Una transferencia que llegue desde una tablet
   con la versión vieja responde 400 con «Elige cómo paga el cliente: efectivo, QR o tarjeta.», y la tablet la manda a Para corregir (CLAUDE.md §6: lo
   que valida el servidor es la garantía). `estadisticas.model.ts` arma el desglose con `METODOS_PAGO`, así que no necesitó cambios.
3. **Postgres.** `backend/migraciones/005_quitar_transferencia.sql`: (a) `UPDATE pagos SET metodo = 'EFECTIVO' WHERE metodo = 'TRANSFERENCIA'`;
   (b) renombra el tipo a `metodo_pago_viejo`; (c) crea `metodo_pago` con tres valores; (d) `ALTER COLUMN metodo TYPE metodo_pago USING metodo::text::metodo_pago`;
   (e) borra el tipo viejo. El runner la envuelve en una transacción: o pasa todo, o nada.

## Dónde encaja en la arquitectura

Es el caso de CLAUDE.md §11 («Nunca edites la línea base ni una migración ya aplicada: se corrige con una nueva»). Postgres no puede quitar un valor de un
ENUM, y por eso se recrea el tipo. La línea base (`context/lavanderia_schema.sql`) sigue diciendo cuatro valores: es historia congelada.

## Fundamentos

**Quitar un valor de un ENUM en Postgres.** Un ENUM guarda sus valores en el catálogo (`pg_enum`) y `ALTER TYPE … ADD VALUE` existe, pero `DROP VALUE` no:
quitar uno dejaría filas apuntando a un valor que ya no está. La receta es cambiar de tipo: (1) mover los datos que usan el valor que se va, (2) renombrar el
tipo viejo, (3) crear el nuevo con el nombre de siempre, (4) cambiar el tipo de la columna con `USING columna::text::tipo_nuevo` (pasa por texto porque
Postgres no convierte directo entre dos ENUM), (5) borrar el tipo viejo. Si queda una fila con el valor que se fue, el paso 4 falla y la transacción se deshace
entera: por eso el `UPDATE` va primero. Ejemplo de este repo: `005_quitar_transferencia.sql`, probado contra la base real en
`backend/tests/db/quitarTransferencia.db.test.ts`.

## Decisiones y por qué

- **Los cobros viejos pasan a EFECTIVO (decidido con la persona):** son datos de prueba, y así no se borra ninguna fila ni cambia lo cobrado en total. La
  alternativa, borrar los pagos, rompería los saldos de sus órdenes.
- **No se tocó la auditoría:** una fila vieja que diga TRANSFERENCIA en `valores_nuevos` es historia. La migración no escribe en `auditoria`.
- **Series de los gráficos (criterio 4):** `serie-4` salió del tema, en los dos bloques. Las tres que quedan (`#3a83fc`, `#e55108`, `#0f9958`) ya estaban
  validadas para daltonismo **con todas sus parejas** (SPEC-KRILINXI-026): quitar una serie solo quita parejas, no agrega ninguna, así que el conjunto sigue
  siendo distinguible sin volver a correr el validador.
- **Los tests de dominio leen línea base + migraciones**, con la regla «el último `CREATE TYPE` gana». La alternativa era editar la línea base, que está prohibido.

## Los tests

Se reusó `baseDescartable({ conLineaBase: true })` y el patrón de `deudaSchema.db.test.ts` (datos con la forma de antes, y recién ahí `migrar`). El archivo
nuevo `quitarTransferencia.db.test.ts` prueba que el tipo pasa de cuatro valores a tres, que el cobro viejo queda en EFECTIVO con su monto y que la suma no cambia,
que la base rechaza una transferencia nueva (código `22P02`) y que un segundo `migrar` no hace nada. En el frontend y el backend se actualizaron las fixtures que
traían `TRANSFERENCIA: '0.00'` y los tests de estadísticas que usaban la transferencia como ejemplo de «una forma de pago que va sola»: ahora lo hacen con tarjeta o QR.

## Si mañana tenés que tocar esto

**Después del pull hay que correr `npm run migrar --workspace backend`:** sin eso el backend no arranca y dice cuántas faltan. Si PowerSync no refleja el cambio,
`docker compose restart powersync`. Si algún día hay que volver a ofrecer un método, es una migración con `ALTER TYPE metodo_pago ADD VALUE`, más una línea en
`METODOS_PAGO` de los dos lados, su texto, su color de serie en los dos temas y su par en `tema.test.ts`.
