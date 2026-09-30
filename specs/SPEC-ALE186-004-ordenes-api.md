---
id: SPEC-ALE186-004
name: Registro y avance de órdenes
slug: ordenes-api
status: in-progress
owner: ale186
created: 2026-09-30
scope:
  - backend/src/models/ordenes.model.ts
  - backend/src/controllers/ordenes.controller.ts
  - backend/src/routes/ordenes.routes.ts
  - backend/src/routes/index.ts
  - backend/src/utils/validacion.ts
  - backend/src/utils/ApiError.ts
  - backend/tests/**
priority: high
depends_on:
  - SPEC-ALE186-003
tests: []
---

## Descripción

Recibe las órdenes que sube la app desde la cola de PowerSync (CLAUDE.md sección 6), copiando el patrón de escritura que fijó SPEC-ALE186-003: el id lo genera el dispositivo y un reintento de la misma subida no duplica ni falla.

Es también el contrato que necesita `cola-subida` (frontend) para implementar `uploadData`: con esta spec aprobada, esa spec puede arrancar contra un doble sin esperar al código.

Quien recibe sale siempre de la sesión. La sucursal también, para un EMPLEADO: su dispositivo no puede escribir en otra. El ADMIN también atiende el mostrador a veces, y como no tiene sucursal (`sucursal_id` NULL), en su caso la sucursal viene en el cuerpo y el backend comprueba que exista y esté activa. `fecha_entrada` se acepta del dispositivo, porque una orden registrada sin internet puede subir horas o días después y la fecha real es la del mostrador, no la de la subida.

Quedan FUERA a propósito: las lecturas (las órdenes de la sucursal bajan por el bucket `sucursal` y se leen de SQLite local), el borrado (una orden se ANULA, no se borra), el paso a ENTREGADO (lo hace la spec de entregas al registrar el retiro), y la auditoría (spec `auditoria-backend`).

## Criterios de aceptación

- [ ] El sistema crea la orden en estado RECIBIDO y responde 201 con sus datos cuando recibe POST /api/ordenes de un EMPLEADO o un ADMIN con un `id` UUID, `numero_boleta`, `cliente_id`, `descripcion` y `precio_total`, y opcionalmente `fecha_estimada_salida` y `fecha_entrada`.
- [ ] El sistema guarda la orden con el `id` que mandó el dispositivo, y responde 400 VALIDACION cuando el `id` falta o no es un UUID.
- [ ] El sistema responde 2xx con la orden ya existente, sin crear una segunda fila ni modificar la guardada, cuando recibe un POST con un `id` que ya existe (el reintento de una subida).
- [ ] El sistema toma `usuario_recepcion_id` de la sesión y nunca del cuerpo, e ignora un `estado` que venga en el POST.
- [ ] El sistema toma `sucursal_id` de la sesión cuando quien registra es un EMPLEADO, ignorando el que venga en el cuerpo.
- [ ] El sistema responde 409 BOLETA_DUPLICADA cuando el `numero_boleta` ya está usado en la misma sucursal, con un mensaje que dice qué hacer, y acepta el mismo número en otra sucursal.
- [ ] El sistema responde 400 VALIDACION cuando `cliente_id` no corresponde a un cliente existente, o cuando `numero_boleta` o `descripcion` faltan o quedan vacíos después de quitar los espacios.
- [ ] El sistema valida `precio_total` con el helper de dinero (centavos enteros, nunca float) y responde 400 VALIDACION cuando falta, no es un monto válido o es negativo.
- [ ] El sistema usa la `fecha_entrada` que manda el dispositivo cuando viene, y la hora del servidor cuando no viene; responde 400 VALIDACION si viene y no es una fecha válida.
- [ ] El sistema toma `sucursal_id` del cuerpo cuando quien registra es un ADMIN, y responde 400 VALIDACION cuando falta, no es un UUID o no corresponde a una sucursal existente y activa.
- [ ] El sistema actualiza `descripcion`, `precio_total`, `fecha_estimada_salida`, `numero_boleta` o `estado` y responde 200 con la orden cuando recibe PATCH /api/ordenes/:id, y no aplica ningún otro campo del cuerpo.
- [ ] El sistema acepta en PATCH un cambio de estado solo hacia adelante en RECIBIDO → EN_PROCESO → LISTO (puede saltar pasos) o a ANULADO desde cualquier estado que no sea ENTREGADO, y responde 409 TRANSICION_INVALIDA en cualquier otro caso, incluido pedir ENTREGADO o tocar una orden ANULADA o ENTREGADA.
- [ ] El sistema responde 409 BOLETA_DUPLICADA cuando un PATCH pone un `numero_boleta` que ya usa otra orden de la misma sucursal.
- [ ] El sistema responde 404 NO_ENCONTRADO cuando el PATCH apunta a una orden que no existe o, si quien la edita es un EMPLEADO, que es de otra sucursal que la suya; un ADMIN puede editar órdenes de cualquier sucursal.
- [ ] El sistema responde 401 NO_AUTENTICADO en los dos endpoints cuando la petición no trae un token válido.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-ALE186-004', () => { ... })

Así un `grep SPEC-ALE186-004` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
