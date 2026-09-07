# Pruebas de Aceptación de Usuario (UAT) y Cuestionario SUS — CIEBA LMS

> Guiones de aceptación por rol (**administrador**, **docente**, **estudiante**) y el
> cuestionario de usabilidad **SUS** (System Usability Scale). Estos guiones están
> **listos para ejecutarse con usuarios reales**; no forman parte de la suite
> automatizada. Cada caso indica precondición, pasos y resultado esperado, con una
> columna para registrar el resultado observado (✅/❌) y observaciones.

**Entorno recomendado:** web en `http://localhost:4200`, API + PostgreSQL migrada y
sembrada. IA opcional (flags `AI_*`); si está apagada, la interfaz degrada con
elegancia (no bloquea).

**Escala de resultado:** ✅ Correcto · ⚠️ Correcto con observación · ❌ Falla.

---

## 1. Rol Administrador

Precondición general: sesión iniciada como usuario con rol **admin**.

| ID      | Caso de uso                   | Pasos                                                           | Resultado esperado                                           | Resultado | Obs. |
| ------- | ----------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ | --------- | ---- |
| UAT-A01 | Iniciar sesión                | Ir a `/login`, ingresar credenciales de admin, "Ingresar"       | Redirige al panel admin; se muestra el nombre del usuario    |           |      |
| UAT-A02 | Ver panel de administración   | Abrir el panel principal                                        | KPIs institucionales (usuarios, cursos, actividad) visibles  |           |      |
| UAT-A03 | Crear usuario                 | Menú Usuarios → "Nuevo usuario", completar datos y rol, guardar | El usuario aparece en el listado con su rol                  |           |      |
| UAT-A04 | Alta masiva de estudiantes    | Usar carga masiva de estudiantes                                | Los estudiantes quedan creados y matriculables               |           |      |
| UAT-A05 | Gestionar cursos              | Ir a Cursos, revisar/editar un curso                            | Cambios persistidos y reflejados en el listado               |           |      |
| UAT-A06 | Revisar auditoría             | Abrir registro de auditoría                                     | Se listan acciones con actor, fecha y tipo                   |           |      |
| UAT-A07 | Personalizar marca (branding) | Cambiar el par de colores y previsualizar                       | La UI actualiza colores en vivo con contraste legible        |           |      |
| UAT-A08 | Cerrar sesión                 | Cerrar sesión                                                   | Vuelve a `/login`; el panel deja de ser accesible sin sesión |           |      |

---

## 2. Rol Docente

Precondición general: sesión iniciada como **docente** propietario de al menos un curso.

| ID      | Caso de uso                   | Pasos                                                                       | Resultado esperado                                                              | Resultado | Obs. |
| ------- | ----------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------- | ---- |
| UAT-D01 | Iniciar sesión                | Login como docente                                                          | Redirige al panel docente                                                       |           |      |
| UAT-D02 | Ver panel docente             | Abrir panel principal                                                       | KPIs simples: pendientes de calificar, estudiantes en riesgo, inactivos 7+ días |           |      |
| UAT-D03 | Gestionar currículo           | Curso → Currículo, crear/editar módulo y lección                            | Estructura del curso actualizada                                                |           |      |
| UAT-D04 | Crear evaluación estándar     | Curso → Evaluaciones → nueva evaluación, dificultad **fácil/medio/difícil** | Evaluación creada sin opciones adaptativas (sin TRI/CAT)                        |           |      |
| UAT-D05 | Agregar preguntas manualmente | Añadir opción múltiple, V-F y abierta                                       | Preguntas guardadas con sus opciones/respuesta                                  |           |      |
| UAT-D06 | Sugerir preguntas con IA      | Usar "sugerir con IA" a partir de un tema                                   | Se proponen preguntas editables; si la IA está apagada, no rompe la pantalla    |           |      |
| UAT-D07 | Ver progreso de estudiantes   | Curso → Estudiantes                                                         | Tabla con % de lecciones completadas, estado y fecha de inscripción             |           |      |
| UAT-D08 | Calificar preguntas abiertas  | Ir a pendientes de calificar, asignar puntaje y feedback                    | La nota se registra; el pendiente desaparece                                    |           |      |
| UAT-D09 | Registro de calificaciones    | Abrir el registro del curso                                                 | Notas por estudiante visibles y consistentes                                    |           |      |
| UAT-D10 | Alertas de riesgo académico   | Abrir alertas                                                               | Lista por señales (inactividad 7+ días), sin lenguaje psicométrico              |           |      |
| UAT-D11 | Gestionar competencias        | Curso → Competencias, CRUD                                                  | Alta/edición/baja de competencias funciona                                      |           |      |

---

## 3. Rol Estudiante

Precondición general: sesión iniciada como **estudiante** con al menos una matrícula.

| ID      | Caso de uso                       | Pasos                                                                | Resultado esperado                                                     | Resultado | Obs. |
| ------- | --------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------- | ---- |
| UAT-E01 | Iniciar sesión                    | Login como estudiante                                                | Redirige a `/app/dashboard`; saludo "Hola, {nombre}"                   |           |      |
| UAT-E02 | Ver malla curricular              | Ir a "Plan de estudios" (`/app/courses`)                             | Materias por año con estado (Aprobado/En curso/Pendiente)              |           |      |
| UAT-E03 | Ver mis cursos                    | Ir a "Mis cursos" (`/app/my-courses`)                                | Cursos matriculados agrupados por año, con % de progreso               |           |      |
| UAT-E04 | Continuar un curso                | Abrir un curso matriculado                                           | Reproductor con contenido y árbol de lecciones                         |           |      |
| UAT-E05 | Completar una lección             | Abrir lección, "Marcar completada"                                   | El progreso del curso aumenta; la lección queda completada             |           |      |
| UAT-E06 | Rendir evaluación estándar        | Abrir evaluación, "Comenzar intento", responder, "Enviar evaluación" | Pantalla de resultado (Aprobado/No aprobado) con puntaje               |           |      |
| UAT-E07 | Preguntas abiertas pendientes     | Rendir evaluación con preguntas abiertas                             | Se informa que quedan "pendientes de revisión" del docente             |           |      |
| UAT-E08 | Consultar calificaciones          | Curso → pestaña "Rendimiento"                                        | Sección "Calificaciones" con notas y fechas                            |           |      |
| UAT-E09 | Ver progreso y recomendaciones IA | Panel principal                                                      | "Recomendado para ti" y/o "Tu informe de aprendizaje" (o "generando…") |           |      |
| UAT-E10 | Degradación de IA                 | Con IA apagada, abrir panel                                          | El panel funciona; solo se ocultan bloques de IA (sin errores)         |           |      |
| UAT-E11 | Cerrar sesión                     | Cerrar sesión                                                        | Vuelve a `/login`                                                      |           |      |

---

## 4. Cuestionario SUS (System Usability Scale)

Instrumento estándar de 10 ítems. El participante responde tras completar los guiones
UAT de su rol. Escala **Likert 1–5**: 1 = Totalmente en desacuerdo … 5 = Totalmente de
acuerdo.

| #   | Afirmación                                               | 1   | 2   | 3   | 4   | 5   |
| --- | -------------------------------------------------------- | --- | --- | --- | --- | --- |
| 1   | Creo que usaría este sistema con frecuencia.             | ☐   | ☐   | ☐   | ☐   | ☐   |
| 2   | Encontré el sistema innecesariamente complejo.           | ☐   | ☐   | ☐   | ☐   | ☐   |
| 3   | Pensé que el sistema era fácil de usar.                  | ☐   | ☐   | ☐   | ☐   | ☐   |
| 4   | Creo que necesitaría ayuda técnica para usar el sistema. | ☐   | ☐   | ☐   | ☐   | ☐   |
| 5   | Las funciones del sistema estaban bien integradas.       | ☐   | ☐   | ☐   | ☐   | ☐   |
| 6   | Pensé que había demasiada inconsistencia en el sistema.  | ☐   | ☐   | ☐   | ☐   | ☐   |
| 7   | Imagino que la mayoría aprendería a usarlo muy rápido.   | ☐   | ☐   | ☐   | ☐   | ☐   |
| 8   | Encontré el sistema muy incómodo de usar.                | ☐   | ☐   | ☐   | ☐   | ☐   |
| 9   | Me sentí muy seguro/a usando el sistema.                 | ☐   | ☐   | ☐   | ☐   | ☐   |
| 10  | Necesité aprender muchas cosas antes de poder avanzar.   | ☐   | ☐   | ☐   | ☐   | ☐   |

### 4.1 Cálculo del puntaje SUS

1. Ítems **impares** (1,3,5,7,9): puntaje = (valor − 1).
2. Ítems **pares** (2,4,6,8,10): puntaje = (5 − valor).
3. Sumar los 10 puntajes (rango 0–40) y **multiplicar por 2.5** → SUS final (0–100).

**Interpretación de referencia:**

| SUS   | Valoración                      |
| ----- | ------------------------------- |
| ≥ 85  | Excelente                       |
| 68–84 | Bueno / por encima del promedio |
| = 68  | Promedio de la industria        |
| 51–67 | Aceptable con mejoras           |
| < 51  | Deficiente (requiere rediseño)  |

### 4.2 Planilla de resultados (a completar con usuarios reales)

| Participante | Rol | Ítems 1–10 (valores) | Puntaje SUS |
| ------------ | --- | -------------------- | ----------- |
| P01          |     |                      |             |
| P02          |     |                      |             |
| P03          |     |                      |             |
| …            |     |                      |             |
| **Promedio** |     |                      |             |

> **Nota metodológica:** se recomienda un mínimo de 5 participantes por rol para que el
> SUS sea estadísticamente informativo. Este documento entrega el **instrumento y los
> guiones**; la ejecución con usuarios reales y el análisis de resultados corresponden
> a la fase de validación con el instituto.
