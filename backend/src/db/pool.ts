// Pool de conexiones a Postgres.
//
// Un pool, no una conexión por consulta: abrir una conexión a Postgres cuesta
// del orden de milisegundos y memoria en el servidor. El pool mantiene unas
// pocas abiertas y las presta, que es lo que hace que la API aguante varias
// peticiones a la vez sin castigar a la base.
import pg from 'pg';
import { config } from '../config.js';

const { Pool, types } = pg;

// ------------------------------------------------------------------
//  Cómo cruzan los datos la frontera de la base
// ------------------------------------------------------------------
// Estos dos parsers están declarados a propósito, aunque el primero coincida
// con el comportamiento por defecto de `pg`. Son una decisión del proyecto, y
// escrita se puede leer y discutir; heredada, alguien la cambia sin enterarse.

// NUMERIC(10,2) -> string. Es dinero, y en JavaScript `0.1 + 0.2` no da 0.3.
// El string llega crudo y `utils/money.ts` lo pasa a centavos enteros.
types.setTypeParser(types.builtins.NUMERIC, (valor: string) => valor);

// DATE -> string 'YYYY-MM-DD'. Por defecto `pg` devuelve un objeto Date en la
// zona horaria del servidor, y una fecha sin hora que pasa por una zona horaria
// se corre un día para atrás o para adelante. `fecha_estimada_salida` es un
// DATE: que llegue tal cual está escrito en la base.
types.setTypeParser(types.builtins.DATE, (valor: string) => valor);

// TIMESTAMP (sin zona) -> string 'YYYY-MM-DD HH:MM:SS'. Mismo problema que DATE,
// pero peor: por defecto `pg` lo lee como hora LOCAL de la máquina donde corre
// Node, y al pasarlo a JSON lo convierte a UTC. En una máquina a -4 h, un
// `fecha_registro` guardado como 20:00 salía por la API como 00:00Z del día
// siguiente (SPEC-ALE186-003). Además, PowerSync le entrega al dispositivo el
// string crudo: sin este parser la misma columna llegaría con dos valores
// distintos según el camino. Una columna sin zona horaria se entrega tal cual.
types.setTypeParser(types.builtins.TIMESTAMP, (valor: string) => valor);

export const pool = new Pool({ connectionString: config.databaseUrl });
