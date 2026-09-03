-- ============================================================
--  SISTEMA DE GESTIÓN DE LAVANDERÍA
--  Motor: PostgreSQL 12 o superior
--  Ejecutar sobre una base de datos vacía.
-- ============================================================

-- ------------------------------------------------------------
-- 0. TIPOS ENUMERADOS
-- ------------------------------------------------------------
CREATE TYPE rol_usuario      AS ENUM ('ADMIN', 'EMPLEADO');
CREATE TYPE estado_orden     AS ENUM ('RECIBIDO', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'ANULADO');
CREATE TYPE tipo_retiro      AS ENUM ('CON_BOLETA', 'SIN_BOLETA');
CREATE TYPE tipo_pago        AS ENUM ('ADELANTO', 'PAGO_FINAL');
CREATE TYPE metodo_pago      AS ENUM ('EFECTIVO', 'QR', 'TARJETA', 'TRANSFERENCIA');
CREATE TYPE accion_auditoria AS ENUM ('CREAR', 'EDITAR', 'ELIMINAR', 'LOGIN', 'ENTREGAR', 'COBRAR');


-- ------------------------------------------------------------
-- 1. SUCURSALES
-- ------------------------------------------------------------
CREATE TABLE sucursales (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL,
    direccion   VARCHAR(200),
    telefono    VARCHAR(30),
    activa      BOOLEAN NOT NULL DEFAULT TRUE
);


-- ------------------------------------------------------------
-- 2. USUARIOS (empleados y administradores)
--    sucursal_id es NULL para los administradores (alcance global)
--    y obligatorio para los empleados.
-- ------------------------------------------------------------
CREATE TABLE usuarios (
    id              SERIAL PRIMARY KEY,
    sucursal_id     INTEGER REFERENCES sucursales(id),
    nombre_completo VARCHAR(150) NOT NULL,
    username        VARCHAR(50)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    rol             rol_usuario  NOT NULL,
    telefono        VARCHAR(30),
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_por      INTEGER      REFERENCES usuarios(id),
    fecha_creacion  TIMESTAMP    NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_empleado_con_sucursal
        CHECK (rol = 'ADMIN' OR sucursal_id IS NOT NULL)
);


-- ------------------------------------------------------------
-- 3. CLIENTES
--    El teléfono es la clave de búsqueda para el alta automática.
-- ------------------------------------------------------------
CREATE TABLE clientes (
    id                   SERIAL PRIMARY KEY,
    nombre               VARCHAR(150) NOT NULL,
    telefono             VARCHAR(30)  NOT NULL UNIQUE,
    carnet               VARCHAR(30),
    fecha_registro       TIMESTAMP    NOT NULL DEFAULT NOW(),
    sucursal_registro_id INTEGER      REFERENCES sucursales(id)
);


-- ------------------------------------------------------------
-- 4. ORDENES  (registro de entrada / boleta)
-- ------------------------------------------------------------
CREATE TABLE ordenes (
    id                    SERIAL PRIMARY KEY,
    numero_boleta         VARCHAR(30)  NOT NULL UNIQUE,
    cliente_id            INTEGER      NOT NULL REFERENCES clientes(id),
    sucursal_id           INTEGER      NOT NULL REFERENCES sucursales(id),
    usuario_recepcion_id  INTEGER      NOT NULL REFERENCES usuarios(id),
    descripcion           TEXT         NOT NULL,
    fecha_entrada         TIMESTAMP    NOT NULL DEFAULT NOW(),
    fecha_estimada_salida DATE,
    precio_total          NUMERIC(10,2) NOT NULL CHECK (precio_total >= 0),
    estado                estado_orden  NOT NULL DEFAULT 'RECIBIDO'
);


-- ------------------------------------------------------------
-- 5. ENTREGAS  (retiro de la ropa)
--    Relación 1 a 1 con la orden gracias al UNIQUE en orden_id.
--    precio_final arranca igual al precio_total de la orden y el
--    empleado puede modificarlo (recargo por almacenamiento, etc.).
-- ------------------------------------------------------------
CREATE TABLE entregas (
    id                  SERIAL PRIMARY KEY,
    orden_id            INTEGER      NOT NULL UNIQUE REFERENCES ordenes(id),
    fecha_entrega       TIMESTAMP    NOT NULL DEFAULT NOW(),
    tipo_retiro         tipo_retiro  NOT NULL,
    retirado_por_nombre VARCHAR(150),
    retirado_por_carnet VARCHAR(30),
    usuario_entrega_id  INTEGER      NOT NULL REFERENCES usuarios(id),
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
-- ------------------------------------------------------------
CREATE TABLE pagos (
    id          SERIAL PRIMARY KEY,
    orden_id    INTEGER       NOT NULL REFERENCES ordenes(id),
    monto       NUMERIC(10,2) NOT NULL CHECK (monto > 0),
    tipo        tipo_pago     NOT NULL,
    metodo      metodo_pago   NOT NULL,
    fecha_pago  TIMESTAMP     NOT NULL DEFAULT NOW(),
    usuario_id  INTEGER       NOT NULL REFERENCES usuarios(id)
);


-- ------------------------------------------------------------
-- 7. AUDITORIA
-- ------------------------------------------------------------
CREATE TABLE auditoria (
    id                 SERIAL PRIMARY KEY,
    usuario_id         INTEGER          NOT NULL REFERENCES usuarios(id),
    accion             accion_auditoria NOT NULL,
    tabla_afectada     VARCHAR(50)      NOT NULL,
    registro_id        INTEGER,
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
CREATE INDEX idx_entregas_fecha         ON entregas(fecha_entrega);
CREATE INDEX idx_auditoria_usuario      ON auditoria(usuario_id);
CREATE INDEX idx_auditoria_fecha        ON auditoria(fecha);


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
