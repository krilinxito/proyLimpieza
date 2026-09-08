// Registro central de rutas.
//
// Este archivo lo van a tocar todas las specs del backend: cada recurso nuevo
// agrega una línea acá y nada más. Los `use()` comentados marcan el sitio que
// le toca a cada uno, para que el orden no dependa de quién llegue primero.
import { Router } from 'express';
import { healthRouter } from './health.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);

// Pendientes, en el orden del flujo del negocio (CLAUDE.md, sección 3).
// Descomentar en la spec que implemente cada uno:
//
// apiRouter.use('/auth', authRouter);                  // SPEC de autenticación
// apiRouter.use('/clientes', clientesRouter);          // SPEC de clientes
// apiRouter.use('/ordenes', ordenesRouter);            // SPEC de órdenes
// apiRouter.use('/entregas', entregasRouter);          // SPEC de entregas
// apiRouter.use('/pagos', pagosRouter);                // SPEC de pagos
// apiRouter.use('/estadisticas', estadisticasRouter);  // SPEC del dashboard
// apiRouter.use('/auditoria', auditoriaRouter);        // SPEC del dashboard
