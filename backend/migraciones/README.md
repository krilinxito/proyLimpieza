# Migraciones del schema

Desde SPEC-ALE186-019, `context/lavanderia_schema.sql` es la **línea base** y no se
vuelve a editar. Todo cambio al schema es un archivo de esta carpeta.

## Cómo crear una

1. Un archivo nuevo con el número siguiente: `001_agregar_columna_revision.sql`.
   Tres dígitos, guion bajo, minúsculas. Nunca reuses un número ni renombres uno que
   ya se aplicó en alguna base: se anota por su nombre.
2. Adentro, SQL plano. **Sin `BEGIN` ni `COMMIT`**: el runner ya envuelve cada archivo
   en su propia transacción, junto con su anotación.
3. Si mueve datos, escribí el cambio de estructura y la copia de datos en el mismo
   archivo: o pasa todo, o nada.
4. Aplicala: `npm run migrar --workspace backend`.
5. Probala contra la base real (`npm run test:db`): la suite aplica todas las
   migraciones sobre la línea base antes de correr.

Una migración ya aplicada **no se edita**: si estaba mal, se corrige con otra nueva.

## Después de cada `git pull`

```bash
npm run migrar --workspace backend
```

Si te olvidás, el backend no arranca y te dice cuántas faltan.
