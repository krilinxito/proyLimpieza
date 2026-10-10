-- SPEC-ALE186-020 — La marca de revisión pasa a una columna propia.
--
-- SPEC-ALE186-018 marca para el admin lo que sube una cuenta dada de baja. Como
-- entonces no había migraciones, la marca se guardó dentro de
-- `valores_anteriores` (`{"revision": "cuenta_dada_de_baja"}`). Acá pasa a su
-- columna, y las marcas que ya existan se mueven: se copian a `revision` y se
-- quitan de `valores_anteriores`. Un alta marcada, que no tenía valores de antes,
-- vuelve a quedar con `valores_anteriores` en NULL.

ALTER TABLE auditoria
  ADD COLUMN revision TEXT
  CONSTRAINT chk_auditoria_revision CHECK (revision IN ('cuenta_dada_de_baja'));

UPDATE auditoria
   SET revision = valores_anteriores->>'revision',
       valores_anteriores = NULLIF(valores_anteriores - 'revision', '{}'::jsonb)
 WHERE valores_anteriores ? 'revision';

-- Lo marcado es poco y es lo que el admin busca con `?revisar=true`: un índice
-- parcial guarda solo esas filas.
CREATE INDEX idx_auditoria_revision ON auditoria (revision) WHERE revision IS NOT NULL;
