---
id: SPEC-KRILINXI-061
spec: specs/SPEC-KRILINXI-061-clientes-recientes.md
explica: []
---

# SPEC-KRILINXI-061 — Clientes: los últimos 20 y sus boletas

## Qué se construyó

Al abrir Clientes ya no hay una pantalla vacía esperando una búsqueda: se ven los clientes que vinieron hace menos, con los más recientes primero y páginas para el resto. Cada uno tiene "Ver sus boletas", que lleva a una página con todas sus boletas de la sucursal.

## Cómo funciona, paso a paso

Un caso: la empleada abre `/clientes` sin internet.

1. `PantallaClientes` (`features/clientes/components/PantallaClientes.tsx`) está en el paso `inicio` y no hay nada escrito en el buscador, así que monta `ListaDeRecientes`.
2. `useClientesRecientes` lee la base local con `listarRecientes` (`features/clientes/api/clientesLocal.ts`). Es **una sola consulta**: cada cliente con un `LEFT JOIN` a la fecha de su última boleta (`MAX(datetime(fecha_entrada))`), ordenados por esa fecha, con los que no tienen boleta al final y desempate por alta, nombre e id.
3. La lista se parte con `usePaginado` (del tamaño de la pantalla: 20 en una ancha) y se dibuja con `Paginas`. `observarEstado` la vuelve a leer si algo cambia en la base.
4. Si escribe en el buscador, `BuscadorVivo` avisa (`alCambiarEscrito`) y la lista se esconde para dejar paso a los resultados; si vacía el campo, vuelve.
5. "Ver sus boletas" lleva a `/clientes/boletas?cliente=<id>` (`BoletasDelCliente`). `listarBoletasDelCliente` (`features/historial/api/historialLocal.ts`) reusa `SELECT_ORDENES` y `armar`, así el estado y el saldo son los mismos que en el Mostrador, y cada fila (`FilaDeBoleta`) lleva al Mostrador.

## Dónde encaja en la arquitectura

Todo es lectura de la base local, sin la API (CLAUDE.md §6): el SQL vive en `api/`, un hook lo pone al alcance y el componente solo dibuja. Las boletas del cliente quedaron en la feature `historial` porque reusan su fila y su armado; la ruta es del mostrador (`mostrador: true`) porque muestra la ropa de la sucursal de trabajo.

## Decisiones y por qué

- **Una consulta y paginar en memoria** (como el historial local), en vez de `LIMIT/OFFSET` más un conteo: el orden total (con `id` de desempate) ya garantiza que la paginación no repite ni salta a nadie, y la lista de clientes es liviana.
- **`datetime()` en el `ORDER BY`**: `fecha_entrada` se guarda en dos formatos (ISO con `Z` y sin zona, ver `instanteGuardado`), y como texto `T` ordena distinto que un espacio. `datetime()` los lleva a la misma forma. Hay un test con los dos formatos.
- **Tamaño de página**: la spec dice "20", pero §9 manda que dependa del ancho (6, 10 o 20). En una pantalla ancha son 20.
- **Se tocó `BuscadorVivo`** con una prop opcional (`alCambiarEscrito`), fuera de las carpetas de la spec: era la forma de que sus resultados "reemplacen" a la lista sin que Clientes lea el campo por dentro.
- **"Ver sus boletas" solo con sucursal de trabajo**: un ADMIN que no atiende no tiene esas boletas en su tablet.
- **Ruta con parámetro de consulta, no `/clientes/:id/boletas`**: el registro de rutas busca por camino exacto (el título de la pestaña) y ninguna otra ruta lleva parámetros en el camino.

## Los tests

`ClientesRecientes.test.tsx`: la consulta con la base real de Node (orden, formatos de fecha mezclados, estabilidad) y la pantalla completa con la App (paginación, buscador, "Ver datos", enlace, boletas de otra sucursal, sin pedidos a la API). Reusa `baseLocalDePrueba`, `clienteDePrueba`, `ordenDePrueba` y `conAnchoDePantalla`. Las dos listas nuevas se declararon en `PAGINAN` de `arquitectura.test.ts`, que obliga a decidir cómo se pagina cada lista.

## Si mañana tenés que tocar esto

Si la tabla de clientes crece a decenas de miles, `listarRecientes` lee todo: el cambio sería paginar en SQL (con el mismo `ORDER BY`).
