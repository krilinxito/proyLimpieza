---
id: SPEC-ALE186-001
name: Esqueleto del backend y dependencias
slug: backend-bootstrap
status: finished
owner: ale186
created: 2026-09-08
scope:
  - backend/**
  - package.json
  - .env.example
priority: medium
depends_on: []
tests:
  - backend\tests\http\errores.test.ts
  - backend\tests\http\health.test.ts
  - backend\tests\unit\config.test.ts
  - backend\tests\unit\estructura.test.ts
  - backend\tests\unit\money.test.ts
---

## Descripción

Hoy `backend/` no existe: no hay `package.json` en ninguna parte del repo y `npm test` desde la raiz, que el CLAUDE.md da por hecho, no esta creado. Esta spec deja el backend en el estado minimo desde el que se puede trabajar: arranca, responde, se conecta a Postgres y se puede testear.

Instala las dependencias del stack de la seccion 4 (express, pg sin ORM, jsonwebtoken, bcrypt, cors, dotenv; en desarrollo TypeScript, nodemon/tsx, Vitest y supertest) y crea la estructura MVC estricta de la seccion 5, con las siete carpetas ya presentes aunque esten vacias, para que ninguna spec posterior tenga que inventar donde va cada cosa.

Mas alla del andamiaje, fija tres decisiones que las demas specs del backend van a copiar tal cual:

- **El formato de error uniforme** de la seccion 10, en un middleware centralizado, junto con el 404. El frontend tiene que poder tratar los errores en un solo sitio, y eso solo funciona si el shape se decide una vez y aqui.
- **Como cruza el dinero la frontera de la base.** `pg` devuelve `NUMERIC` como string, y esta bien que lo haga: convertirlo a `Number` es el bug de contabilidad de la seccion 6 esperando su turno. El type-parser queda configurado explicitamente y el helper `money` en `utils/` centraliza parseo, suma y formato en centavos enteros.
- **El registro de rutas**, en `routes/index.ts`, con la ruta de health montada y los `use()` de ordenes, clientes, entregas, pagos, auth y estadisticas previstos. Es el archivo que todas las specs siguientes van a tocar, asi que existe desde el principio en vez de crearse dos veces.

El `package.json` de la raiz entra en el scope por el mismo motivo: es el unico archivo que se comparte con quien hace el frontend. Se crea aqui, con el hueco de `frontend` ya previsto, para que `npm test` desde la raiz corra la suite completa segun crezca.

No entra en esta spec nada de dominio: ni login, ni tablas, ni endpoints de negocio. `GET /api/health` es el unico endpoint, y esta para probar que el pool llega a Postgres.

## Criterios de aceptación

- [ ] npm install en backend/ instala express, pg, jsonwebtoken, bcrypt, cors y dotenv, y npm test desde la raiz ejecuta la suite de Vitest del backend sin errores.
- [ ] npm run dev en backend/ levanta la API en el puerto que indica PORT y recarga en caliente al guardar un archivo.
- [ ] GET /api/health responde 200 con el estado de la conexion cuando Postgres esta arriba, y 503 cuando la base no responde.
- [ ] Una ruta inexistente responde 404 y un error no controlado responde 500, ambos con el mismo shape de error uniforme y sin exponer el stack.
- [ ] tsc --noEmit pasa en modo estricto, y la compilacion falla si se introduce un any explicito.
- [ ] El helper money convierte a centavos enteros el string que devuelve pg para una columna NUMERIC(10,2), y suma y formatea sin usar aritmetica de punto flotante.
- [ ] Existen models/, controllers/, routes/, middleware/, services/, db/ y utils/ dentro de backend/src/, y routes/index.ts monta la ruta de health dejando previstos los use() de los recursos siguientes.
- [ ] El pool de db/ lee DATABASE_URL del entorno y el arranque falla con un mensaje claro si la variable no esta definida.

## Notas

<!--
Convención de trazabilidad: todo test relacionado con esta spec debe llevar su id
en el nombre del describe/bloque, por ejemplo:

    describe('User model — SPEC-001', () => { ... })

Así un `grep SPEC-001` encuentra spec y tests en ambas direcciones, aunque el
campo `tests:` del frontmatter se quede desactualizado.

El campo `tests:` lo rellena /spec-finish automáticamente — no lo edites a mano.
-->
