// Las rutas solo declaran endpoints y su middleware. Sin lógica.
import { Router } from 'express';
import {
  getClientes,
  getIngresos,
  getProductividad,
  getSaldos,
  getSinRecoger,
  getVolumen,
} from '../controllers/estadisticas.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRol } from '../middleware/roles.js';

export const estadisticasRouter = Router();

// Solo el ADMIN (CLAUDE.md, sección 8). Se exige acá, en el servidor: esconder el
// botón en la pantalla no es control de acceso.
estadisticasRouter.use(requireAuth, requireRol('ADMIN'));

estadisticasRouter.get('/ingresos', getIngresos);
estadisticasRouter.get('/saldos', getSaldos);
estadisticasRouter.get('/sin-recoger', getSinRecoger);
estadisticasRouter.get('/volumen', getVolumen);
estadisticasRouter.get('/productividad', getProductividad);
estadisticasRouter.get('/clientes', getClientes);
