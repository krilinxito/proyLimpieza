import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ListaDeRenglones } from './ListaDeRenglones';
import type { RenglonVisto } from '../types';

const renglon = (campos: Partial<RenglonVisto>): RenglonVisto => ({
  id: crypto.randomUUID(),
  momento: 'INGRESO',
  descripcion: 'Camisa',
  cantidad: 200,
  precioUnitario: 1500,
  subtotal: 3000,
  ...campos,
});

describe('Los renglones de una boleta, para leerlos — SPEC-KRILINXI-068', () => {
  it('lista lo que dejó, con cantidad, precio de cada una y subtotal, y los cargos aparte', () => {
    render(
      <ListaDeRenglones
        renglones={[
          renglon({ descripcion: 'Camisa' }),
          renglon({ descripcion: 'Ropa por kilo', cantidad: 250, precioUnitario: 333, subtotal: 833 }),
          renglon({ momento: 'ENTREGA', descripcion: 'Recargo', cantidad: 100, precioUnitario: 500, subtotal: 500 }),
        ]}
      />,
    );

    const dejo = within(screen.getByRole('list', { name: 'Lo que dejó' })).getAllByRole('listitem');
    expect(dejo.map((li) => li.textContent)).toEqual([
      '2 CamisaBs 15,00 cada unaBs 30,00',
      '2,5 Ropa por kiloBs 3,33 cada unaBs 8,33',
    ]);
    const cargos = within(screen.getByRole('list', { name: 'Cargos al entregar' })).getAllByRole('listitem');
    expect(cargos.map((li) => li.textContent)).toEqual(['1 RecargoBs 5,00 cada unaBs 5,00']);
  });

  it('sin cargos no muestra esa lista, y sin renglones no muestra nada', () => {
    const { rerender, container } = render(<ListaDeRenglones renglones={[renglon({})]} />);
    expect(screen.queryByRole('list', { name: 'Cargos al entregar' })).not.toBeInTheDocument();

    rerender(<ListaDeRenglones renglones={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
