-- SPEC-ALE186-020 — El nombre de una sucursal es único, y lo garantiza la base.
--
-- SPEC-ALE186-011 lo comprobaba en el código, dentro de la sentencia que escribe,
-- porque no había migraciones para agregar una restricción. Eso dejaba pasar dos
-- altas simultáneas con el mismo nombre. Un índice único no deja pasar ninguna.
--
-- El índice es sobre `lower(btrim(nombre))`: "Central" y " central " son el
-- mismo nombre, que es la misma regla que tenía el código.
--
-- Si ya hay nombres repetidos, el índice no se podría crear y Postgres daría un
-- error poco claro. Por eso primero se buscan, y si hay, la migración falla con
-- un mensaje que los nombra. Como cada migración corre en su transacción, no
-- queda nada a medias: se renombra una de cada grupo y se vuelve a migrar.

DO $$
DECLARE
  repetidos TEXT;
BEGIN
  SELECT string_agg(grupo, '; ')
    INTO repetidos
    FROM (SELECT string_agg('"' || nombre || '"', ', ' ORDER BY nombre) AS grupo
            FROM sucursales
           GROUP BY lower(btrim(nombre))
          HAVING count(*) > 1) AS grupos;

  IF repetidos IS NOT NULL THEN
    RAISE EXCEPTION 'Hay sucursales con el mismo nombre: %. Renombrá todas menos una de cada grupo y volvé a correr npm run migrar.', repetidos;
  END IF;
END $$;

CREATE UNIQUE INDEX uq_sucursales_nombre ON sucursales (lower(btrim(nombre)));
