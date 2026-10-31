-- SPEC-KRILINXI-070 — Entregar sin cobrar (reembolso).
--
-- Una entrega con `motivo_reembolso` es una entrega reembolsada: la ropa sale sin que el cliente
-- pague lo que falta, la orden pasa a REEMBOLSADO y `precio_final` guarda lo ya cobrado (así el
-- saldo queda en 0 sin tocar `vw_saldos`). El motivo es obligatorio: sin él no hay reembolso, y un
-- motivo en blanco tampoco cuenta. NULL = una entrega común.
ALTER TABLE entregas
  ADD COLUMN motivo_reembolso TEXT
  CONSTRAINT chk_entregas_motivo_reembolso CHECK (motivo_reembolso IS NULL OR btrim(motivo_reembolso) <> '');

-- La auditoría marca para el admin lo que hay que revisar. Hasta ahora el único motivo era una cuenta
-- dada de baja (migración 001); un reembolso es el segundo. La restricción de esa migración se recrea
-- con los dos valores: una ya aplicada no se edita.
ALTER TABLE auditoria DROP CONSTRAINT chk_auditoria_revision;
ALTER TABLE auditoria
  ADD CONSTRAINT chk_auditoria_revision CHECK (revision IN ('cuenta_dada_de_baja', 'reembolso'));
