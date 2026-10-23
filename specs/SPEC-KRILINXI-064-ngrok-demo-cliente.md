---
id: SPEC-KRILINXI-064
name: Demo para el cliente con un solo túnel de ngrok
slug: ngrok-demo-cliente
status: in-progress
owner: krilinxito
created: 2026-10-23
scope:
  - frontend/vite.config.ts
  - package.json
  - scripts/demo/**
  - .env.example
  - CLAUDE.md
  - frontend/src/pwa/**
  - frontend/src/lib/env.ts
priority: high
depends_on: []
tests: []
---

## Descripción

Antes de hostear la app, el cliente tiene que poder probarla desde su propio equipo o celular. Se hará con ngrok, con UN solo túnel: el servidor que sirve la app compilada (`vite preview`) también reenvía `/api` al backend (:4000) y la sincronización a PowerSync (:8080), así el cliente ve una única dirección pública HTTPS. Con el mismo origen no hay CORS que abrir, la política de seguridad del contenido sigue siendo `'self'` y la PWA puede instalarse y abrir sin internet (necesita HTTPS). Se entrega un comando (por ejemplo `npm run demo`) que compila con la dirección pública, levanta el proxy y dice cómo abrir ngrok; una guía paso a paso en CLAUDE.md para instalar y usar ngrok; y tests de lo que se puede probar sin ngrok. Queda para la implementación comprobar a mano, con ngrok de verdad, tres riesgos que no se pueden saber desde acá: que la página de aviso del plan gratuito de ngrok no rompa los pedidos de la app, que la sincronización por HTTP en streaming de PowerSync atraviese el túnel, y cuántos túneles permite el plan que se tenga. Es una demo con datos de prueba, no un hosting: la guía debe decir que se corre con una sucursal y un admin de demostración, con contraseña propia, y que se apaga al terminar.

## Criterios de aceptación

- [ ] Un solo comando (`npm run demo`) compila el frontend con la dirección pública indicada y levanta el servidor de la app compilada; sin esa dirección, falla con un mensaje en español que dice qué falta, en vez de compilar una app que apunta a localhost.
- [ ] El servidor de la demo reenvía `/api/*` al backend y la ruta de sincronización a PowerSync, de modo que desde el navegador la app, la API y PowerSync comparten un solo origen; un test levanta el proxy contra servidores falsos y comprueba que cada ruta llega a su destino con sus cabeceras y su cuerpo.
- [ ] El servidor de la demo acepta el nombre de dominio de ngrok como host permitido (sin abrirlo a cualquier host), y una petición con otro host se rechaza.
- [ ] La política de seguridad del contenido de la app compilada para la demo sigue siendo `'self'` más la dirección pública, sin aflojar ninguna directiva; un test compara las directivas con las del build normal.
- [ ] El backend arranca y acepta pedidos del navegador con la dirección pública en `CORS_ORIGENES` (o no necesita ninguna por ser el mismo origen), y esto queda documentado y comprobado.
- [ ] Hay una guía en CLAUDE.md, en español y sin voseo, que dice cómo instalar ngrok en Windows, cómo autenticarlo, qué comando correr, cómo abrir la dirección en el celular, qué datos de demostración crear (sucursal y admin con contraseña propia) y cómo apagar todo; y `.env.example` documenta las variables nuevas.
- [ ] Probado a mano con ngrok real y anotado en la bitácora: la app abre por la dirección pública, se puede entrar, registrar ropa, cobrar y entregar, sincroniza, y después de la primera visita abre sin internet; si la página de aviso del plan gratuito rompe algún pedido, queda resuelto o escrito cómo evitarlo.
- [ ] Tests con el id de esta spec, sin jerga en pantalla, y la suite completa en verde.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-KRILINXI-064', () => { ... })

Así un `grep SPEC-KRILINXI-064` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
