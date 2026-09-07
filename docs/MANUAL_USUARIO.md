# Manual de Usuario — CIEBA LMS

> Guía de uso por rol para la plataforma de aprendizaje del instituto (CIEBA). Se
> describen las tareas frecuentes de **administrador**, **docente** y **estudiante**.
> La plataforma incluye **apoyo de IA opcional** (sugerencia de preguntas,
> recomendaciones e informe de aprendizaje); si el instituto la mantiene desactivada,
> la aplicación funciona igual y solo se ocultan esos apoyos.

## Acceso a la plataforma

1. Abrir la dirección web del instituto (por defecto en desarrollo:
   `http://localhost:4200`).
2. En la pantalla **"Bienvenido de vuelta"**, ingresar **correo** y **contraseña**.
3. Pulsar **"Ingresar"**. El sistema lleva a cada usuario a su panel según su rol.
4. Para salir, usar **Cerrar sesión** desde el menú de la cuenta.

> Si olvidó su contraseña, solicítela al administrador del instituto. El cambio de
> contraseña propio está disponible desde el perfil.

---

## 1. Manual del Administrador

El administrador gestiona usuarios, cursos y la configuración institucional.

### 1.1 Panel principal

Muestra indicadores de la institución: total de usuarios, cursos y actividad reciente.
Es el punto de partida para las tareas de gestión.

### 1.2 Gestionar usuarios

- **Crear un usuario:** menú **Usuarios → Nuevo usuario**. Complete nombre, correo y
  **rol** (administrador, docente o estudiante) y guarde.
- **Alta masiva de estudiantes:** use la carga masiva para registrar varios estudiantes
  de una vez (útil al inicio de la gestión académica).
- **Editar o desactivar:** desde el listado, seleccione el usuario y ajuste sus datos o
  su estado.

### 1.3 Gestionar cursos

Desde **Cursos** puede revisar el catálogo institucional, editar la información de un
curso y controlar su publicación. Los cursos se organizan por **año académico**.

### 1.4 Auditoría

El **registro de auditoría** lista las acciones relevantes del sistema (quién hizo qué y
cuándo). Úselo para trazabilidad y control.

### 1.5 Personalización de marca (branding)

Puede definir el **par de colores** de la institución. La vista previa aplica los
cambios en vivo y el sistema garantiza un **contraste legible** automáticamente.

### 1.6 Buenas prácticas

- Asigne el rol mínimo necesario a cada usuario.
- Revise la auditoría periódicamente.
- Realice el alta masiva antes del inicio de clases.

---

## 2. Manual del Docente

El docente gestiona el contenido de sus cursos, crea evaluaciones, califica y hace
seguimiento del progreso.

### 2.1 Panel del docente

Presenta indicadores simples y accionables:

- **Pendientes de calificar** (preguntas abiertas por revisar).
- **Estudiantes en riesgo** (por señales de inactividad).
- **Inactivos 7+ días**.

### 2.2 Gestionar el currículo del curso

En **Curso → Currículo** puede crear **módulos** y **lecciones**, ordenarlos y editar su
contenido. Esta es la estructura que verá el estudiante.

### 2.3 Crear una evaluación estándar

1. Vaya a **Curso → Evaluaciones → Nueva evaluación**.
2. Defina título, descripción y **dificultad**: _fácil_, _medio_ o _difícil_.
3. Guarde la evaluación.

> Las evaluaciones son **estándar** (no adaptativas). No hay parámetros psicométricos.

### 2.4 Agregar preguntas

Puede agregar preguntas manualmente de tres tipos:

- **Opción múltiple** (marque cuál es la correcta).
- **Verdadero/Falso**.
- **Pregunta abierta** (la calificará usted).

**Sugerencia con IA (opcional):** a partir de un **tema**, el sistema puede **proponer
preguntas** que usted revisa y edita antes de guardarlas. Si la IA está desactivada, la
opción simplemente no genera propuestas; puede seguir creando preguntas a mano.

### 2.5 Seguimiento del progreso

En **Curso → Estudiantes** verá una tabla con el **porcentaje de lecciones completadas**,
el estado y la fecha de inscripción de cada estudiante.

### 2.6 Calificar preguntas abiertas

En **Pendientes de calificar**, abra cada respuesta, asigne un **puntaje** y un
**comentario** (feedback). Al guardar, la nota se registra y el pendiente desaparece.

### 2.7 Registro de calificaciones

El **registro** del curso reúne las notas por estudiante para una vista consolidada.

### 2.8 Alertas de riesgo académico

La sección de **alertas** señala a estudiantes con **inactividad de 7+ días** u otras
señales por reglas simples, para intervención temprana.

### 2.9 Competencias

En **Curso → Competencias** puede **crear, editar y eliminar** las competencias del
curso.

---

## 3. Manual del Estudiante

El estudiante consulta su malla, avanza en los cursos, rinde evaluaciones y revisa su
progreso.

### 3.1 Panel principal

Al ingresar verá el saludo **"Hola, {nombre}"** y:

- **Continúa donde quedaste** (retomar el último curso).
- **Recomendado para ti** (cursos sugeridos según su avance).
- **Tu informe de aprendizaje** (resumen por IA; puede mostrar _"generando…"_ mientras
  se prepara y aparecer solo).

### 3.2 Plan de estudios (malla)

En **"Plan de estudios"** (`/app/courses`) verá todas las materias de la carrera por
año, con su estado: **Aprobado**, **En curso** o **Pendiente**. La inscripción la
gestiona el instituto.

### 3.3 Mis cursos

En **"Mis cursos"** (`/app/my-courses`) están los cursos en los que está matriculado,
agrupados por año y con su **porcentaje de progreso**. También encontrará su **horario
semanal**.

### 3.4 Estudiar una lección

1. Abra un curso matriculado (**Continuar curso**).
2. En el árbol **"Contenido del curso"**, seleccione una lección.
3. Al terminarla, pulse **"Marcar completada"**: su progreso aumentará.

### 3.5 Rendir una evaluación

1. Abra la evaluación del curso.
2. Pulse **"Comenzar intento"**.
3. Responda cada pregunta (opción múltiple, verdadero/falso o abierta).
4. Pulse **"Enviar evaluación"**.
5. Verá el resultado: **¡Aprobado!** o **No aprobado**, con su **puntaje**.

> Si la evaluación tiene **preguntas abiertas**, su nota inicial cubre solo las
> automáticas; las abiertas quedan **pendientes de revisión** del docente y su puntaje
> puede subir cuando las califique.

### 3.6 Consultar calificaciones

Dentro de un curso, abra la pestaña **"Rendimiento"** para ver la sección
**"Calificaciones"** (notas y fechas) y el **historial de exámenes**.

### 3.7 Recomendaciones e informe de IA

En el panel principal, **"Recomendado para ti"** sugiere próximos cursos y
**"Tu informe de aprendizaje"** resume su avance. Estas ayudas son **opcionales**: si el
instituto no las tiene activadas, el resto de la plataforma funciona con normalidad.

---

## 4. Preguntas frecuentes

**¿La plataforma tiene exámenes adaptativos?**
No. Las evaluaciones son estándar, con dificultad fácil/medio/difícil definida por el
docente.

**No veo recomendaciones ni informe de IA. ¿Es un error?**
No necesariamente. La IA es opcional; si está desactivada o aún se está generando, esos
bloques no aparecen o muestran "generando…". El resto funciona igual.

**¿Quién me inscribe en los cursos?**
La inscripción la gestiona el instituto (administración); el estudiante no se
autoinscribe.

**¿Cómo cambio mi contraseña?**
Desde su perfil, con la opción de cambio de contraseña. Si la olvidó, contacte al
administrador.
