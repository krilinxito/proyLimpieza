import { useState, type FormEvent, type ReactNode } from 'react';
import { Aviso } from '../../../components/Aviso';
import { Boton } from '../../../components/Boton';
import { CampoTexto, CampoTextoLargo } from '../../../components/CampoTexto';
import { EnlaceBoton } from '../../../components/EnlaceBoton';
import { esMetodoPago } from '../../../lib/dominio';
import { ElegirMetodo } from '../../ordenes/components/ElegirMetodo';
import { prepararCorreccion, type Campo, type ResultadoCorreccion } from '../correccion';
import type { RegistroParaCorregir } from '../types';

const NO_SE_GUARDO = 'No se pudo guardar la corrección. Prueba de nuevo y, si sigue pasando, avísale al encargado.';

type Props = {
  registro: RegistroParaCorregir;
  guardar: (valores: Record<string, string>) => Promise<ResultadoCorreccion>;
  alGuardar: () => void;
  alVolver: () => void;
  /** Algo para mostrar antes del formulario: "Es el mismo cliente" (SPEC-KRILINXI-021). */
  antesDelFormulario?: ReactNode;
};

/** "Trae la boleta" / "No trae la boleta", como en la pantalla de entregar. */
function ElegirRetiro({ value, onChange, error }: { value: string; onChange: (valor: string) => void; error?: string }) {
  return (
    <fieldset className="mt-4" aria-describedby={error ? 'retiro-error' : undefined}>
      <legend className="text-xl font-semibold text-texto">¿El cliente trae la boleta?</legend>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {[
          { valor: 'CON_BOLETA', texto: 'Trae la boleta' },
          { valor: 'SIN_BOLETA', texto: 'No trae la boleta' },
        ].map(({ valor, texto }) => (
          <label
            key={valor}
            className={`flex min-h-14 items-center gap-3 rounded-lg border-2 px-4 text-xl ${
              value === valor ? 'border-marca bg-marca-suave font-semibold' : 'border-borde bg-superficie'
            }`}
          >
            <input type="radio" name="retiro" className="size-6" checked={value === valor} onChange={() => onChange(valor)} />
            {texto}
          </label>
        ))}
      </div>
      {error && (
        <p id="retiro-error" className="mt-2 text-lg font-semibold text-peligro-texto">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Los datos del registro rechazado, para corregirlos y volver a guardarlos —
 * SPEC-KRILINXI-013. Arranca con lo que se había enviado; valida quien guarda
 * (`api/corregirLocal`) y este formulario muestra lo que le contesta, campo por campo.
 */
export function FormularioCorreccion({ registro, guardar, alGuardar, alVolver, antesDelFormulario }: Props) {
  const correccion = prepararCorreccion(registro);
  const [valores, setValores] = useState<Record<string, string>>(correccion.tipo === 'formulario' ? correccion.valores : {});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const encabezado = (
    <>
      <h2 className="mt-6 text-2xl font-bold text-texto">Corregir: {registro.que}</h2>
      <p className="mt-2 text-xl text-peligro-texto">Por qué no se guardó: {registro.mensaje}</p>
    </>
  );

  if (correccion.tipo === 'sin-formulario') {
    return (
      <div>
        {encabezado}
        <p className="mt-4 text-xl text-texto">{correccion.mensaje}</p>
        <div className="mt-6 grid gap-3">
          <EnlaceBoton a="/mostrador">Ir al Mostrador</EnlaceBoton>
          <Boton variante="secundario" onClick={alVolver}>
            Volver a la lista
          </Boton>
        </div>
      </div>
    );
  }

  const cambiar = (clave: string) => (valor: string) => setValores((v) => ({ ...v, [clave]: valor }));
  const sinBoleta = valores.tipo_retiro === 'SIN_BOLETA';

  function campo({ clave, etiqueta, tipo }: Campo) {
    const valor = valores[clave] ?? '';
    if (tipo === 'metodo') {
      return (
        <ElegirMetodo
          key={clave}
          pregunta={etiqueta}
          value={esMetodoPago(valor) ? valor : null}
          onChange={cambiar(clave)}
          error={errores[clave]}
        />
      );
    }
    if (tipo === 'retiro') return <ElegirRetiro key={clave} value={valor} onChange={cambiar(clave)} error={errores[clave]} />;
    // Quién retira solo se pide sin boleta, igual que al entregar.
    if ((clave === 'retirado_por_nombre' || clave === 'retirado_por_carnet') && !sinBoleta) return null;
    // "Qué deja" admite varias líneas, igual que al registrar la ropa (SPEC-KRILINXI-058).
    if (tipo === 'texto-largo') {
      return (
        <CampoTextoLargo key={clave} etiqueta={etiqueta} value={valor} onChange={cambiar(clave)} error={errores[clave]} autoComplete="off" />
      );
    }
    return (
      <CampoTexto
        key={clave}
        etiqueta={etiqueta}
        value={valor}
        onChange={cambiar(clave)}
        error={errores[clave]}
        type={tipo === 'fecha' ? 'date' : 'text'}
        inputMode={tipo === 'monto' ? 'decimal' : undefined}
        autoComplete="off"
      />
    );
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setErrorGeneral(null);
    try {
      const resultado = await guardar(valores);
      if (resultado.tipo === 'guardada') {
        alGuardar();
        return;
      }
      if (resultado.tipo === 'invalida') {
        const { general, ...porCampo } = resultado.errores;
        setErrores(porCampo);
        setErrorGeneral(general ?? null);
      } else {
        setErrorGeneral(resultado.mensaje);
      }
    } catch (error) {
      console.error('No se pudo guardar la corrección en la base local.', error);
      setErrorGeneral(NO_SE_GUARDO);
    }
    setGuardando(false);
  }

  return (
    <form onSubmit={enviar} noValidate aria-label="Corregir el registro" className="grid gap-2">
      {encabezado}
      {antesDelFormulario}
      <p className="mt-2 text-xl text-texto-suave">Corrige lo que está mal y vuelve a guardarlo.</p>
      {correccion.campos.map(campo)}
      {errorGeneral && (
        <div className="mt-4">
          <Aviso tipo="error">{errorGeneral}</Aviso>
        </div>
      )}
      <div className="mt-6 grid gap-3">
        <Boton type="submit" ocupado={guardando} textoOcupado="Guardando…">
          Volver a guardar
        </Boton>
        <Boton variante="secundario" onClick={alVolver} disabled={guardando}>
          Volver a la lista
        </Boton>
      </div>
    </form>
  );
}
