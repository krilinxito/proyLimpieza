# features/

Una carpeta por área del negocio (`ordenes/`, `clientes/`, `entregas/`, `pagos/`, `auth/`,
`estadisticas/`), cada una con sus `components/`, `hooks/`, `api/` y `types.ts`.

Ningún componente llama a axios ni consulta PowerSync directamente: pasa por
`features/<x>/api` o por un hook (CLAUDE.md §5).
