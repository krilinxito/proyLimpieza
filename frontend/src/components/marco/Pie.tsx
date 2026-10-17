type Props = {
  lugar?: string | null;
  /** La de `frontend/package.json`. Sirve cuando alguien llama por un problema. */
  version: string;
};

/**
 * Abajo de todo, chico a propósito — SPEC-KRILINXI-023. En una tablet de mostrador cada
 * centímetro de alto es pantalla útil: dónde se está y qué versión tiene la tablet, nada más.
 */
export function Pie({ lugar, version }: Props) {
  return (
    <footer className="border-t border-borde-suave bg-superficie px-4 py-3 text-lg text-texto-suave lg:px-6">
      {lugar ? `${lugar} · ` : ''}Versión {version}
    </footer>
  );
}
