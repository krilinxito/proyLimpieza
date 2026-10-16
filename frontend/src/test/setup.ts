// Añade a `expect` los matchers de DOM (toBeInTheDocument, toHaveTextContent…).
// Vitest lo carga antes de cada archivo de test — ver `setupFiles` en vite.config.ts.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// jsdom conserva el localStorage entre tests del mismo archivo. Sin esto, la sesión que
// guardó un test seguiría adentro en el siguiente (SPEC-KRILINXI-003). Los que corren en
// Node (`// @vitest-environment node`, como el del build de SPEC-KRILINXI-011) no tienen.
afterEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
