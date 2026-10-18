---
id: SPEC-KRILINXI-027
spec: specs/SPEC-KRILINXI-027-estilo-gestion.md
explica:
  - una regla que cubre todo por defecto (y no una lista de inclusion)
---

# SPEC-KRILINXI-027 — Personal, sucursales, auditoría y para corregir con el tema

## Qué se construyó

Las últimas cuatro pantallas pasaron al tema: Personal, Sucursales, ¿Quién hizo qué? y Registros para
corregir. Cada cuenta, sucursal, registro y rechazo se muestra en su tarjeta, con el estado en una
insignia y los errores en un aviso. Con esto la ola estética queda cerrada: desde ahora un test
impide usar la paleta cruda de Tailwind en cualquier parte de la app.

## Cómo funciona, paso a paso

Sigamos una sucursal cerrada, «Sur» (`activa: 0` en la base local):

1. `PantallaSucursales.tsx:83` la pone en una `Tarjeta` con su nombre de título. Como la `Tarjeta`
   con título es una región con nombre, el lector de pantalla la anuncia como «Sur, región», y los
   tests la encuentran con `getByRole('region', { name: 'Sur' })`.
2. Qué palabra y qué tono lleva el estado lo decide la feature. `estadoDe` (`:23`) busca en
   `ESTADO_SUCURSAL` (`:18`): «Cerrada», en advertencia, porque cerrar una sucursal es algo
   excepcional (CLAUDE.md §2). La `Insignia` (`:84`) solo recibe la palabra y el tono, y no sabe de
   sucursales.
3. Los botones siguen igual: deshabilitados sin internet, porque lo que escribe el admin va directo a
   la API (SPEC-KRILINXI-017).

Lo mismo con un registro rechazado en `/para-corregir`: va en su tarjeta, y el motivo («Ese número de
boleta ya está usado…») va en un `Aviso` de error (`PantallaParaCorregir.tsx:122`).

Y la regla que lo vigila todo: `CON_EL_TEMA` (`test/arquitectura.test.ts:195`) ya no es una lista de
carpetas que se fue alargando, sino las tres raíces de la app. `archivosFuente` lee cada `.ts` y
`.tsx` que no sea un test (`test/arquitectura.ts:32`), y el test busca en cada uno la paleta cruda,
salteando los comentarios (`:232`).

## Dónde encaja en la arquitectura

- **`components/` pinta y la feature decide.** `Insignia` tiene cinco tonos y no sabe qué es una
  cuenta. Que «Dada de baja» vaya en neutro y no en peligro es una decisión del negocio (una cuenta
  vieja no es un error), así que vive en `PantallaPersonal.tsx`, igual que `TONO_ESTADO` vive en
  `features/ordenes/estado.ts` (SPEC-KRILINXI-025). Si el tono estuviera dentro de `Insignia`,
  `components/` tendría que conocer cada estado de cada feature.
- **El aviso de conexión se parece a un `Aviso`, pero no lo es.** Está en todas las pantallas y cambia
  solo cuando se corta o vuelve internet. Un `Aviso` de advertencia es `role="alert"`, que interrumpe
  al lector de pantalla cada vez que aparece. El aviso de conexión toma la misma forma (ícono al
  costado, mismos tonos) y sigue siendo `role="status"`.

## Fundamentos

### Una regla que cubre todo, y no una lista que hay que acordarse de alargar

Mientras duró la ola, `CON_EL_TEMA` era una lista de inclusión: cada spec agregaba sus carpetas, y lo
que no estaba en la lista no se vigilaba. Servía para avanzar de a poco sin que el test fallara por
pantallas que todavía no se habían tocado. Pero tenía un agujero: una feature nueva quedaba fuera de
la regla hasta que alguien se acordara de anotarla, y nadie se acuerda.

Ahora la lista es `['components', 'pages', 'features']` (`test/arquitectura.test.ts:195`): todo
entra por defecto. Una pantalla nueva queda vigilada desde su primer archivo, sin que nadie tenga que
hacer nada. Es la misma idea con la que SPEC-KRILINXI-003 vigila «todas las features, también las
que todavía no existen». Una regla que depende de que alguien la amplíe es una regla que se va a
olvidar.

**Ya explicado antes:**

- **Tokens de diseño** y **regiones vivas (role status y alert)** → SPEC-KRILINXI-022 (`specs/notas/SPEC-KRILINXI-022-tema-visual.md`)
- **Test de arquitectura** → SPEC-KRILINXI-002 (`specs/notas/SPEC-KRILINXI-002-ui-mostrador.md`)
- **Enlace o botón (según lo que hace)** → SPEC-KRILINXI-024 (`specs/notas/SPEC-KRILINXI-024-inicio-ingreso.md`)
- **La contraprueba (que el detector detecte)** → SPEC-KRILINXI-020 (`specs/notas/SPEC-KRILINXI-020-csp-frontend.md`)

## Decisiones y por qué

- **«Centro — Abierta» pasó a ser «Centro» de título y «Abierta» en la insignia.** Las palabras que se
  ven son las mismas, pero ya no hay un solo texto con las dos. El test de sucursales buscaba ese texto
  exacto, así que ahora busca la región por nombre. Es el único test viejo que cambió.
- **«Dada de baja» en neutro y «Cerrada» en advertencia.** Una cuenta dada de baja es historia: no hay
  nada que hacer con ella. Una sucursal cerrada es excepcional y no recibe ropa, y el admin tiene que
  notarlo.
- **«Hay que revisar» se suma a la explicación, no la reemplaza.** La insignia sirve para encontrar el
  registro al recorrer la lista; la frase de abajo («lo hizo una cuenta que ya estaba dada de baja»)
  dice por qué.
- **El motivo de cada rechazo es un `Aviso` de error, o sea un `alert`.** La spec lo pide así, y
  CLAUDE.md §6 dice que ningún error de guardado puede quedar en silencio. El costo: con varios
  rechazos, el lector de pantalla los anuncia todos al abrir la pantalla. En el formulario de
  corrección, en cambio, el «Por qué no se guardó» quedó como texto en el tono de peligro, para no
  anunciar una segunda vez lo que ya se anunció en la lista.
- **«Volver al inicio» e «Ir a Ropa en el local» son `EnlaceBoton`**, como en el resto de la app desde
  SPEC-KRILINXI-024: llevan a otra pantalla, así que son enlaces, aunque se vean como botones.

## Los tests

- **Reusé** los helpers de cada pantalla: `abrir()` de personal y sucursales, `registroDePrueba` y
  `paginaDePrueba` de la auditoría, `abrirConUnaBoletaRechazada` de para corregir, y `mostrar` del
  aviso de conexión. A `abrir()` de personal le agregué un parámetro opcional `otras`, para sembrar
  una cuenta dada de baja sin escribir otro helper casi igual.
- **Hice la contraprueba.** Los tests nuevos pasaron a la primera, y un test que nunca falló puede no
  estar mirando nada. Puse a propósito la sucursal cerrada en verde, y el test de las insignias falló.
  Puse un `text-slate-700` en para corregir, y la regla de la paleta falló nombrando el archivo.
  Después dejé los dos como estaban.
- **Se miró dibujado.** Con la API simulada en un Chromium aislado se vio «¿Quién hizo qué?»: la
  insignia arriba del registro marcado y la explicación abajo. Las otras tres pantallas leen la base
  local, que en ese navegador queda vacía, así que no se pudieron ver así.

## Si mañana tenés que tocar esto

- Para cambiar el tono de un estado, tocá la constante de su pantalla (`ESTADO_CUENTA`,
  `ESTADO_SUCURSAL`), no `Insignia`.
- Un color nuevo va al tema (`index.css`). Si escribís `bg-red-50` en cualquier archivo de la app,
  el test de arquitectura falla y dice dónde.
