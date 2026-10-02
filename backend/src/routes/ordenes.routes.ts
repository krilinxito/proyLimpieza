// Las rutas solo declaran endpoints y su middleware. Sin lógica.
import { Router } from 'express';
import { patchOrden, postOrden } from '../controllers/ordenes.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const ordenesRouter = Router();

// Todo lo de órdenes exige sesión. Cualquier rol registra y edita: es trabajo
// del mostrador, y el admin también atiende. Qué sucursal puede tocar cada uno
// lo decide el controller, porque depende del rol y no solo de tenerlo.
ordenesRouter.use(requireAuth);

ordenesRouter.post('/', postOrden);
ordenesRouter.patch('/:id', patchOrden);
