// Las rutas solo declaran endpoints y su middleware. Sin lógica.
import { Router } from 'express';
import { postEntrega } from '../controllers/entregas.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const entregasRouter = Router();

// Cualquier rol entrega: es trabajo del mostrador, y el admin también atiende.
// Solo POST: una entrega no se edita ni se borra (ver el controller).
entregasRouter.use(requireAuth);

entregasRouter.post('/', postEntrega);
