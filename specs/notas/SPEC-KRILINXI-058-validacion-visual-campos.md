---
id: SPEC-KRILINXI-058
spec: specs/SPEC-KRILINXI-058-validacion-visual-campos.md
explica:
  - reglas duplicadas en dos lados probadas con una tabla común
  - validar una sola vez para el visto y para el guardado
---

# SPEC-KRILINXI-058 — Indicador visual de campo correcto en Registrar ropa

## Qué se construyó

Registrar ropa avisa mientras se llena: cada campo bien escrito muestra un visto, y cada tarjeta («Cliente», «Cliente nuevo», «La ropa», «Adelanto») lleva en la esquina un visto cuando todo lo suyo está bien o una equis cuando algún
dato ya mostró un error. «Qué deja» admite varias líneas. Y, porque un visto no vale nada si acepta cualquier cosa, el número de boleta, el teléfono y el carnet ahora se validan de verdad, en el formulario y en el servidor.

## Cómo funciona, paso a paso

Caso: se escribe `abc` en «Número de la boleta» y se sale del campo.

1. `CampoTexto.onChange` entrega el texto; `FormularioRopa.tsx` lo guarda en `datos`.
2. `useRevisionEnVivo` (`ordenes/hooks/useRevisionEnVivo.ts`) resume los datos en un texto y, pasados 150 ms sin teclas, llama a `revisar`. Si se siguió escribiendo antes de que llegue la respuesta, la descarta (`vigente`), como el buscador.
3. `revisar` es `revisarRopa` (`ordenes/api/ordenesLocal.ts`): lo mismo que hace `registrarRopa` antes de escribir —`validarRopa` y `prepararCliente`, que a su vez llama a `validarCliente`—, pero sin escribir. Esa es la garantía de que el visto y el guardado dicen lo mismo:
   hay **una sola función** que mira, `revisar`, y dos que la usan (`revisarRopa` y `registrarRopa`).
4. `validarRopa` llama a `esNumeroDeBoleta` (`lib/formatos.ts`): `abc` no tiene ningún número, así que devuelve `MENSAJES.boletaInvalida`.
5. De vuelta en el formulario, `errorDe('numeroBoleta')` decide si ese error se **muestra**: solo si el campo ya se tocó (`onBlur`) o ya se intentó guardar. Mientras se escribe, nada; al salir, aparece el mensaje y la tarjeta «La ropa» pasa a equis.
6. Al arreglarlo (`001003`) la revisión nueva ya no trae el error: desaparece solo, sin volver a guardar. Cuando boleta, qué deja y precio están bien, `estadoDe` devuelve `'completo'` y `Tarjeta` pinta el visto.

El servidor repite la regla: `leerBoleta`, `leerTelefono` y `leerCarnet` (`controllers/ordenes.controller.ts` y `clientes.controller.ts`) llaman a las funciones de `backend/src/utils/formatos.ts` y responden 400 con el mismo texto.

## Dónde encaja en la arquitectura

CLAUDE.md §6 dice que lo que valida el cliente es cortesía y lo que valida el servidor es la garantía: por eso las reglas existen en los dos lados. Como los dos workspaces no comparten código, cada uno tiene su copia (`lib/formatos.ts` y `utils/formatos.ts`) y las dos se prueban contra la
misma tabla de casos, `context/formatos.casos.json` (mismo patrón que `normalizarTelefono` y su test). El visto, en cambio, **no** duplica ninguna regla: viene de la misma validación que el guardado.

## Decisiones y por qué

- **Un error se muestra al salir del campo o al intentar guardar, no mientras se escribe.** Regañar a quien todavía está escribiendo («solo números» al teclear la primera letra) es hostil, sobre todo para personas mayores.
- **La tarjeta vacía o a medio llenar no marca nada** (ni visto ni equis). La equis es para cuando un dato ya mostró un error. El adelanto con «No deja adelanto» (el valor por omisión) tampoco marca: no hay nada que completar.
- **Las reglas se decidieron con la persona:** boleta con letras, números y guion y al menos un número (hay series como `B-1003`); teléfono solo números, 7 u 8; carnet con extensión opcional. Una regla más estricta que la del negocio rechazaría boletas reales; una más floja dejaría pasar `abc`.
- **El teléfono se sigue guardando solo con números** (`normalizarTelefono`), pero se exige que lo escrito sea de números, con espacios o guiones: `7012-3456` vale, `70a1234` no. Un prefijo de país (`+591`) no vale: ya no sería de 7 u 8 números.
- **Un cliente de antes con otro formato de teléfono puede cambiar su nombre** sin que le exijan el formato nuevo (`telefonoActual` en `validarCliente`). Solo si cambia el teléfono, el nuevo tiene que cumplir.
- **«Qué deja» crece con el texto desde el código** (`style.height` sobre el elemento), no con `style={…}` en el marcado: en la app compilada la política de seguridad bloquea lo segundo y no lo primero (CLAUDE.md §4).
- **Los saltos de línea de la descripción se respetan** con `whitespace-pre-line` donde se muestra (boleta, tarjeta, resumen, historial de solo lectura); en Para corregir se edita en el mismo área de texto (`tipo: 'texto-largo'`).

## Los tests

Se reusaron `abrir`, `elegirARosa`, `elegirEnBuscador`, `cargarRopa` y `guardar` de `RegistrarEnMostrador.test.tsx`. Lo nuevo vive en un `describe` aparte con la etiqueta de esta spec: comprueba el visto con `toHaveAccessibleDescription('Correcto')` (es lo que lee el lector de pantalla), que el error no aparece
antes de salir del campo, y la marca de cada tarjeta. La tabla `context/formatos.casos.json` la leen los tests de formatos de los dos lados: para cambiar una regla se cambia la tabla y las dos copias.

## Si mañana tenés que tocar esto

Un campo nuevo del formulario va en `Campo`, en `errorDe` y, si cuenta para una tarjeta, en su `bien…`. Si una regla de contenido cambia: la tabla, `lib/formatos.ts`, `utils/formatos.ts` y el mensaje en los dos lados. Cuidado con una cosa que queda fuera: el carnet de **quien retira** al entregar
(`entregasLocal.ts`) todavía no usa la regla del carnet; sería otra spec. Lo mismo el teléfono de las cuentas del personal y de las sucursales.
