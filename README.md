# Farmacia Hospitalaria — Gestión de Stock de Medicamentos

Proyecto de facultad: aplicación web para gestionar el stock de medicamentos
de un hospital pequeño. Frontend 100% estático (HTML + CSS + JS puro, sin
Node ni build tools) conectado directo a **Supabase** (Postgres en la nube)
para la base de datos y la autenticación.

No hace falta instalar nada ni usar la consola, pero **sí hace falta un
servidor local simple** para verla en tu computadora (no alcanza con doble
clic en `index.html`, ver la Sección 6).

---

## 1. Qué archivos tenés

| Archivo        | Para qué sirve                                                       |
|-----------------|-----------------------------------------------------------------------|
| `schema.sql`    | Script para crear las tablas y la seguridad en Supabase (se corre 1 sola vez) |
| `index.html`    | Estructura de la página (login + inventario + alertas + auditoría)   |
| `style.css`     | Estilos visuales                                                      |
| `js/`           | Toda la lógica de la app, dividida en un archivo por tema (login, inventario, alertas, escáner, etc. — ver `js/main.js`) |
| `config.js`     | **Acá pegás tu URL y tu clave de Supabase** (es lo único que editás)  |
| `README.md`     | Este instructivo                                                      |

---

## 2. Crear el proyecto en Supabase

1. Entrá a **https://supabase.com** y creá una cuenta gratuita (podés usar
   tu cuenta de GitHub o Google).
2. Hacé clic en **"New project"**.
3. Completá:
   - **Name**: por ejemplo `farmacia-hospital`
   - **Database Password**: elegí una contraseña y **guardala** (no es la
     contraseña de ningún usuario de la app, es la de la base de datos).
   - **Region**: la más cercana a vos (por ejemplo, alguna de South America).
4. Esperá 1-2 minutos a que el proyecto termine de crearse.

---

## 3. Crear las tablas (correr el script SQL)

1. Adentro de tu proyecto, en el menú lateral izquierdo, hacé clic en el
   ícono de **"SQL Editor"**.
2. Hacé clic en **"New query"**.
3. Abrí el archivo `schema.sql` de esta carpeta, copiá **todo** el
   contenido, y pegalo en el editor de Supabase.
4. Hacé clic en **"Run"** (o `Ctrl + Enter`).
5. Si todo salió bien, no debería tirar ningún error en rojo. Podés
   confirmarlo yendo a **"Table Editor"** (menú lateral): deberías ver 3
   tablas nuevas: `profiles`, `medicamentos` y `movimientos`.

> Si en algún momento te equivocás y querés volver a empezar de cero,
> podés borrar las 3 tablas desde "Table Editor" y volver a correr el
> script.

---

## 4. Crear el usuario de ejemplo "Juan"

La app usa el sistema de autenticación propio de Supabase (`supabase.auth`),
así que las contraseñas **nunca** se guardan a mano en ninguna tabla: las
maneja Supabase de forma segura. Vamos a crear un usuario de prueba:

- **Email:** `juan@gmail.com`
- **Contraseña:** `12345`

### Paso a paso:

1. En el menú lateral, hacé clic en **"Authentication"**.
2. Andá a la pestaña **"Users"**.
3. Hacé clic en el botón **"Add user"** (arriba a la derecha) y elegí
   **"Create new user"**.
4. Completá:
   - **Email:** `juan@gmail.com`
   - **Password:** `12345`
   - Marcá la opción **"Auto Confirm User"** (o "Email confirm" según la
     versión) para que el usuario quede activo de inmediato, sin tener
     que confirmar el email.
5. Hacé clic en **"Create user"**.
6. Vas a ver que aparece un nuevo usuario en la lista, con un **ID** largo
   tipo `a1b2c3d4-...`. Copiá ese ID (hacé clic sobre el usuario para
   verlo completo y copiarlo).

### Vincularlo a la tabla "profiles" para que se vea el nombre "Juan"

La tabla `auth.users` de Supabase es interna y sólo guarda el email; no
tiene un campo "nombre". Por eso el `schema.sql` crea una tabla aparte
llamada `profiles`, vinculada 1 a 1 con cada usuario, donde guardamos su
nombre real.

Tenés 2 formas de cargarlo, elegí la que te resulte más cómoda:

**Opción A — Automática (recomendada):**
Simplemente iniciá sesión en la app con `juan@gmail.com` / `12345`. La
primera vez que Juan entre, la app va a notar que no tiene perfil
todavía y le va a crear uno automáticamente usando "juan" (la parte del
email antes de la @) como nombre. Después podés corregirlo con la
Opción B si querés que diga "Juan" con mayúscula, por ejemplo.

**Opción B — Manual (para poner el nombre exacto "Juan"):**
1. Andá a **"Table Editor"** → tabla **`profiles`**.
2. Hacé clic en **"Insert"** → **"Insert row"**.
3. Completá:
   - **id**: pegá el ID de usuario que copiaste en el paso 6 anterior.
   - **nombre**: `Juan`
   - **email**: `juan@gmail.com`
4. Guardá la fila.

A partir de ahora, cada vez que Juan use la app y quede registrado un
movimiento de stock, en la auditoría va a figurar **"Juan"** (no su email
ni su ID), y lo mismo va a pasar con cualquier otro usuario que crees de
la misma manera (por ejemplo, si más adelante agregás a otra enfermera,
repetís estos mismos pasos con su propio email).

---

## 5. Conectar la app a tu proyecto (`config.js`)

1. En Supabase, andá a **"Project Settings"** (ícono de engranaje, abajo
   del menú lateral) → **"API"** (o "Data API").
2. Copiá el valor de **"Project URL"**.
3. Copiá el valor de **"anon public"**, dentro de "Project API keys"
   (¡ojo!: no la de "service_role", esa nunca se usa en el frontend).
4. Abrí el archivo `config.js` con cualquier editor de texto (Bloc de
   notas, VS Code, etc.) y reemplazá:

```js
const SUPABASE_URL = "PEGA_AQUI_TU_PROJECT_URL";
const SUPABASE_ANON_KEY = "PEGA_AQUI_TU_ANON_KEY";
```

con tus propios valores, por ejemplo:

```js
const SUPABASE_URL = "https://abcdefghijk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9......";
```

5. Guardá el archivo.

---

## 6. Usar la aplicación

1. El código de `js/` usa módulos de JavaScript (`import`/`export`), y por
   seguridad **los navegadores no permiten cargar módulos abriendo el
   archivo directo con doble clic** (`file://...`) — hace falta que la
   página se sirva por `http://`. Para probarla en tu computadora, la
   forma más simple es:
   - Si usás **VS Code**: instalá la extensión "Live Server", click derecho
     sobre `index.html` → "Open with Live Server".
   - O, si tenés Python instalado, abrí una terminal en esta carpeta y
     corré `python3 -m http.server 8000`, y después abrí
     `http://localhost:8000` en el navegador.

   Esto es solo para probarla en tu compu: si la subís a GitHub Pages (o
   cualquier hosting), ya se sirve por `http://`/`https://` sola, sin que
   tengas que hacer nada de esto.
2. Iniciá sesión con:
   - **Email:** `juan@gmail.com`
   - **Contraseña:** `12345`
3. Ya vas a estar dentro del sistema, con 3 secciones:
   - **📦 Inventario**: ver, buscar, agregar medicamentos, y hacer
     ingresos/retiros de stock.
   - **⚠️ Alertas**: medicamentos vencidos/próximos a vencer (15 días) y
     con stock por debajo del mínimo.
   - **🧾 Movimientos (auditoría)**: historial completo de todo lo que
     se hizo, quién lo hizo y cuándo.
4. Arriba de todo hay un campo para **escanear código de barras**. Si
   tenés un lector USB tipo "pistola", conectalo y probá escaneando
   cualquier etiqueta con código de barras: el lector escribe el código
   solo y presiona Enter, y la app va a buscar automáticamente el
   medicamento correspondiente (o te va a ofrecer cargarlo como nuevo si
   no existe todavía).

> Nota: como el lector USB funciona igual que un teclado, también podés
> probarlo sin tener el lector físico: hacé clic en ese campo, escribí un
> código a mano y presioná Enter.

---

## 7. Preguntas frecuentes / notas para la defensa del proyecto

**¿Por qué no hay un servidor propio (Node/Express)?**
Porque Supabase ya expone una API REST (PostgREST) sobre la base Postgres,
protegida con Row Level Security (RLS). El frontend le habla directo a esa
API usando la librería `@supabase/supabase-js`, usando la clave pública
("anon key"). La seguridad no depende de "esconder" la clave, sino de las
políticas RLS definidas en `schema.sql`, que sólo dejan pasar operaciones
a usuarios autenticados.

**¿Cómo sabe la app quién hizo cada movimiento?**
Cuando alguien inicia sesión, Supabase Auth genera una sesión y un
`auth.uid()` propio de esa persona. Cada vez que se registra un ingreso,
retiro, alta o ajuste, la app guarda ese `usuario_id` (que sale de la
sesión activa, no de un campo que se pueda editar a mano) en la tabla
`movimientos`, junto con la fecha y hora exactas.

**¿Qué pasa si dos enfermeras usan la misma computadora?**
Cada una tiene que iniciar sesión con su propio email y contraseña
(Supabase Auth soporta múltiples usuarios). Al cerrar sesión con el botón
"Cerrar sesión", la próxima persona ve la pantalla de login de nuevo.

**¿Las contraseñas quedan guardadas en alguna tabla?**
No. Las contraseñas las maneja completamente Supabase Auth (tabla interna
`auth.users`, encriptada), nunca se tocan a mano ni se guardan en
`profiles`, `medicamentos` ni `movimientos`.

**¿Qué pasa si escaneo un código que no existe?**
La app te avisa que no lo encontró y abre automáticamente el formulario
de "Agregar medicamento" con ese código ya cargado, para que completes el
resto de los datos.

**Cosas que quedan afuera a propósito (para una futura versión):**
- Notificaciones automáticas por WhatsApp/email de alertas de vencimiento
  o stock bajo.
- Roles de usuario (por ejemplo, diferenciar "farmacéutico" de
  "enfermera" con distintos permisos).
- Reportes/exportación a Excel o PDF.
