// Las rutas solo declaran endpoints y su middleware. Sin lógica.
import { Router } from 'express';
import { postPago } from '../controllers/pagos.controller.js';
import { requireAuthDeLaCola } from '../middleware/auth.js';

export const pagosRouter = Router();

// Cualquier rol cobra: es trabajo del mostrador, y el admin también atiende.
// Solo POST: un pago no se edita ni se borra (ver el controller).
// La sesión de la cola del mostrador (SPEC-ALE186-018): acepta un token vencido
// hace hasta 3 días y marca para el admin lo que suba una cuenta dada de baja.
pagosRouter.use(requireAuthDeLaCola);

pagosRouter.post('/', postPago);
