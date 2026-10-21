# hooks/

Hooks transversales, los que no pertenecen a una sola feature: `useOnline`, `useSession`, `useTema`
(SPEC-KRILINXI-030), y los de paginación de SPEC-KRILINXI-041: `useTamanoDePagina` (cuántas filas entran en
esta pantalla), `usePaginado` (parte una lista que ya está en memoria) y `usePagina` (la página elegida, para las
listas que pagina la API). Toda lista que puede crecer se pagina con ellos; ver `components/README.md`.
Los que sí pertenecen a una feature viven dentro de ella.
