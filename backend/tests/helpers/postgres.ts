// Errores de Postgres de mentira — creado en SPEC-ALE186-004 (sale del test de
// clientes de SPEC-ALE186-003, donde vivía suelto).
//
// Los models traducen ciertos errores de la base a errores de dominio: un
// teléfono repetido, una boleta repetida, un cliente que no existe. Para probar
// esa traducción sin levantar Postgres, el test hace que el pool falle con un
// error que tiene la misma forma que el de verdad: un `pg.DatabaseError` con su
// código de cinco caracteres y el nombre de la restricción que se violó.
//
//   query.mockRejectedValueOnce(unicidadViolada('uq_boleta_por_sucursal'));
//   query.mockRejectedValueOnce(claveForaneaViolada('ordenes_cliente_id_fkey'));
import pg from 'pg';

export function errorDePostgres(codigo: string, restriccion: string): pg.DatabaseError {
  const error = new pg.DatabaseError('error de prueba', 0, 'error');
  error.code = codigo;
  error.constraint = restriccion;
  return error;
}

/** 23505: lo que tira un UNIQUE violado. */
export function unicidadViolada(restriccion: string): pg.DatabaseError {
  return errorDePostgres('23505', restriccion);
}

/** 23503: lo que tira una REFERENCES que apunta a una fila que no existe. */
export function claveForaneaViolada(restriccion: string): pg.DatabaseError {
  return errorDePostgres('23503', restriccion);
}
