/**
 * Dar de alta, editar y dar de baja cuentas del personal — SPEC-KRILINXI-017.
 *
 * Directo a la API, **nunca por la cola**: el alta y el cambio de contraseña llevan la contraseña,
 * y la cola es una tabla del SQLite del dispositivo. Pasar por ahí la dejaría escrita en la
 * tablet hasta que suba (CLAUDE.md §6 y §8). Aquí viaja solo en el cuerpo del pedido.
 *
 * Las validaciones repiten las del backend (SPEC-ALE186-009), con sus textos. Son cortesía: el
 * servidor vuelve a validar y sus rechazos se muestran tal cual llegan.
 */
import { api, enviar, type Envio } from '../../../lib/api';
import type { Cuenta, DatosAlta, DatosEdicion, ErroresCuenta, ResultadoCuenta } from '../types';

/** El mínimo del backend (`LARGO_MINIMO_CONTRASENA`). */
export const LARGO_MINIMO_CONTRASENA = 8;

export const MENSAJES_CUENTA = {
  sinNombre: 'Escribí el nombre y apellido de la persona.',
  sinUsuario: 'Escribí el nombre de usuario con el que va a entrar.',
  contrasena: `La contraseña tiene que tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres. Elegí otra.`,
  sinSucursal: 'Elegí en qué sucursal trabaja.',
} as const;

function resultadoDe(envio: Envio<unknown>): ResultadoCuenta {
  if (envio.tipo === 'hecho') return { tipo: 'guardado' };
  if (envio.tipo === 'sin-conexion') return envio;
  return { tipo: 'rechazado', mensaje: envio.mensaje };
}

const contrasenaCorta = (password: string) => password.length < LARGO_MINIMO_CONTRASENA;

export async function crearCuenta(datos: DatosAlta): Promise<ResultadoCuenta> {
  const nombre = datos.nombreCompleto.trim();
  const username = datos.username.trim();
  const esEmpleado = datos.rol === 'EMPLEADO';
  const errores: ErroresCuenta = {};
  if (nombre === '') errores.nombreCompleto = MENSAJES_CUENTA.sinNombre;
  if (username === '') errores.username = MENSAJES_CUENTA.sinUsuario;
  if (contrasenaCorta(datos.password)) errores.password = MENSAJES_CUENTA.contrasena;
  if (esEmpleado && !datos.sucursalId) errores.sucursalId = MENSAJES_CUENTA.sinSucursal;
  if (Object.keys(errores).length > 0) return { tipo: 'invalido', errores };

  const cuerpo = {
    id: crypto.randomUUID(),
    nombre_completo: nombre,
    username,
    password: datos.password,
    rol: datos.rol,
    telefono: datos.telefono.trim() === '' ? null : datos.telefono.trim(),
    // Un ADMIN no tiene sucursal (CLAUDE.md §3).
    sucursal_id: esEmpleado ? datos.sucursalId : null,
  };
  return resultadoDe(await enviar(() => api.post('/usuarios', cuerpo)));
}

/**
 * Manda solo lo que cambió. El teléfono y la contraseña no se conocen en la tablet: vacíos
 * quieren decir "no cambiar", y escritos, "cambiar por esto".
 */
export async function editarCuenta(cuenta: Cuenta, datos: DatosEdicion): Promise<ResultadoCuenta> {
  const nombre = datos.nombreCompleto.trim();
  const telefono = datos.telefono.trim();
  const errores: ErroresCuenta = {};
  if (nombre === '') errores.nombreCompleto = MENSAJES_CUENTA.sinNombre;
  if (datos.password !== '' && contrasenaCorta(datos.password)) errores.password = MENSAJES_CUENTA.contrasena;
  if (cuenta.rol === 'EMPLEADO' && !datos.sucursalId) errores.sucursalId = MENSAJES_CUENTA.sinSucursal;
  if (Object.keys(errores).length > 0) return { tipo: 'invalido', errores };

  const cambios: Record<string, string> = {};
  if (nombre !== cuenta.nombreCompleto) cambios.nombre_completo = nombre;
  if (telefono !== '') cambios.telefono = telefono;
  if (cuenta.rol === 'EMPLEADO' && datos.sucursalId && datos.sucursalId !== cuenta.sucursalId) {
    cambios.sucursal_id = datos.sucursalId;
  }
  if (datos.password !== '') cambios.password = datos.password;
  if (Object.keys(cambios).length === 0) return { tipo: 'sin-cambios' };
  return resultadoDe(await enviar(() => api.patch(`/usuarios/${cuenta.id}`, cambios)));
}

/** La baja es lógica: `activo: false` (SPEC-ALE186-009). Corta el acceso en el próximo ingreso o renovación. */
export async function darDeBaja(cuenta: Cuenta): Promise<ResultadoCuenta> {
  return resultadoDe(await enviar(() => api.patch(`/usuarios/${cuenta.id}`, { activo: false })));
}
