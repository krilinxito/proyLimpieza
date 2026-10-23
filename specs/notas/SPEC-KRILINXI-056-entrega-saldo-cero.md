---
id: SPEC-KRILINXI-056
spec: specs/SPEC-KRILINXI-056-entrega-saldo-cero.md
explica: []
---

# SPEC-KRILINXI-056 — Entregar solo con la boleta pagada por completo

## Qué se construyó

La ropa ya no se entrega con deuda. El formulario de entrega apaga el botón «Entregar» hasta que lo que se paga ahora cubre lo que falta, y el servidor
rechaza (409 `SALDO_PENDIENTE`) cualquier entrega cuya boleta no esté pagada por completo. Desapareció del resumen la fila «Queda debiendo».

## Cómo funciona, paso a paso

La dificultad no es la regla, es el **orden**. El pago final y la entrega son dos pedidos distintos (`POST /api/pagos` y `POST /api/entregas`), y el servidor
decide al recibir la entrega. Caso: boleta de Bs 50 con Bs 20 de adelanto; la persona entrega y cobra los 30 que faltan.

1. **Frontend, validar.** `prepararEntrega` (`entregasLocal.ts`) suma los pagos de la orden más el que se escribió; si queda algo sin cubrir, devuelve
   `invalida` con `faltaCobrar(…)` en el campo del pago. `FormularioEntrega.tsx` calcula lo mismo mientras se escribe (`faltaCobrar`) y deshabilita «Entregar».
2. **Frontend, escribir.** `registrarEntrega` arma una lista de sentencias con el **pago primero** y la entrega después, y las guarda con `ejecutarJuntas`
   (una transacción). Antes eran la entrega y luego el pago, sueltos.
3. **La cola.** PowerSync guarda las dos operaciones en orden; `subirCola` (`lib/powersync/conector.ts`) las manda: primero `/pagos`, después `/entregas`.
4. **Backend.** `entregas.model.ts` agrega al `UPDATE ordenes SET estado = 'ENTREGADO'` la condición «`COALESCE(precio_final pedido, precio_total) <=` suma de pagos».
   Como el `INSERT` de la entrega lee lo que devolvió ese `UPDATE`, si la condición falla no se escribe nada: ni la entrega, ni el cambio de estado, ni la auditoría.
5. **Si falla.** El model averigua por qué (`saldoAlEntregar`) y el controller responde 409 `SALDO_PENDIENTE` con «La boleta 001234 todavía tiene Bs 30.00 sin cobrar…».
   Al subir desde la cola, un 409 se copia a `para_corregir` y la persona lo ve.

## Dónde encaja en la arquitectura

Es la regla de CLAUDE.md §6: lo que valida el cliente es cortesía, lo que valida el servidor es la garantía, y «lo autoritativo del servidor se hace en la misma sentencia que
escribe». La comprobación del saldo no es un `SELECT` antes del `INSERT` (que dejaría una ventana de carrera), sino una condición del mismo `UPDATE`. Un pago nunca se borra,
así que una carrera con otro cobro solo puede ayudar a que la condición se cumpla.

## Decisiones y por qué

- **Pago antes que entrega (en el dispositivo), no los dos en un solo pedido.** La alternativa era que `POST /api/entregas` aceptara el pago final dentro del mismo cuerpo. Se descartó porque
  cambia el contrato de dos endpoints y la cola sube cada tabla por su ruta. Invertir el orden de escritura es un cambio de una función.
- **`ejecutarJuntas` en lugar de dos escrituras sueltas.** Si la tablet se apagara entre una y otra, quedaría una entrega sin su pago, que el servidor rechazaría.
- **Saldo cero o negativo entrega.** Perdonar el cobro (precio final 0) o haber cobrado de más no son «deuda»; la regla es «no falta cobrar nada».
- **El criterio 1 de la spec decía «el pago final que viene en el mismo pedido».** Eso no es cómo sube la cola; quedó corregido en la spec a «con los cobros que la orden ya tiene registrados».
- **Quitada la fila «Queda debiendo» y `saldoDespues`.** Ya no puede quedar deuda; dejar el campo habría sido código muerto.

## Los tests

- Contra Postgres real (`entregas.db.test.ts`): rechazada, no se escribe nada (orden sin cambio, sin entrega, sin auditoría); con el pago registrado entrega; el recargo exige cobrarlo; precio final 0 y cobrar de más entregan;
  y por la API, 409 con el monto y luego 201 al cobrar. Se agregó `pagarOrden` a `baseReal.ts`: los tests que entregan por el model ahora pagan antes.
- `prepararEntrega`/`registrarEntrega` (`entregasLocal.test.ts`): falta cobrar, boleta ya pagada, y el orden pago-entrega en la cola.
- Pantalla (`EntregarEnMostrador.test.tsx`): botón apagado, texto de cuánto falta, y un recorrido completo que sube contra un servidor falso, comprueba el orden `/pagos` → `/entregas` y
  muestra el rechazo en Para corregir.

## Si mañana tenés que tocar esto

Una entrega cargada **antes** de esta spec en una tablet (entrega antes que pago) vuelve como 409 y va a Para corregir. Y si algún día el servidor rechaza el pago (por ejemplo un método que ya no existe),
la entrega que viene detrás también se rechaza: es lo esperado, porque la ropa no estaba pagada.
