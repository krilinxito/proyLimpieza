// Las rutas solo declaran endpoints y su middleware. Sin lógica.
import { Router } from 'express';
import { postEntrega } from '../controllers/entregas.controller.js';
import { requireAuthDeLaCola } from '../middleware/auth.js';

export const entregasRouter = Router();

// Cualquier rol entrega: es trabajo del mostrador, y el admin también atiende.
// Solo POST: una entrega no se edita ni se borra (ver el controller).
// La sesión de la cola del mostrador (SPEC-ALE186-018): acepta un token vencido
// hace hasta 3 días y marca para el admin lo que suba una cuenta dada de baja.
entregasRouter.use(requireAuthDeLaCola);

entregasRouter.post('/', postEntrega);
