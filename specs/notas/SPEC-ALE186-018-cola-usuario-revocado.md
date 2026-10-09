---
id: SPEC-ALE186-018
spec: specs/SPEC-ALE186-018-cola-usuario-revocado.md
explica:
  - minimo privilegio
  - ventana de gracia para un token vencido
---

# SPEC-ALE186-018 — Lo que sube la tablet de una cuenta dada de baja

## Qué se construyó

Rosa trabajó el sábado sin internet y dejó 3 órdenes en la tablet. El lunes la dieron de
baja. El martes vuelve internet. Antes, esas órdenes o entraban en silencio (si su token
seguía vigente) o terminaban a nombre de la próxima persona que entrara en la tablet. Ahora
entran **a nombre de Rosa**, aunque su token haya vencido hace hasta 3 días, y quedan
**marcadas** para que el admin las revise. Con el token vencido, Rosa no puede hacer nada
más: ni renovar su sesión, ni leer datos, ni nada del admin.

## Cómo funciona, paso a paso

La tablet de Rosa sube `POST /api/ordenes` con un token vencido hace un día.

1. **La ruta usa la sesión de la cola.** `ordenes.routes.ts` (y las de clientes, pagos y
   entregas) ya no usan `requireAuth`: usan `requireAuthDeLaCola`
   (`backend/src/middleware/auth.ts:87`).
2. **El token se verifica con ventana.** `verificarTokenDeLaCola`
   (`backend/src/utils/jwt.ts:110`) llama a la misma verificación de siempre, pero con
   `clockTolerance: VENTANA_COLA_SEGUNDOS` (`:101`, `:125`): `jsonwebtoken` acepta un token
   vencido hace hasta 3 días. La firma y la audiencia se exigen igual.
3. **Se mira en la base si la cuenta sigue activa.** Rosa está dada de baja, así que el
   middleware deja `req.revision = 'cuenta_dada_de_baja'` (`auth.ts:103`).
4. **El controller pasa la marca al model** (`ordenes.crear(datos, revisionDe(req))`), y el
   model se la pasa a `conAuditoria`.
5. **La marca se escribe con la escritura.** `conAuditoria`
   (`backend/src/models/auditoria.model.ts:80`) arma la fila de auditoría con
   `valores_anteriores || {"revision": "cuenta_dada_de_baja"}`, en la misma sentencia que el
   INSERT de la orden (SPEC-ALE186-010). Si no hay marca, el SQL es idéntico al de antes.
6. **El admin la encuentra.** La consulta de la auditoría separa la marca
   (`auditoria.model.ts:328`): sale como `revision`, se quita de `valoresAnteriores`
   (`:329`), y `?revisar=true` trae solo lo marcado.

## Dónde encaja en la arquitectura

- **Dos middlewares de sesión, a propósito.** `requireAuth` sigue sin tocar la base y sin
  ventana: corre en todas las demás rutas. `requireAuthDeLaCola` hace las dos cosas, y solo
  está en los cuatro routers del mostrador, que únicamente tienen rutas de escritura. Si
  alguien agrega un `GET` a uno de esos routers, va a heredar la ventana: hay que ponerle
  `requireAuth` a esa ruta.
- **La marca es un argumento, no un estado escondido.** Cada escritura recibe `revision`
  como último parámetro, opcional y `null` por defecto. Se podría haber pasado "por atrás"
  (con `AsyncLocalStorage`, un contexto implícito por petición), pero así se ve en la firma
  de cada función quién puede marcar y quién no, y los tests lo controlan sin trucos.
- **El contrato de la auditoría ya es el definitivo.** `revision` sale aparte aunque hoy se
  guarde dentro de `valores_anteriores`. Cuando haya migraciones y pase a una columna,
  cambia el SQL de la consulta, no la respuesta (CLAUDE.md §13).

## Fundamentos

**Una ventana de gracia para un token vencido.** Un JWT trae su vencimiento adentro
(`exp`), y quien lo verifica lo compara con su reloj. `clockTolerance` le dice a
`jsonwebtoken` cuántos segundos de más tolerar. Se inventó para diferencias chicas de reloj
entre servidores, pero sirve igual para "acepto vencido hace hasta N segundos". Acá N son
3 días, y esa es una decisión de negocio, no técnica: es el tiempo que una tablet puede
estar sin internet y todavía subir su trabajo con su propia identidad. La ventana no relaja
nada más: un token con la firma alterada o emitido para otra audiencia (el de PowerSync)
sigue sin entrar, porque eso no es "vencido", es "inválido".

**Mínimo privilegio: una credencial débil solo sirve para lo mínimo.** Un token vencido es
una credencial más débil que uno vigente: si alguien lo robó, ya tuvo días para usarlo. La
regla es darle el permiso más chico que resuelva el problema. El problema es "subir la cola
que quedó guardada", así que la ventana abre exactamente las seis rutas de escritura del
mostrador, y nada que lea datos, renueve la sesión o administre. Por eso los tests de HTTP
prueban, ruta por ruta, que un token vencido de admin no entra a `/renovar`, `/auditoria`,
`/estadisticas`, `/usuarios` ni `/sucursales`: esas pruebas son la frontera escrita.

**Ya explicado antes:**

- **JSON Web Token (JWT)** → SPEC-ALE186-002 (`specs/notas/SPEC-ALE186-002-auth-backend.md`)
- **Audiencia de un token (aud)** → SPEC-ALE186-002
- **Middleware** → SPEC-ALE186-001
- **JSONB** → SPEC-ALE186-010 (`specs/notas/SPEC-ALE186-010-auditoria-registro.md`): el `||` que suma la marca y el `-` que la quita.
- **Cambio aditivo en una API con clientes desplegados** → SPEC-ALE186-015: por qué `revision` es un campo nuevo y el parámetro, opcional.

## Decisiones y por qué

- **Una cuenta activa con el token vencido sube sin marca.** Es trabajo normal hecho sin
  internet; marcarlo llenaría la revisión del admin de falsas alarmas.
- **Un admin con el token vencido puede subir por la cola, como cualquiera.** El admin a
  veces atiende el mostrador (SPEC-ALE186-004), así que las rutas no miran el rol.
- **La consulta extra a la base va solo en la cola.** Saber si la cuenta está dada de baja
  cuesta una consulta por escritura. En `requireAuth`, que corre en todas las peticiones,
  no valía la pena; acá sí.

## Los tests

- **Creado: `conTokenVencidoHace(segundos, sesion)`** en `backend/tests/helpers/usuarios.ts`.
  Firma un token con el secreto y la audiencia de verdad, pero con el vencimiento en el
  pasado. Sin él habría que esperar días o reescribir la verificación. Como cuenta desde
  `Date.now()`, el reloj falso de Vitest lo mueve: el test unitario fija la hora y prueba
  el borde al segundo (`3 días − 1 s` entra, `3 días + 1 s` no).
- **Los tests HTTP del mostrador ahora necesitan un doble de la cuenta.** Como el middleware
  consulta `usuarios.activo`, `clientes`, `ordenes`, `pagos` y `entregas.test.ts` mockean
  `buscarPorId` con una cuenta activa. Cualquier test HTTP nuevo de esas rutas necesita lo
  mismo. Los asserts que miraban los argumentos exactos del model ahora terminan en `null`
  (sin marca).
- `backend/tests/db/colaRevocada.db.test.ts:49` es el caso completo contra la base real:
  la cuenta dada de baja de verdad, un token vencido de verdad, y la marca leída de vuelta
  por la API de la auditoría.
