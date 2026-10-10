-- SPEC-ALE186-020 — Índice para "qué pasó con este registro".
--
-- La consulta de la auditoría filtra por `registro_id` (`?registro_id=`, y la
-- regla del cierre de SPEC-ALE186-014 hasta esta spec). Sin índice, cada una
-- recorre la auditoría entera, que crece con cada escritura y cada login. Lo
-- encontró la revisión del backend del 2026-10-09.

CREATE INDEX idx_auditoria_registro ON auditoria (registro_id);
