// Registro central de rutas.
//
// Este archivo lo van a tocar todas las specs del backend: cada recurso nuevo
// agrega una línea acá y nada más, en orden alfabético para que el lugar de
// cada una no dependa de quién llegue primero.
import { Router } from 'express';
import { auditoriaRouter } from './auditoria.routes.js';
import { authRouter } from './auth.routes.js';
import { clientesRouter } from './clientes.routes.js';
import { entregasRouter } from './entregas.routes.js';
import { estadisticasRouter } from './estadisticas.routes.js';
import { healthRouter } from './health.routes.js';
import { ordenesRouter } from './ordenes.routes.js';
import { pagosRouter } from './pagos.routes.js';
import { sucursalesRouter } from './sucursales.routes.js';
import { usuariosRouter } from './usuarios.routes.js';

export const apiRouter = Router();

apiRouter.use('/auditoria', auditoriaRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/clientes', clientesRouter);
apiRouter.use('/entregas', entregasRouter);
apiRouter.use('/estadisticas', estadisticasRouter);
apiRouter.use('/health', healthRouter);
apiRouter.use('/ordenes', ordenesRouter);
apiRouter.use('/pagos', pagosRouter);
apiRouter.use('/sucursales', sucursalesRouter);
apiRouter.use('/usuarios', usuariosRouter);
