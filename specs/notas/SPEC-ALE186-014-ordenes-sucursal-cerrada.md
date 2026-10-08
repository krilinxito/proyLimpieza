---
id: SPEC-ALE186-014
spec: specs/SPEC-ALE186-014-ordenes-sucursal-cerrada.md
explica:
  - no confiar en el reloj de quien manda el dato
  - un dato que no esta en la tabla puede salir del historial
---

# SPEC-ALE186-014 — Una sucursal cerrada no recibe ropa nueva

## Qué se construyó

Dar de baja una sucursal es algo excepcional: normalmente todas están abiertas. Cuando
pasa, esa sucursal deja de recibir ropa, **salvo** la que una tablet había cargado sin
internet antes de la baja y sube después. Esa ropa entró de verdad y hay clientes
esperándola. Además, el servidor ya no acepta una fecha de ingreso en el futuro, que es
el síntoma típico de una tablet con el reloj mal puesto.

## Cómo funciona, paso a paso

Una tablet de la sucursal Norte cargó ropa a las 18:00 sin internet. A las 19:00 el admin
dio de baja Norte. A las 20:00 vuelve internet y la tablet sube la orden con
`fecha_entrada: 18:00`.

1. **Controller** (`backend/src/controllers/ordenes.controller.ts`): valida el cuerpo y saca
   la sucursal del token del empleado, como siempre. No sabe nada del cierre.
2. **Model, un solo INSERT** (`backend/src/models/ordenes.model.ts:191`). Ya no es
   `INSERT … VALUES`: es `INSERT … SELECT … FROM sucursales s WHERE …`. La fila de Norte
   entra al SELECT solo si cumple dos condiciones:
   - la fecha no está más de 5 minutos en el futuro (`:202`, `now() + $10::interval`);
   - Norte está activa, **o** la `fecha_entrada` es anterior a su último cierre.
3. **¿Cuándo se cerró Norte?** Lo dice la auditoría: `momentoDelCierre`
   (`backend/src/models/auditoria.model.ts:163`) busca la fila EDITAR más reciente de esa
   sucursal en la que `activa` valía `true` antes del cambio. Esa fila la escribió
   SPEC-ALE186-011 en la misma sentencia que dio de baja la sucursal, con la hora de
   Postgres: 19:00.
4. **18:00 < 19:00:** la condición se cumple, se inserta la orden y su auditoría, y se
   responde 201. Si la orden hubiera sido de las 19:30, el SELECT no devolvería nada y no
   se insertaría nada.
5. **Si no insertó, se averigua por qué** (`:232` en adelante). Primero el reintento: si
   la orden ya existe, se devuelve con 200, aunque la sucursal se haya cerrado después.
   Si no, `motivoDelRechazo` (`:239`) pregunta si la fecha es futura o la sucursal está
   cerrada, y el controller lo traduce en 400 `FECHA_FUTURA` o 409 `SUCURSAL_CERRADA`.
   La tablet aparta los dos en "para corregir" (SPEC-KRILINXI-007).

## Dónde encaja en la arquitectura

- **La regla va en el INSERT, no en el controller.** Si el controller consultara "¿está
  abierta?" y después el model insertara, un cierre entre las dos consultas dejaría pasar
  una orden posterior. Es la misma lección de SPEC-ALE186-004 y la misma forma que pagos
  (SPEC-ALE186-005).
- **Qué significa "un cierre" lo sabe el model de auditoría.** `momentoDelCierre` vive en
  `auditoria.model.ts` y no en el de órdenes: si algún día cambia cómo se anota un cierre,
  se cambia en un solo lugar, el mismo que lo escribe.

## Fundamentos

**Un dato que no está en la tabla puede salir del historial.** `sucursales` no guarda
*cuándo* se cerró: solo sabe si está activa ahora. Agregar una columna `cerrada_en` sería
lo directo, pero exige `down -v`, y el proyecto no tiene migraciones. La auditoría, en
cambio, ya anota cada cambio con su hora y su valor anterior, y nadie puede editarla. Un
cierre es "un EDITAR de sucursales donde `activa` antes era `true`". Leer un hecho del
historial en vez de una columna tiene un costo, y conviene saberlo: si alguien cierra una
sucursal **sin pasar por la API** (a mano en la base), no hay fila de auditoría,
`momentoDelCierre` da NULL, y esa sucursal rechaza todo lo que llegue, aunque sea de
antes. Es el lado seguro del error.

**No confiar en el reloj de quien manda el dato.** La fecha oficial de la orden es la de
la tablet, porque es la única que sabe cuándo entró la ropa estando sin internet. Pero
ese reloj puede estar mal, y en tablets baratas de mostrador pasa seguido. Una fecha en
el futuro es imposible y se detecta comparándola con un reloj en el que sí se confía: el
del servidor (`now()` de Postgres). El margen de 5 minutos tolera diferencias chicas. La
corrección de fondo no es del servidor: la tablet tiene que medir su desfase contra la
hora del servidor cada vez que tiene conexión y aplicarlo al registrar (anotado en
CLAUDE.md §13). Lo del servidor es una red de seguridad, no la solución.

**Ya explicado antes:**

- **INSERT … SELECT condicional** → SPEC-ALE186-005 (`specs/notas/SPEC-ALE186-005-pagos-api.md`)
- **Condición de carrera al leer y luego escribir** → SPEC-ALE186-004 (`specs/notas/SPEC-ALE186-004-ordenes-api.md`)
- **Reintento idempotente frente a choque de id** → SPEC-ALE186-009 (`specs/notas/SPEC-ALE186-009-usuarios-admin.md`)
- **Deducción del tipo de un parámetro en Postgres** → SPEC-ALE186-011 (`specs/notas/SPEC-ALE186-011-sucursales-admin.md`): por eso `$9` lleva el mismo cast en cada lugar donde aparece.
- **JSONB** → SPEC-ALE186-010 (el `->>'activa'` lee una clave de `valores_anteriores`).

## Decisiones y por qué

- **Sin `fecha_entrada`, una sucursal cerrada rechaza.** No hay forma de saber si fue
  antes del cierre, y una tablet actualizada siempre la manda.
- **Gana el último cierre.** Si se cerró, se reabrió y se volvió a cerrar, lo cargado en
  el medio (con la sucursal abierta) es válido.
- **La fecha futura vale para todos**, admin incluido, y para cualquier sucursal. Una
  fecha imposible es un error sin importar quién la mande.

## Los tests

- **Creado: `ahoraEnLaBase(ms)`** en `backend/tests/helpers/baseReal.ts:236`. Devuelve la
  hora de **Postgres** corrida unos milisegundos. Hace falta porque el cierre lo fecha
  Postgres, y en Windows Postgres corre en la VM de Docker, cuyo reloj puede no coincidir
  con el de Node. Un "un minuto antes del cierre" calculado con `Date.now()` podría quedar
  después. Cualquier test futuro que compare fechas del test con fechas que pone la base
  debería usarlo.
- **Reusados:** `escenario`, `crearUsuario`, `auditoriaDe`, `contar`, `cuerpoDeOrden`,
  `comoAdmin` y `conSesion`.
- El caso más fino es `backend/tests/db/ordenesSucursalCerrada.db.test.ts:74`: cerrar,
  reabrir y volver a cerrar, con una orden fechada entre el primer y el segundo cierre.
  Con el primer cierre se rechazaría; con el último, entra. Es lo que prueba que se usa
  `max`.
