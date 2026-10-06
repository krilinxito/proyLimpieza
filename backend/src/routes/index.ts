// Registro central de rutas.
//
// Este archivo lo van a tocar todas las specs del backend: cada recurso nuevo
// agrega una línea acá y nada más. Los `use()` comentados marcan el sitio que
// le toca a cada uno, para que el orden no dependa de quién llegue primero.
import { Router } from 'express';
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

apiRouter.use('/auth', authRouter);
apiRouter.use('/clientes', clientesRouter);
apiRouter.use('/entregas', entregasRouter);
apiRouter.use('/estadisticas', estadisticasRouter);
apiRouter.use('/health', healthRouter);
apiRouter.use('/ordenes', ordenesRouter);
apiRouter.use('/pagos', pagosRouter);
apiRouter.use('/sucursales', sucursalesRouter);
apiRouter.use('/usuarios', usuariosRouter);

// Pendientes, en el orden del flujo del negocio (CLAUDE.md, sección 3).
// Descomentar en la spec que implemente cada uno:
//
// apiRouter.use('/auditoria', auditoriaRouter);        // SPEC del dashboard
