// El criterio 5 de SPEC-ALE186-001 pide que un `any` explícito rompa la verificación.
// `tsc` no tiene ninguna opción para eso —`strict` impide que el compilador
// INFIERA `any`, pero no que alguien lo escriba a mano—, así que esa mitad de
// la regla la sostiene ESLint. Las dos cosas juntas son `npm run check`.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Sección 10: «Nada de any. Si el tipo no se sabe, unknown y se estrecha.»
      '@typescript-eslint/no-explicit-any': 'error',
      // Los parámetros que Express exige pero no usamos se marcan con `_`.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
