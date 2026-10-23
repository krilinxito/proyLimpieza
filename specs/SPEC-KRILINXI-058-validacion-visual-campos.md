---
id: SPEC-KRILINXI-058
name: Indicador visual de campo correcto en Registrar ropa
slug: validacion-visual-campos
status: finished
owner: krilinxito
created: 2026-10-23
scope:
  - frontend/src/components/CampoTexto.tsx
  - frontend/src/components/Tarjeta.tsx
  - frontend/src/components/README.md
  - frontend/src/features/clientes/**
  - frontend/src/features/ordenes/**
  - frontend/src/features/historial/**
  - frontend/src/features/pendientes/**
priority: medium
depends_on:
  - SPEC-KRILINXI-057
tests:
  - backend\tests\http\clientes.test.ts
  - backend\tests\http\ordenes.test.ts
  - backend\tests\unit\formatos.test.ts
  - frontend\src\components\CampoTexto.test.tsx
  - frontend\src\components\piezas.test.tsx
  - frontend\src\features\clientes\api\clientesLocal.test.ts
  - frontend\src\features\mostrador\components\PantallaMostrador.test.tsx
  - frontend\src\features\mostrador\components\RegistrarEnMostrador.test.tsx
  - frontend\src\features\ordenes\api\ordenesLocal.test.ts
  - frontend\src\features\pendientes\components\PantallaParaCorregir.test.tsx
  - frontend\src\lib\formatos.test.ts
  - frontend\src\test\tema.test.ts
---

## Descripción

Al llenar los datos del cliente y de la boleta la persona no sabe si lo que escribió está bien hasta que intenta guardar. Se agrega un indicador visual de campo correcto (un ícono de visto con texto, nunca solo color) que aparece cuando el valor cumple su regla: por ejemplo el largo del carnet, el teléfono con su formato y el número de boleta. Las reglas son las que ya existen (validarCliente y la validación de la orden); esta spec no inventa reglas nuevas, solo las muestra mientras se escribe. Lo mismo, pero **a nivel de cada tarjeta**: una marca chica en la esquina de arriba a la derecha de la tarjeta («Cliente», «Cliente nuevo», «La ropa», «Adelanto») que dice de un vistazo si esa parte ya está bien llena: un visto cuando todos sus datos son correctos, y una equis cuando alguno ya mostró un error. Mientras la tarjeta se está llenando (o está vacía) no muestra nada, para no regañar antes de tiempo. Además, «Qué deja» pasa a admitir **varias líneas** (un área de texto que crece), porque una boleta suele listar varias prendas; el salto de línea se respeta donde esa descripción se muestra (boleta, historial, resumen, Para corregir). Un campo vacío o que todavía no es válido no muestra error hasta que se sale del campo o se intenta guardar.

## Criterios de aceptación

- [ ] CampoTexto acepta un estado "correcto" y lo muestra con un ícono de visto y un texto accesible ("Correcto"), sin depender del color.
- [ ] El carnet, el teléfono, el nombre y el número de boleta muestran el indicador solo cuando cumplen la regla que ya aplica su validación, y lo quitan si dejan de cumplirla.
- [ ] El indicador usa colores del tema (éxito) en claro y oscuro, con su par de contraste medido en tema.test.ts si se agrega un color.
- [ ] No aparece ningún mensaje de error antes de que la persona salga del campo o intente guardar.
- [ ] Las reglas de validación no se duplican: el indicador y el guardado llaman a la misma función.
- [ ] El visto de un campo significa que su contenido es correcto de verdad, no solo que no está vacío: un número de boleta de solo letras, un teléfono con letras o de largo equivocado y un carnet que no es un carnet no tienen visto y muestran su error. Las reglas son: boleta con letras, números y guion y al menos un número; teléfono solo números (con espacios o guiones al escribir), 7 u 8; carnet (opcional) el número con su extensión si la tiene, por ejemplo 1234567 LP; el carnet no pasa de 30 caracteres ni el nombre de 150.
- [ ] Esas reglas valen en el formulario y en el servidor (que responde 400 con un mensaje que dice qué hacer), y las dos copias se prueban contra la misma tabla de casos (`context/formatos.casos.json`). Un cliente de antes con un teléfono de otro formato puede cambiar su nombre sin tocar el teléfono.
- [ ] Cada tarjeta del formulario de Registrar ropa («Cliente», «Cliente nuevo», «La ropa» y «Adelanto», en su caso) tiene una marca chica en la esquina de arriba a la derecha: un visto cuando todos los datos que pide están completos y correctos, y una equis cuando alguno ya mostró un error; vacía o a medio llenar, no muestra nada.
- [ ] La marca de la tarjeta se anuncia en palabras para el lector de pantalla («Completo» / «Hay datos para corregir») y se distingue por su forma (visto o equis), no solo por el color; usa los colores del tema (éxito y peligro) en claro y oscuro, con su par de contraste medido en `tema.test.ts`.
- [ ] La marca de la tarjeta sale de las mismas funciones de validación que usa el guardado, no de una regla propia: lo que la marca da por bueno es lo que el guardado acepta.
- [ ] «Qué deja» admite varias líneas: es un área de texto que crece con lo escrito (con un alto mínimo de dos renglones y sin cortar el texto), Enter pone un salto de línea y no envía el formulario, y se guarda tal cual (con sus saltos) en la descripción de la boleta.
- [ ] El salto de línea de la descripción se respeta donde se muestra: el detalle de la boleta, la tarjeta de la boleta, el historial (incluido el de solo lectura), el resumen al registrar y Para corregir; y el buscador y el backend la aceptan sin recortar los saltos del medio (el espacio de los bordes sí se recorta, como hasta ahora).
- [ ] Tests con el id de esta spec en el describe, sin jerga en pantalla, y suite completa en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-058', () => { ... })

Así un `grep SPEC-KRILINXI-058` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
