-- ============================================================
--  SISTEMA DE GESTIÓN DE LAVANDERÍA
--  Motor: PostgreSQL 12 o superior
--  Ejecutar sobre una base de datos vacía.
--
--  Este archivo es la referencia del modelo de datos del proyecto.
--  Las decisiones que se apartan de un schema "normal" están ahí por
--  el enfoque offline-first con PowerSync y llevan su comentario.
--  Ver CLAUDE.md § Arquitectura offline-first.
-- ============================================================

-- gen_random_uuid() es nativo desde PostgreSQL 13; en la 12 vive en pgcrypto.
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ------------------------------------------------------------
-- 0. TIPOS ENUMERADOS
--    OJO: SQLite (la base local del cliente) no tiene ENUM, así que
--    en el dispositivo estos valores viajan como TEXT. Los valores
--    válidos se centralizan en el código y se validan en el backend.
-- ------------------------------------------------------------
CREATE TYPE rol_usuario      AS ENUM ('ADMIN', 'EMPLEADO');
CREATE TYPE estado_orden     AS ENUM ('RECIBIDO', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'ANULADO');
CREATE TYPE tipo_retiro      AS ENUM ('CON_BOLETA', 'SIN_BOLETA');
CREATE TYPE tipo_pago        AS ENUM ('ADELANTO', 'PAGO_FINAL');
CREATE TYPE metodo_pago      AS ENUM ('EFECTIVO', 'QR', 'TARJETA', 'TRANSFERENCIA');
CREATE TYPE accion_auditoria AS ENUM ('CREAR', 'EDITAR', 'ELIMINAR', 'LOGIN', 'ENTREGAR', 'COBRAR');


-- ------------------------------------------------------------
--  PORQUÉ UUID Y NO SERIAL
--  Un empleado sin internet crea órdenes, clientes, entregas y pagos
--  en la base local de su dispositivo. Con SERIAL el id lo asignaría
--  el servidor, así que la fila no tendría identidad hasta sincronizar
--  y dos sucursales offline generarían el mismo número.
--  El cliente genera el UUID (crypto.randomUUID()) antes de insertar.
--  El DEFAULT de abajo solo sirve para inserts hechos en el servidor
--  (seeds, migraciones); el cliente siempre manda el suyo.
-- ------------------------------------------------------------


-- ------------------------------------------------------------
-- 1. SUCURSALES
-- ------------------------------------------------------------
CREATE TABLE sucursales (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre      VARCHAR(100) NOT NULL,
    direccion   VARCHAR(200),
    telefono    VARCHAR(30),
    activa      BOOLEAN NOT NULL DEFAULT TRUE
);


-- ------------------------------------------------------------
-- 2. USUARIOS (empleados y administradores)
--    sucursal_id es NULL para los administradores (alcance global)
--    y obligatorio para los empleados.
--    password_hash NUNCA se sincroniza al dispositivo: las sync rules
--    replican esta tabla con lista explícita de columnas.
-- ------------------------------------------------------------
CREATE TABLE usuarios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sucursal_id     UUID REFERENCES sucursales(id),
    nombre_completo VARCHAR(150) NOT NULL,
    username        VARCHAR(50)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    rol             rol_usuario  NOT NULL,
    telefono        VARCHAR(30),
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_por      UUID         REFERENCES usuarios(id),
    fecha_creacion  TIMESTAMP    NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_empleado_con_sucursal
        CHECK (rol = 'ADMIN' OR sucursal_id IS NOT NULL)
);


-- ------------------------------------------------------------
-- 3. CLIENTES
--    El teléfono es la clave de búsqueda para el alta automática.
--    Se sincronizan a todas las sucursales: un cliente puede dejar
--    ropa en una e ir a recogerla a otra.
-- ------------------------------------------------------------
CREATE TABLE clientes (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre               VARCHAR(150) NOT NULL,
    telefono             VARCHAR(30)  NOT NULL UNIQUE,
    carnet               VARCHAR(30),
    fecha_registro       TIMESTAMP    NOT NULL DEFAULT NOW(),
    sucursal_registro_id UUID         REFERENCES sucursales(id)
);


-- ------------------------------------------------------------
-- 4. ORDENES  (registro de entrada / boleta)
--
--    numero_boleta lo transcribe el empleado de la boleta física
--    preimpresa: el sistema no lo genera. Cada sucursal maneja su
--    propio talonario, y offline el dispositivo solo conoce las
--    órdenes de su sucursal — no puede validar unicidad global.
--    Por eso es único POR SUCURSAL y no en toda la base.
-- ------------------------------------------------------------
CREATE TABLE ordenes (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_boleta         VARCHAR(30)  NOT NULL,
    cliente_id            UUID         NOT NULL REFERENCES clientes(id),
    sucursal_id           UUID         NOT NULL REFERENCES sucursales(id),
    usuario_recepcion_id  UUID         NOT NULL REFERENCES usuarios(id),
    descripcion           TEXT         NOT NULL,
    fecha_entrada         TIMESTAMP    NOT NULL DEFAULT NOW(),
    fecha_estimada_salida DATE,
    precio_total          NUMERIC(10,2) NOT NULL CHECK (precio_total >= 0),
    estado                estado_orden  NOT NULL DEFAULT 'RECIBIDO',

    CONSTRAINT uq_boleta_por_sucursal UNIQUE (sucursal_id, numero_boleta)
);


-- ------------------------------------------------------------
-- 5. ENTREGAS  (retiro de la ropa)
--    Relación 1 a 1 con la orden gracias al UNIQUE en orden_id.
--    precio_final arranca igual al precio_total de la orden y el
--    empleado puede modificarlo (recargo por almacenamiento, etc.).
--
--    sucursal_id está duplicado a propósito (ya se puede deducir
--    desde ordenes). Las sync rules de PowerSync no admiten JOINs ni
--    subconsultas, así que una tabla solo se puede filtrar por una
--    columna suya. Sin esta columna, entregas no se podría repartir
--    por sucursal y cada dispositivo bajaría las de las tres.
--    Es responsabilidad del backend mantenerla igual a la de la orden.
-- ------------------------------------------------------------
CREATE TABLE entregas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    orden_id            UUID         NOT NULL UNIQUE REFERENCES ordenes(id),
    sucursal_id         UUID         NOT NULL REFERENCES sucursales(id),
    fecha_entrega       TIMESTAMP    NOT NULL DEFAULT NOW(),
    tipo_retiro         tipo_retiro  NOT NULL,
    retirado_por_nombre VARCHAR(150),
    retirado_por_carnet VARCHAR(30),
    usuario_entrega_id  UUID         NOT NULL REFERENCES usuarios(id),
    precio_final        NUMERIC(10,2) NOT NULL CHECK (precio_final >= 0),

    -- Si viene alguien sin boleta, nombre y carnet son obligatorios.
    CONSTRAINT chk_datos_sin_boleta
        CHECK (
            tipo_retiro = 'CON_BOLETA'
            OR (retirado_por_nombre IS NOT NULL AND retirado_por_carnet IS NOT NULL)
        )
);


-- ------------------------------------------------------------
-- 6. PAGOS
--    sucursal_id duplicado por el mismo motivo que en entregas.
-- ------------------------------------------------------------
CREATE TABLE pagos (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    orden_id    UUID          NOT NULL REFERENCES ordenes(id),
    sucursal_id UUID          NOT NULL REFERENCES sucursales(id),
    monto       NUMERIC(10,2) NOT NULL CHECK (monto > 0),
    tipo        tipo_pago     NOT NULL,
    metodo      metodo_pago   NOT NULL,
    fecha_pago  TIMESTAMP     NOT NULL DEFAULT NOW(),
    usuario_id  UUID          NOT NULL REFERENCES usuarios(id)
);


-- ------------------------------------------------------------
-- 7. AUDITORIA
--    No se sincroniza a ningún dispositivo. Se consulta por API y
--    solo el rol ADMIN puede verla.
--    registro_id apunta al id de la fila afectada en cualquier tabla,
--    por eso es UUID como todas las PKs.
-- ------------------------------------------------------------
CREATE TABLE auditoria (
    id                 UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id         UUID             NOT NULL REFERENCES usuarios(id),
    accion             accion_auditoria NOT NULL,
    tabla_afectada     VARCHAR(50)      NOT NULL,
    registro_id        UUID,
    valores_anteriores JSONB,
    fecha              TIMESTAMP        NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- 8. ÍNDICES para los filtros de estadísticas
-- ------------------------------------------------------------
CREATE INDEX idx_ordenes_fecha_entrada  ON ordenes(fecha_entrada);
CREATE INDEX idx_ordenes_estado         ON ordenes(estado);
CREATE INDEX idx_ordenes_cliente        ON ordenes(cliente_id);
CREATE INDEX idx_ordenes_usuario_recep  ON ordenes(usuario_recepcion_id);
CREATE INDEX idx_ordenes_sucursal       ON ordenes(sucursal_id);
CREATE INDEX idx_pagos_orden            ON pagos(orden_id);
CREATE INDEX idx_pagos_fecha            ON pagos(fecha_pago);
CREATE INDEX idx_pagos_sucursal         ON pagos(sucursal_id);
CREATE INDEX idx_entregas_fecha         ON entregas(fecha_entrega);
CREATE INDEX idx_entregas_sucursal      ON entregas(sucursal_id);
CREATE INDEX idx_auditoria_usuario      ON auditoria(usuario_id);
CREATE INDEX idx_auditoria_fecha        ON auditoria(fecha);


-- ============================================================
--  VISTAS
--  PowerSync replica TABLAS, no vistas: nada de esto llega al
--  dispositivo. Viven aquí para el dashboard del admin, que es
--  online y agrega en Postgres. El equivalente offline (saldo de
--  una orden, órdenes sin recoger de mi sucursal) se calcula en el
--  cliente sobre las tablas sincronizadas.
-- ============================================================

-- ------------------------------------------------------------
-- 9. VISTA DE SALDOS (saldo pendiente calculado, sin trigger)
--    Si la orden ya tiene entrega, se cobra el precio_final;
--    si todavía no, se muestra contra el precio_total.
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- 10. VISTA DE PENDIENTES DE RECOGER
-- ------------------------------------------------------------
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


-- ------------------------------------------------------------
-- 11. PUBLICACIÓN PARA POWERSYNC
--     PowerSync lee los cambios por replicación lógica. Requiere
--     además wal_level = logical, que el docker-compose ya fija.
--     auditoria entra en la publicación (es replicación, no sync);
--     lo que decide qué llega al dispositivo son las sync rules.
-- ------------------------------------------------------------
CREATE PUBLICATION powersync FOR ALL TABLES;
