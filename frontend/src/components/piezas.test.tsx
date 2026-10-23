import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Aviso, type TipoAviso } from './Aviso';
import { Insignia, type TonoInsignia } from './Insignia';
import { BotonAtras } from './BotonAtras';
import { Paginas } from './Paginas';
import { ESTILO_TARJETA, SenalTocable, Tarjeta } from './Tarjeta';

describe('Aviso — SPEC-KRILINXI-022', () => {
  it.each<[TipoAviso, 'alert' | 'status']>([
    ['error', 'alert'],
    ['advertencia', 'alert'],
    ['informacion', 'status'],
    ['exito', 'status'],
  ])('el de %s usa role="%s" y dice su texto', (tipo, rol) => {
    render(<Aviso tipo={tipo}>No se pudo guardar. Prueba de nuevo.</Aviso>);
    expect(screen.getByRole(rol)).toHaveTextContent('No se pudo guardar. Prueba de nuevo.');
  });

  it('el ícono es decorativo: lo que se lee es el texto', () => {
    render(<Aviso tipo="error">Ese teléfono ya está usado.</Aviso>);
    const aviso = screen.getByRole('alert');
    expect(aviso.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(aviso).toHaveAccessibleName('');
  });

  it('cada tipo tiene su tono', () => {
    render(
      <>
        <Aviso tipo="error">Mal</Aviso>
        <Aviso tipo="exito">Bien</Aviso>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveClass('bg-peligro-fondo', 'text-peligro-texto');
    expect(screen.getByRole('status')).toHaveClass('bg-exito-fondo', 'text-exito-texto');
  });
});

describe('Tarjeta — SPEC-KRILINXI-022', () => {
  it('con título es una sección con ese nombre y su encabezado', () => {
    render(
      <Tarjeta titulo="Datos del cliente">
        <p>Rosa Quispe</p>
      </Tarjeta>,
    );
    const seccion = screen.getByRole('region', { name: 'Datos del cliente' });
    expect(seccion).toHaveTextContent('Rosa Quispe');
    expect(screen.getByRole('heading', { name: 'Datos del cliente' })).toBeInTheDocument();
  });

  it('dentro de otra sección, el título puede ser un h3 (SPEC-KRILINXI-025)', () => {
    render(
      <Tarjeta titulo="Cuentas" nivel={3}>
        <p>Bs 30,00</p>
      </Tarjeta>,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Cuentas' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Cuentas' })).toBeInTheDocument();
  });

  it('sin título es solo un recuadro, sin sección que anunciar', () => {
    render(
      <Tarjeta>
        <p>Rosa Quispe</p>
      </Tarjeta>,
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.getByText('Rosa Quispe').parentElement).toHaveClass('bg-superficie');
  });
});

describe('Insignia — SPEC-KRILINXI-022', () => {
  it.each<[TonoInsignia, string]>([
    ['neutro', 'bg-fondo'],
    ['informacion', 'bg-info-fondo'],
    ['exito', 'bg-exito-fondo'],
    ['advertencia', 'bg-advertencia-fondo'],
    ['peligro', 'bg-peligro-fondo'],
  ])('con tono %s se pinta con su fondo y el texto siempre está', (tono, fondo) => {
    render(<Insignia tono={tono}>Lista para entregar</Insignia>);
    expect(screen.getByText('Lista para entregar')).toHaveClass(fondo);
  });
});

describe('Tarjeta: la que informa, la que destaca y la que se toca — SPEC-KRILINXI-037', () => {
  it('por defecto informa: liviana, sin sombra', () => {
    render(<Tarjeta titulo="Pagos">Todavía no pagó nada.</Tarjeta>);
    const tarjeta = screen.getByRole('region', { name: 'Pagos' });
    expect(tarjeta).toHaveClass('bg-superficie', 'border-borde-suave');
    expect(tarjeta.className).not.toMatch(/shadow/);
  });

  it('la que destaca un número va sobre el color suave de la marca, con su borde completo (SPEC-KRILINXI-052)', () => {
    render(
      <Tarjeta titulo="Cobrado hoy" tipo="destaca">
        Bs 120,00
      </Tarjeta>,
    );
    expect(screen.getByRole('region', { name: 'Cobrado hoy' })).toHaveClass('bg-marca-suave', 'border-2', 'border-marca');
    // Sin franja de un solo lado: se distingue por el fondo y el borde entero.
    expect(screen.getByRole('region', { name: 'Cobrado hoy' }).className).not.toMatch(/border-l-/);
  });

  it('las tres se distinguen por su forma, no solo por el color', () => {
    // Borde fino / franja gruesa / borde doble con sombra: lo que queda si se le quita el color.
    const forma = (clases: string) => clases.split(' ').filter((c) => /^(border(-2|-l-8)?|shadow-md)$/.test(c)).join(' ');
    const formas = Object.values(ESTILO_TARJETA).map(forma);
    expect(new Set(formas).size).toBe(3);
  });

  it('la señal de que se toca es una flecha decorativa: el nombre lo pone el texto de la tarjeta', () => {
    render(
      <button type="button" className={ESTILO_TARJETA.toca}>
        Boleta 001234
        <SenalTocable />
      </button>,
    );
    const boton = screen.getByRole('button', { name: 'Boleta 001234' });
    expect(boton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Paginas en un solo bloque — SPEC-KRILINXI-054', () => {
  it('los dos botones y el texto van juntos en un solo recuadro, dentro de una sola barra', () => {
    render(<Paginas pagina={2} total={25} porPagina={10} irAPagina={() => undefined} nombre="Páginas de prueba" />);
    const barra = screen.getByRole('navigation', { name: 'Páginas de prueba' });

    // Un solo nav, y un solo recuadro adentro con todo: nada suelto al lado.
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(barra.children).toHaveLength(1);
    const bloque = within(barra.firstElementChild as HTMLElement);
    expect(bloque.getByRole('button', { name: 'Anteriores' })).toBeInTheDocument();
    expect(bloque.getByText('Página 2 de 3')).toBeInTheDocument();
    expect(bloque.getByRole('button', { name: 'Siguientes' })).toBeInTheDocument();
  });

  it('es más chico que antes: botones compactos (48px, de dedo) y letra de renglón', () => {
    render(<Paginas pagina={1} total={25} porPagina={10} irAPagina={() => undefined} nombre="Páginas de prueba" />);
    for (const nombre of ['Anteriores', 'Siguientes']) {
      expect(screen.getByRole('button', { name: nombre })).toHaveClass('min-h-12', 'text-lg');
    }
    expect(screen.getByText('Página 1 de 3')).toHaveClass('text-lg');
  });

  it('con todo en una página sigue diciendo "Página 1 de 1", con los dos botones apagados', () => {
    render(<Paginas pagina={1} total={3} porPagina={10} irAPagina={() => undefined} nombre="Páginas de prueba" />);
    expect(screen.getByText('Página 1 de 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anteriores' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguientes' })).toBeDisabled();
  });

  it('con la lista vacía no se dibuja, y los botones llaman a irAPagina con la página vecina', () => {
    const { container } = render(<Paginas pagina={1} total={0} porPagina={10} irAPagina={() => undefined} nombre="Vacía" />);
    expect(container).toBeEmptyDOMElement();

    const visitadas: number[] = [];
    render(<Paginas pagina={2} total={25} porPagina={10} irAPagina={(p) => visitadas.push(p)} nombre="Con páginas" />);
    fireEvent.click(screen.getByRole('button', { name: 'Anteriores' }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguientes' }));
    expect(visitadas).toEqual([1, 3]);
  });
});

describe('BotonAtras: la flechita de volver — SPEC-KRILINXI-057', () => {
  it('es un botón sin texto visible, con su nombre para el lector de pantalla y al pasar el mouse', () => {
    render(<BotonAtras nombre="Volver al mostrador" alTocar={() => undefined} />);
    const boton = screen.getByRole('button', { name: 'Volver al mostrador' });

    expect(boton.textContent).toBe('');
    expect(boton).toHaveAttribute('title', 'Volver al mostrador');
    expect(boton).toHaveAttribute('type', 'button');
    // El ícono es decorativo: el que habla es el aria-label.
    expect(boton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('chico a la vista pero de dedo (48px), con borde para que se note que es un botón, y pinta con el tema', () => {
    render(<BotonAtras nombre="Volver" alTocar={() => undefined} />);
    const boton = screen.getByRole('button', { name: 'Volver' });

    expect(boton).toHaveClass('size-12', 'border-2', 'border-borde', 'bg-superficie');
    expect(boton.className).toContain('focus-visible:outline-foco');
  });

  it('en pantalla ancha sale al hueco de la izquierda del contenido, a la altura del título; en angosta, arriba, en su renglón', () => {
    render(<BotonAtras nombre="Volver" alTocar={() => undefined} />);
    const lugar = screen.getByRole('button', { name: 'Volver' }).parentElement;

    // jsdom no mide: se comprueba con qué clases se armó. Sin ellas (angosta) queda en el flujo, con aire debajo.
    expect(lugar).toHaveClass('mb-4');
    expect(lugar).toHaveClass('min-[1200px]:absolute', 'min-[1200px]:top-6', 'min-[1200px]:-left-16', 'min-[1200px]:mb-0');
  });

  it('al tocarlo avisa', () => {
    let veces = 0;
    render(<BotonAtras nombre="Volver" alTocar={() => (veces += 1)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(veces).toBe(1);
  });
});
