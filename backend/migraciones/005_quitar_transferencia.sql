-- SPEC-KRILINXI-055 — La transferencia deja de ser una forma de pago.
--
-- El negocio ya no cobra por transferencia. `metodo_pago` pasa de cuatro valores a tres:
-- EFECTIVO, QR y TARJETA. Postgres no permite quitar un valor de un ENUM, así que se
-- recrea el tipo y se vuelve a apuntar la columna.
--
-- Los cobros que ya estaban guardados como TRANSFERENCIA (al decidirse esto eran datos de
-- prueba) pasan a EFECTIVO antes de recrear el tipo, para no perder ninguna fila ni su
-- monto: lo cobrado sigue sumando igual en las estadísticas, solo que bajo otra forma de pago.
-- Esta migración no escribe en `auditoria`: las filas viejas que mencionen TRANSFERENCIA
-- dentro de `valores_nuevos` son historia y se dejan como están.

UPDATE pagos SET metodo = 'EFECTIVO' WHERE metodo = 'TRANSFERENCIA';

ALTER TYPE metodo_pago RENAME TO metodo_pago_viejo;

CREATE TYPE metodo_pago AS ENUM ('EFECTIVO', 'QR', 'TARJETA');

ALTER TABLE pagos
  ALTER COLUMN metodo TYPE metodo_pago USING metodo::text::metodo_pago;

DROP TYPE metodo_pago_viejo;
