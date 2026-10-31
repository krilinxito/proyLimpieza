-- SPEC-KRILINXI-067 — La boleta solo tiene recibido, entregado, reembolsado y anulado.
--
-- Nadie usaba "Empezar a lavar" ni "Marcar como lista". `estado_orden` pasa de cinco valores a
-- cuatro: RECIBIDO, ENTREGADO, REEMBOLSADO y ANULADO. REEMBOLSADO queda declarado pero todavía
-- nada lo escribe (lo hará la spec reembolso-entrega).
--
-- Postgres no permite quitar un valor de un ENUM, así que se recrea el tipo y se vuelve a apuntar
-- la columna. Antes de eso, la ropa que estaba EN_PROCESO o LISTO pasa a RECIBIDO: sigue en el
-- local, sin entregar, y no se pierde ninguna fila.
--
-- Dos vistas leen `ordenes.estado` (vw_saldos la devuelve, vw_pendientes_recoger la filtra), y
-- Postgres no deja cambiar el tipo de una columna de la que depende una vista. Se borran y se
-- vuelven a crear con la misma definición de la línea base (`context/lavanderia_schema.sql`).
-- Tampoco deja cambiar el tipo con un DEFAULT puesto, así que se quita y se repone.
-- La auditoría no se toca: las filas viejas que nombren EN_PROCESO o LISTO son historia.

UPDATE ordenes SET estado = 'RECIBIDO' WHERE estado IN ('EN_PROCESO', 'LISTO');

DROP VIEW vw_pendientes_recoger;
DROP VIEW vw_saldos;

ALTER TABLE ordenes ALTER COLUMN estado DROP DEFAULT;

ALTER TYPE estado_orden RENAME TO estado_orden_viejo;

CREATE TYPE estado_orden AS ENUM ('RECIBIDO', 'ENTREGADO', 'REEMBOLSADO', 'ANULADO');

ALTER TABLE ordenes
  ALTER COLUMN estado TYPE estado_orden USING estado::text::estado_orden;

ALTER TABLE ordenes ALTER COLUMN estado SET DEFAULT 'RECIBIDO';

DROP TYPE estado_orden_viejo;

CREATE VIEW vw_saldos AS
SELECT
    o.id                AS orden_id,
    o.numero_boleta,
    o.cliente_id,
    c.nombre            AS cliente,
    o.sucursal_id,
    o.estado,
    o.precio_total,
    e.precio_final,
    COALESCE(e.precio_final, o.precio_total) AS monto_a_cobrar,
    COALESCE(SUM(p.monto), 0)                AS total_pagado,
    COALESCE(e.precio_final, o.precio_total)
        - COALESCE(SUM(p.monto), 0)          AS saldo_pendiente
FROM ordenes o
JOIN clientes c        ON c.id = o.cliente_id
LEFT JOIN entregas e   ON e.orden_id = o.id
LEFT JOIN pagos p      ON p.orden_id = o.id
GROUP BY o.id, c.nombre, e.precio_final;

CREATE VIEW vw_pendientes_recoger AS
SELECT
    o.id, o.numero_boleta, c.nombre AS cliente, c.telefono,
    o.descripcion, o.fecha_entrada, o.fecha_estimada_salida,
    o.precio_total, s.nombre AS sucursal
FROM ordenes o
JOIN clientes c   ON c.id = o.cliente_id
JOIN sucursales s ON s.id = o.sucursal_id
LEFT JOIN entregas e ON e.orden_id = o.id
WHERE e.id IS NULL
  AND o.estado <> 'ANULADO';
