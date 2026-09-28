// Semilla inicial: la primera sucursal y el primer administrador.
//
// Existe porque el sistema nace sin nadie dentro. El schema crea las tablas
// vacías, así que no se puede entrar (no hay usuarios) ni crear el primer
// usuario (haría falta estar dentro). Alguien tiene que romper ese círculo
// desde fuera, y esto es ese alguien.
//
//   npm run seed --workspace backend
//
// Es idempotente: se puede correr las veces que haga falta sin duplicar nada.
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcrypt';
import * as sucursales from '../models/sucursales.model.js';
import * as usuarios from '../models/usuarios.model.js';
import { pool } from './pool.js';

// El coste de producción. Acá sí interesa el de verdad: este hash se queda en
// la base durante años, y es el de la cuenta con más permisos del sistema.
const COSTE_BCRYPT = 10;

const LARGO_MINIMO = 8;

export interface Semilla {
  sucursal: { nombre: string; creada: boolean };
  admin: { username: string; creado: boolean };
}

interface Datos {
  sucursal: string;
  username: string;
  nombreCompleto: string;
  contrasena: string;
}

/**
 * Saca del entorno lo que hay que sembrar.
 *
 * La contraseña **no tiene valor por defecto**, y es deliberado: un
 * `admin/admin123` escrito acá viajaría en el repositorio y acabaría vivo en la
 * instalación de alguien. Sección 10 — ningún secreto en el repositorio.
 */
export function leerDatos(env: NodeJS.ProcessEnv): Datos {
  const contrasena = env.SEED_ADMIN_PASSWORD ?? '';

  if (contrasena === '') {
    throw new Error(
      'Falta SEED_ADMIN_PASSWORD. Elegí la contraseña del administrador y pasala por el ' +
        'entorno; no hay una por defecto a propósito. Por ejemplo:\n' +
        '  SEED_ADMIN_PASSWORD="la-que-elijas" npm run seed --workspace backend',
    );
  }

  if (contrasena.length < LARGO_MINIMO) {
    throw new Error(`SEED_ADMIN_PASSWORD tiene que tener al menos ${LARGO_MINIMO} caracteres.`);
  }

  return {
    contrasena,
    sucursal: env.SEED_SUCURSAL?.trim() || 'Sucursal Central',
    username: env.SEED_ADMIN_USERNAME?.trim() || 'admin',
    nombreCompleto: env.SEED_ADMIN_NOMBRE?.trim() || 'Administrador',
  };
}

/**
 * Crea lo que falte y deja en paz lo que ya esté.
 *
 * El admin va con `sucursal_id` en NULL: un ADMIN es global y no pertenece a
 * ninguna tienda (CLAUDE.md, sección 3, y la restricción
 * `chk_empleado_con_sucursal` del schema lo permite solo para ese rol).
 */
export async function sembrar(env: NodeJS.ProcessEnv): Promise<Semilla> {
  const datos = leerDatos(env);

  const existente = await sucursales.buscarPorNombre(datos.sucursal);
  const sucursal = existente ?? (await sucursales.crear(datos.sucursal));

  const admin = await usuarios.crear({
    nombreCompleto: datos.nombreCompleto,
    username: datos.username,
    passwordHash: await bcrypt.hash(datos.contrasena, COSTE_BCRYPT),
    rol: 'ADMIN',
    sucursalId: null,
  });

  return {
    sucursal: { nombre: sucursal.nombre, creada: existente === null },
    // `crear` devuelve null cuando el username ya estaba: la unicidad la decide
    // la base, no una consulta previa.
    admin: { username: datos.username, creado: admin !== null },
  };
}

function contar(creado: boolean): string {
  return creado ? 'creada/o' : 'ya existía, no se tocó';
}

async function main(): Promise<void> {
  try {
    const { sucursal, admin } = await sembrar(process.env);

    console.log(`Sucursal "${sucursal.nombre}": ${contar(sucursal.creada)}`);
    console.log(`Usuario "${admin.username}" (ADMIN): ${contar(admin.creado)}`);
  } finally {
    await pool.end();
  }
}

// Solo cuando se ejecuta el archivo, no cuando un test lo importa.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
