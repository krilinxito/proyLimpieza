// Las rutas solo declaran endpoints y su middleware. Sin lógica.
import { Router } from 'express';
import { getHealth } from '../controllers/health.controller.js';

export const healthRouter = Router();

healthRouter.get('/', getHealth);
