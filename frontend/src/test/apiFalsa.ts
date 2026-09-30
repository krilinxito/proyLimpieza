/**
 * Servidor falso para los tests — SPEC-KRILINXI-003
 *
 * Reemplaza el "adapter" de axios, que es la pieza que de verdad manda la petición por la
 * red. Todo lo demás de `lib/api` sigue funcionando de verdad: los interceptores ponen el
 * token y traducen los errores, así que el test prueba el código real hasta el último paso.
 *
 * Uso:
 *
 *     const servidor = simularApi((pedido) =>
 *       pedido.ruta === '/auth/login' ? { status: 200, data: {...} } : { status: 404 },
 *     );
 *     // ... el código bajo prueba hace sus peticiones ...
 *     expect(servidor.pedidos[0].cuerpo).toEqual({ username: 'rosa', password: 'x' });
 *
 * Para simular que no hay internet, la función devuelve `'sin-conexion'`.
 * El adapter original se restaura solo al terminar cada test.
 */
import { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';
import { onTestFinished } from 'vitest';
import { api } from '../lib/api';

export type PedidoFalso = {
  metodo: string;
  /** Relativa a `/api`: `/auth/login`. */
  ruta: string;
  cuerpo: unknown;
  /** La cabecera Authorization tal como salió, o null. */
  autorizacion: string | null;
};

export type RespuestaFalsa = { status: number; data?: unknown } | 'sin-conexion';

export function simularApi(responder: (pedido: PedidoFalso) => RespuestaFalsa) {
  const pedidos: PedidoFalso[] = [];
  const original = api.defaults.adapter;

  const adapter: AxiosAdapter = async (config) => {
    const autorizacion = config.headers.get('Authorization');
    const pedido: PedidoFalso = {
      metodo: (config.method ?? 'get').toUpperCase(),
      ruta: config.url ?? '',
      // Para cuando llega aquí, axios ya convirtió el cuerpo a texto JSON.
      cuerpo: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
      autorizacion: typeof autorizacion === 'string' ? autorizacion : null,
    };
    pedidos.push(pedido);

    const respuesta = responder(pedido);
    if (respuesta === 'sin-conexion') {
      // Así falla axios cuando no hay red: un error sin `response`.
      throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
    }

    const completa: AxiosResponse = {
      data: respuesta.data,
      status: respuesta.status,
      statusText: '',
      headers: {},
      config,
    };
    // Un adapter propio tiene que decidir él mismo qué status es error, como hacen los de axios.
    if (respuesta.status >= 200 && respuesta.status < 300) return completa;
    throw new AxiosError(
      `Request failed with status code ${respuesta.status}`,
      AxiosError.ERR_BAD_RESPONSE,
      config,
      null,
      completa,
    );
  };

  api.defaults.adapter = adapter;
  onTestFinished(() => {
    api.defaults.adapter = original;
  });

  return { pedidos };
}

/** El cuerpo de error del backend, con su formato uniforme. */
export function cuerpoError(codigo: string, mensaje: string) {
  return { error: { codigo, mensaje } };
}
