---
id: SPEC-ALE186-016
spec: specs/SPEC-ALE186-016-login-limite-intentos.md
explica:
  - estado de modulo que sobrevive entre tests
  - fuerza bruta y limite de intentos
---

# SPEC-ALE186-016 — Límite de intentos en el login

## Qué se construyó

Después de 5 intentos fallidos seguidos con el mismo nombre de usuario, ese usuario no
puede entrar durante 5 minutos, ni siquiera con la contraseña correcta. La pantalla
muestra "Hubo demasiados intentos con este usuario. Esperá 5 minutos y volvé a probar",
sin que el frontend haya cambiado. Los números son cortos porque quien se equivoca
casi siempre es una persona del mostrador, no un atacante.

## Cómo funciona, paso a paso

María se equivoca 5 veces. Al sexto intento escribe bien su contraseña.

1. **El controller lee las credenciales** (`backend/src/controllers/auth.controller.ts`). Si
   falta el usuario o la contraseña, sale con 400 sin contar nada.
2. **Pregunta si está bloqueada, antes de tocar la base** (`:92`):
   `limitadorLogin.segundosDeBloqueo('maria')` devuelve 300. El controller pone la
   cabecera `Retry-After: 300` (`:94`) y lanza el 429 armado por `demasiadosIntentos`
   (`:74`). No se buscó a María en la base ni se comparó su contraseña: el bloqueo no
   gasta bcrypt ni consultas.
3. **Cómo se llegó a eso.** Cada uno de los 5 intentos anteriores pasó por la base,
   falló la contraseña y llamó `registrarFallo('maria')` (`:101`). En el quinto, el
   servicio (`backend/src/services/limiteLogin.ts`) marcó
   `bloqueadoHasta = ahora + 5 minutos`. Una cuenta dada de baja también suma un fallo
   (`:111`), aunque la contraseña sea la buena.
4. **A los 5 minutos,** `segundosDeBloqueo` encuentra que `bloqueadoHasta` ya pasó, borra
   la entrada y devuelve `null`: María tiene otros 5 intentos. Si entra bien,
   `registrarExito` (`:115`) borra su contador.

## Dónde encaja en la arquitectura

- **Es el primer archivo de `services/`.** §5 lo define como "lógica de negocio que no
  cabe en un solo model": esto no es de ninguna tabla, es una regla sobre el login. El
  controller lo usa como usa un model, pero el servicio no habla con la base.
- **`crearLimitador` recibe el reloj** (`limiteLogin.ts:50`). En producción es
  `Date.now`, el reloj del proceso, y no `now()` de Postgres como en la 015, porque acá
  solo se miden intervalos dentro del mismo servidor. Que el reloj entre como parámetro
  es lo que permite probar 5 minutos sin esperarlos.
- **`limitadorLogin` es uno solo para todo el proceso** (`:105`). Es la forma más simple
  de que todas las peticiones compartan el contador, y es también la razón de su límite
  (CLAUDE.md §13): con dos instancias del backend habría dos contadores.

## Fundamentos

**Fuerza bruta y límite de intentos.** Atacar un login por fuerza bruta es probar
contraseñas una tras otra hasta acertar. bcrypt lo hace lento, unos 100 ms por intento,
pero eso no alcanza: son unas 36.000 pruebas por hora, y las contraseñas de un mostrador
suelen ser cortas. El límite cambia la cuenta: con 5 intentos cada 5 minutos son 60 por
hora. Hay tres decisiones que todo límite tiene que tomar, y acá se tomaron así:
- **Sobre qué se cuenta.** Acá, el nombre de usuario. Contar por IP frenaría a quien prueba
  muchos usuarios desde un lugar, pero en un local donde todas las tablets salen por el
  mismo wifi bloquearía a toda la sucursal por los errores de una persona.
- **Qué pasa con los nombres que no existen.** Se cuentan igual. Si no, un 429 confirmaría
  que el nombre es real.
- **Qué se paga.** Alguien que sepa el nombre de un empleado puede bloquearlo a propósito.
  Con 5 minutos, ese daño es chico.

**Estado de módulo que sobrevive entre tests.** `limitadorLogin` se crea una vez, cuando se
importa el archivo, y vive mientras dure el proceso. Vitest corre todos los tests de un
archivo en el mismo proceso, así que ese objeto es **el mismo** para todos ellos. Los tests
del login hacen fallos con el mismo usuario (`maria`): sin cuidado, los fallos de un test
se sumarían a los del siguiente, y un test que no tiene nada que ver con el límite
terminaría con un 429 inexplicable, que encima depende del orden en que corren. Por eso el
servicio tiene `reiniciar()`, y `auth.test.ts` y `usuarios.test.ts` lo llaman en un
`beforeEach`. La regla general: si un módulo guarda estado propio, sus tests tienen que
poder volver a cero. Los tests de `tests/db` no lo necesitan porque cada uno crea un
usuario con nombre único.

**Ya explicado antes:**

- **Inversión de dependencia** → SPEC-KRILINXI-003 (`specs/notas/SPEC-KRILINXI-003-sesion-login.md`): el reloj que se pasa a `crearLimitador`.
- **Enumeración de usuarios** → SPEC-ALE186-002 (`specs/notas/SPEC-ALE186-002-auth-backend.md`): por qué se bloquean también los nombres que no existen.
- **Hash de contraseña con bcrypt** → SPEC-ALE186-002.
- **Formato de error uniforme** → SPEC-ALE186-001: por qué el frontend muestra el 429 sin cambiar nada.

## Decisiones y por qué

- **La memoria se limpia sola** (`olvidarViejas`, `limiteLogin.ts:60`). Recorre las entradas
  en cada consulta y borra las que no tienen bloqueo vigente ni fallos en los últimos 5
  minutos. Sin esto, probar miles de nombres inventados dejaría miles de entradas para
  siempre. Recorrer en cada consulta es barato porque solo sobrevive la actividad reciente.
- **`Retry-After` va en segundos redondeados hacia arriba.** Así, a los 4:59 dice 1 y no 0.

## Los tests

- **El servicio, con un reloj manual** (`tests/unit/limiteLogin.test.ts`): `conReloj()` crea
  un limitador con un `t` que el test avanza a mano. Así se prueba que a los 4:59.999 falta
  1 segundo y a los 5:00 libera, y que 1000 nombres inventados desaparecen a los 5 minutos.
- **Por HTTP, con `vi.useFakeTimers({ toFake: ['Date'] })`:** el mismo recurso que ya usaba
  `estadisticas.test.ts` para "hoy". Como el limitador usa `Date.now` por defecto, el reloj
  falso de Vitest lo alcanza sin inyectar nada.
- **`reiniciar()` en el `beforeEach`** de los dos archivos de tests HTTP que hacen login.
  Cualquier test HTTP nuevo que haga logins fallidos con un nombre repetido tiene que
  hacer lo mismo.
