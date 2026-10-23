---
id: SPEC-KRILINXI-051
spec: specs/SPEC-KRILINXI-051-personal-reactivar.md
explica: []
---

# SPEC-KRILINXI-051 — Personal: volver a dar de alta y tarjetas que marcan la excepción

## Qué se construyó

En `/personal`, una cuenta dada de baja ahora tiene el botón "Volver a dar de alta" (antes, una baja por error no tenía vuelta
desde la pantalla). Las tarjetas dejaron de marcar "Activa" en todas: solo la excepción, "Dada de baja", lleva insignia. Y usuario,
rol y sucursal pasaron de una línea con puntos a tres pares dato/valor.

## Cómo funciona, paso a paso

Caso: el admin vuelve a dar de alta a Beto Mamani (`beto`, dado de baja).

1. La tarjeta de Beto no tiene "Cambiar datos" ni "Dar de baja": `PantallaPersonal.tsx` pinta el bloque de `!c.activo` con el botón
   "Volver a dar de alta" (`icono="candado-abierto"`, el mismo que usa Sucursales para reabrir). Sin internet va `disabled`.
2. Al tocarlo, `setAlta(c)` abre un segundo `ModalConfirmacion` ("¿Volver a dar de alta a Beto Mamani?"), no peligroso.
3. Al confirmar, `darDeAlta` (en la pantalla) llama `cambiosDeCuenta.darDeAlta` (`hooks/useCuentas.ts`), que apunta a
   `darDeAlta` de `api/cuentasApi.ts`: `enviar(() => api.patch('/usuarios/:id', { activo: true }))`.
4. El resultado pasa por `resultadoDe` y `avisoDe`: "Guardado. Puede tardar unos segundos…", el mensaje del servidor si lo rechazó, o
   "No hay internet". **No se toca la base local**: la lista cambia cuando PowerSync baja la fila.

Nada del backend cambió: `PATCH /api/usuarios` ya aceptaba `activo: true`.

## Dónde encaja en la arquitectura

Es la misma regla de CLAUDE.md §6 que ya cumplían alta, edición y baja: lo que escribe el admin va directo a la API, nunca por la
cola. El test de arquitectura que vigila que `usuarios` no escriba en la base local sigue en verde. La pantalla no llama a axios:
pasa por `cambiosDeCuenta`, igual que las otras acciones.

## Decisiones y por qué

- **Sin insignia en las activas** (en vez de una insignia por estado): marcar lo normal en cada tarjeta es ruido. La baja se distingue
  por su texto, no por el color.
- **Confirmación no peligrosa**: reactivar no destruye nada, así que el modal no usa el estilo rojo.
- **Mismo botón que Sucursales** para volver a abrir, para que "deshacer una baja" se vea igual en las dos pantallas.

## Los tests

Se reusaron `abrir()`, `tarjeta()`, `sinRed()` y `sinJerga()` de `PantallaPersonal.test.tsx`; `abrir` ya aceptaba cuentas extra, así que
Beto se sembró sin helpers nuevos. Los tests de las specs 017 y 027 que describían la línea vieja y la insignia "Activa" se actualizaron.

Fuera del tema de la spec, por decisión del equipo: la etiqueta "Qué ropa deja" pasó a "Qué deja" en Registrar ropa
(`FormularioRopa.tsx`), en `pendientes/correccion.ts` y en los tests que la buscan.

## Si mañana tenés que tocar esto

Empezá por `PantallaPersonal.tsx`. Cuidado: la etiqueta de un campo vive en el formulario **y** en `correccion.ts`; si cambia una,
cambia la otra, o `/para-corregir` queda con otro texto.
