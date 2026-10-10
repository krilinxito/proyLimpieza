-- SPEC-ALE186-020 — Cuándo se cerró una sucursal pasa a una columna.
--
-- SPEC-ALE186-014 acepta, en una sucursal cerrada, solo la ropa que entró antes
-- del cierre. Como `sucursales` no guardaba esa fecha, se deducía de la
-- auditoría. Ahora la guarda `cerrada_en`, en la misma hora de referencia que el
-- resto de las columnas TIMESTAMP (la de la sesión de Postgres).
--
-- Para las sucursales que ya están cerradas, se toma el último cierre que anotó
-- la auditoría: el EDITAR de esa sucursal en el que `activa` valía `true` antes
-- del cambio. Una cerrada sin rastro en la auditoría (cerrada a mano en la base)
-- queda con `cerrada_en` en NULL y sigue rechazando toda la ropa nueva, como
-- hasta ahora: inventarle una fecha la haría más permisiva sin que nadie lo decida.

ALTER TABLE sucursales ADD COLUMN cerrada_en TIMESTAMP;

UPDATE sucursales s
   SET cerrada_en = (
         SELECT max(a.fecha)
           FROM auditoria a
          WHERE a.tabla_afectada = 'sucursales'
            AND a.registro_id = s.id
            AND a.accion = 'EDITAR'
            AND a.valores_anteriores->>'activa' = 'true'
       )
 WHERE NOT s.activa;
