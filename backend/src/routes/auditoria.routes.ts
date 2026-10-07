// Las rutas solo declaran endpoints y su middleware. Sin lógica.
import { Router } from 'express';
import { getAuditoria } from '../controllers/auditoria.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRol } from '../middleware/roles.js';

export const auditoriaRouter = Router();

// Quién hizo qué es solo para el administrador (CLAUDE.md, secciones 3 y 7).
auditoriaRouter.use(requireAuth, requireRol('ADMIN'));

auditoriaRouter.get('/', getAuditoria);
