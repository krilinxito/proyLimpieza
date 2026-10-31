-- SPEC-KRILINXI-068 — Los renglones de la boleta: qué prenda, cuántas y a qué precio.
--
-- Hasta acá la boleta tenía una descripción libre y un precio total escrito a mano. Desde esta spec, cada renglón
-- guarda su descripción, su cantidad (con decimales, para los kilos) y su precio unitario, y el total se calcula.
-- `ordenes.precio_total` se queda: entregas, saldos y estadísticas dependen de esa columna, y se guarda igual a la
-- suma de los renglones de ingreso.
--
-- `momento` dice cuándo se agregó el renglón:
--   INGRESO  al registrar la boleta. Su suma no pasa de `precio_total` (lo comprueba el model, al insertar).
--   ENTREGA  un cargo al entregar (un recargo por almacenamiento, por ejemplo). Se suma encima, y el precio final
--            de la entrega es `precio_total` + los cargos.
--
-- `sucursal_id` está duplicado, como en pagos y entregas: las sync rules no admiten JOINs, así que sin esta
-- columna los renglones no se podrían repartir por sucursal. La copia el model de la orden, en el mismo INSERT.
--
-- `posicion` es el lugar del renglón en la boleta (0, 1, 2…, dentro de su momento), tal como lo escribió el empleado.
-- Sin ella no habría con qué ordenarlos: los ids son al azar y no hay fecha por renglón.
--
-- No hay columna de subtotal: es `round(cantidad * precio_unitario, 2)`, la cuenta que hacen igual el servidor y
-- la tablet. Guardarlo sería tener dos verdades que pueden no coincidir.
--
-- No hace falta tocar la publicación de PowerSync: es `FOR ALL TABLES` (línea base), así que la tabla nueva se
-- replica sola.

CREATE TYPE momento_item AS ENUM ('INGRESO', 'ENTREGA');

CREATE TABLE orden_items (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    orden_id        UUID          NOT NULL REFERENCES ordenes(id),
    sucursal_id     UUID          NOT NULL REFERENCES sucursales(id),
    momento         momento_item  NOT NULL DEFAULT 'INGRESO',
    posicion        SMALLINT      NOT NULL DEFAULT 0 CHECK (posicion >= 0),
    descripcion     VARCHAR(150)  NOT NULL CHECK (btrim(descripcion) <> ''),
    cantidad        NUMERIC(10,2) NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0)
);

CREATE INDEX idx_orden_items_orden    ON orden_items(orden_id);
CREATE INDEX idx_orden_items_sucursal ON orden_items(sucursal_id);
