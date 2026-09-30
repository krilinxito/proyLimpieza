import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Boton } from '../../../components/Boton';
import { CampoTexto } from '../../../components/CampoTexto';
import { useSession } from '../../../hooks/useSession';
import { ErrorApi, ErrorSinConexion } from '../../../lib/api';

const SIN_CONEXION = 'No hay conexión con el servidor. Para entrar hace falta internet.';
const INESPERADO = 'No se pudo entrar. Probá de nuevo y, si sigue pasando, avisale al encargado.';

/** A dónde volver después de entrar: la pantalla que se había pedido, o el inicio. */
function destino(estado: unknown): string {
  if (typeof estado === 'object' && estado !== null && 'desde' in estado && typeof estado.desde === 'string') {
    return estado.desde;
  }
  return '/';
}

function mensajeDe(error: unknown): string {
  if (error instanceof ErrorSinConexion) return SIN_CONEXION;
  // El mensaje del servidor ya está escrito para el mostrador (SPEC-ALE186-002).
  if (error instanceof ErrorApi) return error.message;
  return INESPERADO;
}

export function FormularioIngreso() {
  const { sesion, ingresar } = useSession();
  const navigate = useNavigate();
  const volverA = destino(useLocation().state);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errores, setErrores] = useState<{ username?: string; password?: string }>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Si ya hay alguien adentro, esta pantalla no tiene nada que hacer.
  if (sesion) return <Navigate to={volverA} replace />;

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const faltan = {
      username: username.trim() === '' ? 'Escribí tu usuario.' : undefined,
      password: password === '' ? 'Escribí tu contraseña.' : undefined,
    };
    setErrores(faltan);
    setErrorGeneral(null);
    if (faltan.username || faltan.password) return;

    setEnviando(true);
    try {
      await ingresar(username.trim(), password);
      navigate(volverA, { replace: true });
    } catch (error) {
      setErrorGeneral(mensajeDe(error));
      setEnviando(false);
    }
  }

  return (
    // noValidate: los avisos de campo vacío son los nuestros, en palabras del mostrador,
    // no el globo del navegador que cada uno pinta distinto.
    <form onSubmit={enviar} noValidate className="mt-6 grid gap-2">
      <CampoTexto
        etiqueta="Usuario"
        value={username}
        onChange={setUsername}
        error={errores.username}
        autoComplete="username"
        autoCapitalize="none"
      />
      <CampoTexto
        etiqueta="Contraseña"
        type="password"
        value={password}
        onChange={setPassword}
        error={errores.password}
        autoComplete="current-password"
      />
      {errorGeneral && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-xl text-red-800">
          {errorGeneral}
        </p>
      )}
      <div className="mt-6">
        <Boton type="submit" ocupado={enviando} textoOcupado="Entrando…">
          Entrar
        </Boton>
      </div>
    </form>
  );
}
