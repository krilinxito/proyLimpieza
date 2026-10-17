import { Icono } from '../../../components/iconos';
import { FormularioIngreso } from './FormularioIngreso';

/**
 * La pantalla de ingreso — SPEC-KRILINXI-024: una sola tarjeta, centrada, con el nombre del
 * negocio arriba. Es lo primero que ve alguien en una tablet nueva, y no tiene otra cosa que
 * hacer más que entrar: nada compite con el formulario.
 */
export function PantallaIngreso() {
  return (
    <div className="flex justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-borde-suave bg-superficie p-6 shadow-lg sm:p-8">
        <p className="flex items-center gap-3 text-xl font-bold text-marca">
          <span className="rounded-xl bg-marca-suave p-2">
            <Icono nombre="ropa" tamano="size-8" />
          </span>
          Lavandería
        </p>
        <h1 className="mt-6 text-3xl font-bold text-texto">Ingresar al sistema</h1>
        <FormularioIngreso />
      </div>
    </div>
  );
}
