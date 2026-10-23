---
id: SPEC-KRILINXI-053
spec: specs/SPEC-KRILINXI-053-textos-tuteo.md
explica: []
---

# SPEC-KRILINXI-053 — Textos en tuteo neutro, sin voseo

## Qué se construyó

Todos los textos que ve la persona pasaron del voseo argentino ("Elegí", "Probá", "Revisá", "Volvé") al tuteo neutro ("Elige", "Prueba",
"Revisa", "Vuelve"): las etiquetas y avisos de la pantalla y los mensajes de error de la API, que la pantalla muestra tal cual. Un test
impide que el voseo vuelva a entrar.

## Cómo funciona, paso a paso

Un mismo mensaje cruza las dos capas, y por eso había que cambiar los dos lados a la vez. Caso: el empleado deja vacío el número de boleta.

1. El formulario valida en el dispositivo y muestra `Escribe el número de la boleta.` (`frontend/src/features/ordenes/api/ordenesLocal.ts:27`).
2. Si ese registro llegara al servidor sin número, la API responde con el mismo texto (`backend/src/controllers/ordenes.controller.ts:57`). El
   frontend lo muestra tal cual en "Para corregir", sin traducirlo (CLAUDE.md §9: "los errores dicen qué hacer").
3. Los tests de los dos lados buscan esa frase exacta, así que se reemplazó en código y en tests con el mismo mapa de formas.
4. `backend/tests/unit/textosEnTuteo.test.ts` recorre `backend/src` y `frontend/src` (sin los tests) y falla si aparece una forma de la lista.

El reemplazo se hizo con una lista explícita de formas (no con una regla general de "terminan en -á"), porque muchas palabras con tilde no son
voseo ("está", "después", "acá"). Después se revisó el diff de los casos dudosos (`sube`, `toma`, `siembra` ya estaban bien).

## Dónde encaja en la arquitectura

No cambia ninguna capa. Es una regla de contenido: el tono del texto es parte del requisito de CLAUDE.md §9 (idioma claro y propio del negocio).
El guardia vive en el backend pero lee los dos árboles, igual que `versionesDelEntorno.test.ts` lee archivos de la raíz: una sola lista de formas,
sin riesgo de que los mensajes de la API y los de la pantalla se desfasen.

## Decisiones y por qué

- **Tuteo, no "usted" ni impersonal** (decidido con la persona): es cercano, corto y de uso común en Bolivia.
- **Se reemplazó también en comentarios y tests**, no solo en textos visibles. Así el guardia puede escanear todo el código sin distinguir comentarios
  de cadenas, que es frágil.
- **"acá" se dejó**: se usa en toda Latinoamérica, no es voseo.
- **Quedó fuera `backend/tests/db`**: se reemplazó igual (por si tienen textos), pero no se corrieron porque piden Docker.

## Los tests

Un archivo nuevo, sin helpers: `textosEnTuteo.test.ts` con un caso que prueba el detector (reconoce voseo, mayúscula, pronombre pegado; no se
confunde con el tuteo ni con una palabra más larga) y uno por carpeta que recorre el código. Si una forma nueva se cuela, se agrega a `VOSEO`.

## Si mañana tenés que tocar esto

Antes de escribir un mensaje nuevo, mira uno cercano: el tono es "tú". Si el guardia falla, el nombre del archivo y la forma aparecen en el diff del
`expect`. Cuidado: la lista de formas es manual; un verbo nuevo de voseo que no esté en ella no se detecta.
