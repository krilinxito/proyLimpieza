import { useInstalarApp } from '../hooks/useInstalarApp';
import { Boton } from './Boton';
import { Tarjeta } from './Tarjeta';

/**
 * Ofrece instalar la app en el celular — SPEC-KRILINXI-059. Solo aparece cuando hay algo que ofrecer:
 *
 *  - donde el navegador lo permite (Chrome y Edge): un botón "Instalar en este celular", que muestra el cartel del propio
 *    navegador. Al instalarse, el aviso desaparece;
 *  - en iPhone y iPad (Safari no deja instalar desde un botón): los dos pasos del propio Safari, en palabras;
 *  - si la app ya está instalada, o el navegador no ofrece nada: no aparece. Un botón que no hace nada es peor que ninguno.
 *
 * El botón es secundario: la acción principal de cada pantalla sigue siendo una sola (SPEC-KRILINXI-037), y instalar no es lo
 * que se vino a hacer al mostrador. El texto va en palabras del negocio, sin "PWA" ni "instalar aplicación".
 */
export function AvisoInstalar() {
  const { estado, instalar, descartar } = useInstalarApp();
  if (estado === 'nada') return null;

  return (
    <div className="mt-6">
      <Tarjeta titulo="Instalar la app">
        {estado === 'se-puede' ? (
          <p className="text-xl text-texto">Ponla en la pantalla de inicio del celular para abrirla como cualquier otra app, también sin internet.</p>
        ) : (
          <>
            <p className="text-xl text-texto">Para tenerla en la pantalla de inicio de este iPhone, en Safari:</p>
            <ol className="mt-3 grid list-decimal gap-2 pl-7 text-xl text-texto">
              <li>Toca el botón <strong>Compartir</strong>, el cuadrado con una flecha hacia arriba, abajo en la pantalla.</li>
              <li>Elige <strong>«Agregar a pantalla de inicio»</strong>.</li>
            </ol>
          </>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {estado === 'se-puede' && (
            <div className="w-auto">
              <Boton variante="secundario" onClick={instalar}>
                Instalar en este celular
              </Boton>
            </div>
          )}
          <div className="w-auto">
            <Boton variante="secundario" tamano="compacto" onClick={descartar}>
              Ahora no
            </Boton>
          </div>
        </div>
      </Tarjeta>
    </div>
  );
}
