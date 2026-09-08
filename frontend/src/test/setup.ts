// Añade a `expect` los matchers de DOM (toBeInTheDocument, toHaveTextContent…).
// Vitest lo carga antes de cada archivo de test — ver `setupFiles` en vite.config.ts.
import '@testing-library/jest-dom/vitest';
