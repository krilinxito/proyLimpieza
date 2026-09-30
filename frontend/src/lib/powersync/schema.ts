/**
 * El schema de la base local: qué tablas y columnas hay en el SQLite del dispositivo.
 *
 * No es un schema inventado: es exactamente lo que bajan las sync rules
 * (`docker/powersync/sync-rules.yaml`), con los tipos que tiene SQLite. `schema.test.ts` lo
 * compara con ese archivo y con `context/lavanderia_schema.sql`, y falla si alguno de los
 * tres cambia sin los otros.
 *
 * Tres reglas de traducción de Postgres a SQLite:
 *
 *  - `id` no se declara: PowerSync lo agrega solo a cada tabla, como texto.
 *  - Los montos (`NUMERIC`) son **texto**, no `real`. PowerSync los replica como "12.50"
 *    para no perder precisión, y `lib/money` los pasa a centavos. Un `real` sería un float,
 *    que es justo lo que CLAUDE.md §6 prohíbe para el dinero.
 *  - `BOOLEAN` llega como entero, 0 o 1. Fechas y UUID, como texto.
 */
import { column, Schema, Table } from '@powersync/common';

const { text, integer } = column;

export const TABLAS = {
  sucursales: new Table({
    nombre: text,
    direccion: text,
    telefono: text,
    activa: integer,
  }),

  // Solo las columnas que baja la sync rule. Nunca `password_hash` (CLAUDE.md §7).
  usuarios: new Table({
    nombre_completo: text,
    username: text,
    rol: text,
    sucursal_id: text,
    activo: integer,
  }),

  clientes: new Table({
    nombre: text,
    telefono: text,
    carnet: text,
    fecha_registro: text,
    sucursal_registro_id: text,
  }),

  ordenes: new Table({
    numero_boleta: text,
    cliente_id: text,
    sucursal_id: text,
    usuario_recepcion_id: text,
    descripcion: text,
    fecha_entrada: text,
    fecha_estimada_salida: text,
    precio_total: text,
    estado: text,
  }),

  entregas: new Table({
    orden_id: text,
    sucursal_id: text,
    fecha_entrega: text,
    tipo_retiro: text,
    retirado_por_nombre: text,
    retirado_por_carnet: text,
    usuario_entrega_id: text,
    precio_final: text,
  }),

  pagos: new Table({
    orden_id: text,
    sucursal_id: text,
    monto: text,
    tipo: text,
    metodo: text,
    fecha_pago: text,
    usuario_id: text,
  }),
};

export const SCHEMA_LOCAL = new Schema(TABLAS);
