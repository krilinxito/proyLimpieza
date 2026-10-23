import { useId, useState, type FormEvent } from 'react';
import { Boton } from '../../../components/Boton';
import { CampoTexto } from '../../../components/CampoTexto';
import { ROLES, TEXTO_ROL, type Rol } from '../../../lib/dominio';
import type { Sucursal } from '../../sucursales/types';
import type { Cuenta, DatosAlta, ErroresCuenta, ResultadoCuenta } from '../types';

type Props = {
  /** La que se edita, o null para una nueva. */
  cuenta: Cuenta | null;
  /** Solo las abiertas: a una cerrada no se le asigna personal (SPEC-ALE186-011). */
  sucursales: Sucursal[];
  guardar: (datos: DatosAlta) => Promise<ResultadoCuenta>;
  alTerminar: (resultado: Exclude<ResultadoCuenta, { tipo: 'invalido' }>) => void;
  alCancelar: () => void;
  enLinea: boolean;
};

/** Opciones grandes, todas a la vista (como `ElegirMetodo`): un desplegable obliga a abrirlo. */
function Opciones<T extends string>({
  pregunta,
  opciones,
  valor,
  alElegir,
  error,
}: {
  pregunta: string;
  opciones: { valor: T; texto: string }[];
  valor: T | null;
  alElegir: (valor: T) => void;
  error?: string;
}) {
  const grupo = useId();
  return (
    <fieldset className="mt-4" aria-describedby={error ? `${grupo}-error` : undefined}>
      <legend className="text-xl font-semibold text-texto">{pregunta}</legend>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {opciones.map((o) => (
          <label
            key={o.valor}
            className={`flex min-h-14 items-center gap-3 rounded-lg border-2 px-4 text-xl ${
              valor === o.valor ? 'border-marca bg-marca-suave font-semibold' : 'border-borde bg-superficie'
            }`}
          >
            <input type="radio" name={grupo} className="size-6" checked={valor === o.valor} onChange={() => alElegir(o.valor)} />
            {o.texto}
          </label>
        ))}
      </div>
      {error && (
        <p id={`${grupo}-error`} className="mt-2 text-lg font-semibold text-peligro-texto">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Alta y edición de una cuenta — SPEC-KRILINXI-017. Al editar, el usuario y el rol no se
 * muestran como campos: no se pueden cambiar (SPEC-ALE186-009). El teléfono y la contraseña
 * arrancan vacíos porque no están en la tablet: vacíos, no se cambian.
 */
export function FormularioCuenta({ cuenta, sucursales, guardar, alTerminar, alCancelar, enLinea }: Props) {
  const [datos, setDatos] = useState<DatosAlta>({
    nombreCompleto: cuenta?.nombreCompleto ?? '',
    username: cuenta?.username ?? '',
    password: '',
    rol: cuenta?.rol ?? 'EMPLEADO',
    telefono: '',
    sucursalId: cuenta?.sucursalId ?? null,
  });
  const [errores, setErrores] = useState<ErroresCuenta>({});
  const [guardando, setGuardando] = useState(false);
  const cambiar = (campo: 'nombreCompleto' | 'username' | 'password' | 'telefono') => (valor: string) =>
    setDatos((d) => ({ ...d, [campo]: valor }));
  const titulo = cuenta ? `Cambiar datos de ${cuenta.nombreCompleto}` : 'Cuenta nueva';
  const esEmpleado = datos.rol === 'EMPLEADO';

  async function enviarFormulario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;
    setGuardando(true);
    const resultado = await guardar(datos);
    setGuardando(false);
    if (resultado.tipo === 'invalido') setErrores(resultado.errores);
    else alTerminar(resultado);
  }

  return (
    <form onSubmit={enviarFormulario} noValidate aria-label={titulo} className="mt-6 grid gap-2 rounded-2xl border-2 border-marca bg-superficie p-5 shadow-sm">
      <h2 className="text-2xl font-bold text-texto">{titulo}</h2>
      <CampoTexto
        etiqueta="Nombre y apellido"
        value={datos.nombreCompleto}
        onChange={cambiar('nombreCompleto')}
        error={errores.nombreCompleto}
        autoComplete="off"
        autoFocus
      />
      {cuenta ? (
        <p className="mt-4 text-xl text-texto">
          Entra como «{cuenta.username}» · {TEXTO_ROL[cuenta.rol]}
        </p>
      ) : (
        <>
          <CampoTexto
            etiqueta="Nombre de usuario (con el que va a entrar)"
            value={datos.username}
            onChange={cambiar('username')}
            error={errores.username}
            autoComplete="off"
          />
          <Opciones<Rol>
            pregunta="¿Qué va a hacer?"
            opciones={ROLES.map((r) => ({ valor: r, texto: TEXTO_ROL[r] }))}
            valor={datos.rol}
            alElegir={(rol) => setDatos((d) => ({ ...d, rol }))}
          />
        </>
      )}
      {esEmpleado && (
        <Opciones<string>
          pregunta="¿En qué sucursal trabaja?"
          opciones={sucursales.map((s) => ({ valor: s.id, texto: s.nombre }))}
          valor={datos.sucursalId}
          alElegir={(sucursalId) => setDatos((d) => ({ ...d, sucursalId }))}
          error={errores.sucursalId}
        />
      )}
      <CampoTexto
        etiqueta={cuenta ? 'Teléfono nuevo (déjalo vacío para no cambiarlo)' : 'Teléfono (si lo tiene)'}
        value={datos.telefono}
        onChange={cambiar('telefono')}
        inputMode="tel"
        autoComplete="off"
      />
      <CampoTexto
        etiqueta={cuenta ? 'Contraseña nueva (déjala vacía para no cambiarla)' : 'Contraseña (al menos 8 letras o números)'}
        type="password"
        value={datos.password}
        onChange={cambiar('password')}
        error={errores.password}
        autoComplete="new-password"
      />
      <div className="mt-6 grid gap-3">
        <Boton type="submit" ocupado={guardando} textoOcupado="Guardando…" disabled={!enLinea}>
          Guardar
        </Boton>
        <Boton variante="secundario" onClick={alCancelar} disabled={guardando}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
