// Las rutas solo declaran endpoints y su middleware. Sin lógica.
import { Router } from 'express';
import { patchCliente, postCliente } from '../controllers/clientes.controller.js';
import { requireAuthDeLaCola } from '../middleware/auth.js';

export const clientesRouter = Router();

// Todo lo de clientes exige sesión. Cualquier rol puede dar de alta y editar:
// es trabajo del mostrador, y el admin también atiende.
// La sesión de la cola del mostrador (SPEC-ALE186-018): acepta un token vencido
// hace hasta 3 días y marca para el admin lo que suba una cuenta dada de baja.
clientesRouter.use(requireAuthDeLaCola);

clientesRouter.post('/', postCliente);
clientesRouter.patch('/:id', patchCliente);
