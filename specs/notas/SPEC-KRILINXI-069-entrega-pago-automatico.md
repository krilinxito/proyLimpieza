---
id: SPEC-KRILINXI-069
spec: specs\SPEC-KRILINXI-069-entrega-pago-automatico.md
explica:
  - valor sugerido hasta que la persona lo toca (null = sin tocar)
---

# SPEC-KRILINXI-069 — Al entregar, el pago arranca con lo que falta

## Qué se construyó

Al entregar una boleta con saldo, el campo "Cuánto paga ahora" ya aparece escrito con lo que falta (Bs 30 → `30.00`). Si el
empleado agrega un cargo, el monto sube solo; si escribe su propio monto, se respeta. "¿Cómo paga?" sigue sin preselección. Nada
del servidor ni de la regla de SPEC-KRILINXI-056 cambió: sigue sin entregarse con deuda.

## Cómo funciona, paso a paso

Caso: boleta de Bs 50 con Bs 20 de adelanto, el empleado abre "Entregar la ropa".

1. `FormularioEntrega` calcula el saldo con los cargos escritos (`saldoConPrecio`, `FormularioEntrega.tsx`): `calcularSaldo` de
   `features/pagos/saldo.ts` en centavos enteros → `3000`.
2. `const pagoFinal = pagoEscrito ?? pagoSugerido(saldo)` (`FormularioEntrega.tsx:103`). `pagoEscrito` es `null` mientras nadie
   toca el campo, así que vale `aDecimal(3000)` = `"30.00"` (`lib/money.ts:53`, el mismo formato que se guarda en la base local).
3. El campo muestra `pagoFinal`. Como no está vacío, aparece también "¿Cómo paga?" (`ElegirMetodo`), sin nada marcado.
4. Si agrega un cargo de Bs 15, `saldo` pasa a `4500` y el campo se vuelve `45.00` en el mismo render: no hay `useEffect` ni
   copia que sincronizar.
5. Si escribe `10`, `setPagoEscrito('10')`: desde ahí `pagoEscrito` ya no es `null` y el cargo siguiente no lo pisa. Si lo borra,
   `pagoEscrito` es `''` (no `null`), y queda vacío: "Entregar" sigue apagado (`faltaCobrar`) porque `pagoAhora` es 0.
6. Al revisar o guardar, `datosAEnviar` manda `{ ...datos, pagoFinal }`: lo que se ve es lo que se valida y se escribe
   (`entregasLocal.ts`, sin cambios).

## Dónde encaja en la arquitectura

Es solo presentación dentro de `features/entregas/components`. El cálculo del saldo sigue en un único lugar
(`features/pagos/saldo.ts`, CLAUDE.md §6) y el dinero en centavos con `lib/money`: el componente no suma floats ni conoce la regla
del servidor. Quien **decide** si el pago alcanza sigue siendo `entregasLocal` (y, al subir, el servidor, SPEC-KRILINXI-056):
rellenar el campo es cortesía, no garantía.

## Fundamentos

**Un valor "sugerido" hasta que la persona lo toca (`null` = sin tocar).** Se guarda en el estado solo lo que la persona escribió,
con `null` para "no escribió nada"; lo que se muestra es `escrito ?? sugerido`. Sin esto habría dos malas opciones: copiar el
saldo al estado con un `useEffect` cada vez que cambia (se pisa lo que escribió la persona, o se necesita un candado aparte), o
inicializarlo una sola vez (no sigue a los cargos). Aquí `null` y `''` son distintos a propósito: `''` es "la persona borró el
monto" y se respeta. Es la misma idea que el **estado derivado** de SPEC-KRILINXI-008
(`specs/notas/SPEC-KRILINXI-008-ordenes-sucursal.md`) y el **componente controlado** de SPEC-KRILINXI-002: no se explican de nuevo.

## Decisiones y por qué

- **No se guarda el sugerido en `datos.pagoFinal`.** Ese campo del estado quedó sin uso en el formulario (se sobrescribe al enviar);
  se dejó para no tocar `DatosEntrega`, que comparten la validación y la corrección de registros.
- **"Entregar" no exige la forma de pago para habilitarse.** La spec dice que se habilita "en cuanto el monto cubre y se elige la
  forma"; se mantuvo el comportamiento de SPEC-KRILINXI-056 (habilitado al cubrir el monto, y si falta la forma de pago, al tocarlo se avisa en palabras),
  porque un botón apagado sin explicación confunde más al público de la app.

## Los tests

Se reutilizó todo lo de `EntregarEnMostrador.test.tsx` (`abrir`, `abrirEntrega`, `escribir`, `agregarCargo`). Cinco tests viejos
esperaban el campo vacío y se ajustaron: ahora lo normal es que arranque lleno. Los nuevos están en el bloque
"… SPEC-KRILINXI-069" al final del archivo.

## Si mañana tenés que tocar esto

Empieza por `FormularioEntrega.tsx:103`. Cuidado con `reembolso-entrega` (SPEC-KRILINXI-070), que toca el mismo formulario: si ahí se
quita deuda, el sugerido debe seguir saliendo de `saldo`, no de un valor propio.
