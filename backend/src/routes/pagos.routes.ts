// Las rutas solo declaran endpoints y su middleware. Sin lógica.
import { Router } from 'express';
import { postPago } from '../controllers/pagos.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const pagosRouter = Router();

// Cualquier rol cobra: es trabajo del mostrador, y el admin también atiende.
// Solo POST: un pago no se edita ni se borra (ver el controller).
pagosRouter.use(requireAuth);

pagosRouter.post('/', postPago);
