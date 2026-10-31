---
id: SPEC-KRILINXI-070
spec: specs\SPEC-KRILINXI-070-reembolso-entrega.md
explica:
  - cambiar una restricción CHECK con una migración
  - variante de una fila con una columna opcional
---

# SPEC-KRILINXI-070 — Entregar sin cobrar (reembolso)

## Qué se construyó

Un botón nuevo en la boleta con deuda, «Entregar sin cobrar»: la ropa sale con lo que el cliente ya pagó, la boleta pasa a
REEMBOLSADO (en rojo) y queda escrito por qué y quién lo hizo. Cualquiera lo puede registrar, pero el administrador lo ve
marcado en «¿Quién hizo qué?». No devuelve dinero: eso es otra spec (`reembolso-devolucion`).

## Cómo funciona, paso a paso

Caso: boleta de Bs 50 con Bs 20 de adelanto. El cliente se enoja y no paga los Bs 30.

1. En el detalle, `AccionEntregar` ofrece «Entregar sin cobrar» solo si `orden.saldo > 0`
   (`frontend/src/features/entregas/components/AccionEntregar.tsx:41`). Abre `FormularioReembolso`, que pide quién retira
   (`CamposDeRetiro`, el mismo bloque que usa la entrega común) y el motivo.
2. Al tocar el botón, `prepararReembolso` valida sin escribir (`entregasLocal.ts:177`): la boleta existe, no está anulada ni
   cerrada, **debe algo**, el retiro está completo y el motivo tiene contenido y hasta 300 letras. El precio final de la entrega
   es `orden.pagado` (Bs 20): lo ya cobrado. La confirmación dice «No se van a cobrar Bs 30,00… no se puede deshacer».
3. `registrarReembolso` (`entregasLocal.ts:222`) escribe **una sola fila** en `entregas`, con `motivo_reembolso`. Ni pago ni
   cargo, y no toca `ordenes.estado`. Sin sincronizar, la boleta ya figura Reembolsado porque `estadoEfectivo` mira ese
   motivo (`ropaLocal.ts:130`).
4. La cola sube `POST /api/entregas` con `motivo_reembolso`. El controller lo lee con `leerMotivoReembolso`
   (`entregas.controller.ts:69`): ausente es una entrega común; presente, tiene que tener contenido y no pasar de 300. Si
   también vienen cargos, responde 400. La marca para el admin se decide aquí (`entregas.controller.ts:159`).
5. El model (`entregas.model.ts:216`) usa **la misma sentencia de siempre**; solo cambia con `$11` (el motivo): el estado
   nuevo es REEMBOLSADO, se saltan las condiciones de precio y de saldo, y el `precio_final` que devuelve el `UPDATE` es lo
   cobrado (`cobradoSql`). El `INSERT` lo guarda junto con el motivo, y el CTE de auditoría deja su fila con
   `revision = 'reembolso'`. Todo o nada, igual que antes.
6. Para el admin: `GET /api/auditoria` trae `motivoReembolso` leyendo la entrega (`auditoria.model.ts:337`), y
   `GET /api/ordenes` trae `reembolso: { motivo, hechoPor, fecha }`. La tablet del admin no tiene esas entregas, por eso
   viaja por la API.

## Dónde encaja en la arquitectura

- **La regla autoritativa es del servidor, en la misma sentencia** (CLAUDE.md §6): el frontend valida por cortesía
  (`prepararReembolso`); el servidor vuelve a validar, y un rechazo no escribe nada. Sin eso, una entrega sin cobrar con
  una orden anulada en otra tablet dejaría una entrega sobre una orden anulada.
- **El frontend nunca escribe `ordenes.estado`**: REEMBOLSADO, como ENTREGADO, lo pone el servidor, y la tablet lo ve por
  `estadoEfectivo`.
- **El dinero se suma en un solo sitio**: el saldo sale de `calcularSaldo`, y los montos viajan en centavos/texto decimal.
- **Reuso en lugar de copia**: `CamposDeRetiro` (la pregunta de la boleta, nombre y carnet) y `validarRetiro` los comparten la
  entrega común y la que sale sin cobrar. Un tercer sitio que pida «quién retira» debería usarlos, no copiarlos.
- Es lectura mía, no una regla escrita: se eligió reutilizar `auditoria.revision` y no una acción nueva (`REEMBOLSAR`) porque
  agregar un valor a un ENUM de Postgres complica la migración y esta marca ya tenía el filtro `?revisar=true`.

## Fundamentos

**Una variante de una fila con una columna opcional.** En vez de una tabla `reembolsos` o un tipo nuevo de entrega, una
entrega sin cobrar es una `entregas` con `motivo_reembolso` lleno; las comunes lo tienen en `NULL`. Ventaja: `vw_saldos`,
las sync rules (`SELECT *`), el índice por orden y la regla de «una entrega por orden» siguen valiendo sin tocarlas. Costo:
hay que acordarse de preguntar por el motivo donde importa la diferencia (el estado, las condiciones de saldo, la
auditoría). Ejemplo: `entregas.model.ts:221`, donde `$11::text IS NOT NULL OR …` apaga la condición de saldo solo para el
reembolso.

**Cambiar una restricción CHECK con una migración.** `auditoria.revision` solo admitía `cuenta_dada_de_baja`
(`migraciones/001_auditoria_revision.sql`). Una migración aplicada no se edita, así que `008_reembolso_entrega.sql` suelta la
restricción y la vuelve a crear con los dos valores, en la misma transacción. Sin esto, el primer reembolso fallaría con
`23514` y se perdería la entrega entera, porque la auditoría va en la misma sentencia.

**Ya explicado antes:** la sentencia atómica con CTE que modifica datos → SPEC-ALE186-010
(`specs/notas/SPEC-ALE186-010-auditoria-registro.md`); migraciones → SPEC-ALE186-019
(`specs/notas/SPEC-ALE186-019-migraciones-schema.md`); estado derivado (lo que se muestra no es lo guardado) → SPEC-KRILINXI-008
(`specs/notas/SPEC-KRILINXI-008-ordenes-sucursal.md`).

## Decisiones y por qué

- **Cualquiera lo registra, con marca para el admin** (decidido al aprobar): pedir permiso a un admin con la tablet sin
  internet bloquearía el mostrador, que es lo que más se quiere evitar. El freno es el motivo obligatorio y la marca.
- **Un reembolso no admite cargos**: el precio final es lo cobrado. Los cargos son renglones (`/api/orden-items`) y no viajan
  en el cuerpo de la entrega; el 400 cubre un cuerpo con `cargos`/`renglones`, y la pantalla ni los ofrece.
- **Sin deuda no hay reembolso en la pantalla, pero el servidor no lo exige**: la spec dice que no exige saldo cero y que
  deja de comparar el precio; prohibir en el servidor un reembolso de una boleta pagada sería una regla que nadie pidió.
  Si molesta, es una condición más del `UPDATE`.
- **Si lo hizo una cuenta dada de baja, esa marca gana**: la columna guarda un solo valor; el reembolso se ve igual por su
  motivo.
- **Para corregir**: una entrega sin cobrar rechazada no recalcula el precio final (`corregirLocal.ts:214`); sería convertirla
  en una entrega común con otro precio.

## Los tests

- Contra Postgres real (`backend/tests/db/reembolso.db.test.ts`): saldo 0 en `vw_saldos`, ningún pago nuevo, ingresos sin
  cambio, estadísticas sin deuda, reintento sin duplicar, anulada/entregada/reembolsada rechazadas sin escribir, restricción de
  motivo en blanco, auditoría marcada y visible para el admin, historial. Reusa `escenario`, `crearOrden`, `pagarOrden`,
  `auditoriaDe` de `tests/helpers/baseReal.ts`; no hizo falta un helper nuevo.
- Con dobles: el SQL del model (el motivo es `$11`, el precio final es lo cobrado) y el controller (400 por motivo, cargos,
  sesión, sucursal). En el frontend, en `EntregarEnMostrador.test.tsx` el recorrido completo, y por separado la lógica local,
  el estado, el historial del admin, la auditoría y Para corregir.
- Los tests que listaban las migraciones o las columnas del schema se actualizaron: `schema.test.ts` ahora suma al SQL base
  los `ADD COLUMN` de las migraciones, así que una columna futura no obliga a tocarlo.

## Si mañana tenés que tocar esto

Empieza por la sentencia de `entregas.model.ts:216` y por `FormularioReembolso.tsx`. Cuidado con la spec 071 (admin edita
boletas): al mover una boleta de sucursal tiene que mover también el `sucursal_id` de la entrega, y ahora las reembolsadas
son editables. Y con `reembolso-devolucion`: devolver dinero cambia el modelo de pagos y puede tocar la regla «precio final =
lo cobrado».
