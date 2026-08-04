import { resolve } from 'node:path';

import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
config({ path: resolve(process.cwd(), '../../.env') });
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index';
import { seedPermissions } from './seed-permissions';

/* ─────────────────────────────────────────────────────────────
   CIEBA LMS · Seed (formación en salud / enfermería)
   Malla real de Técnico Medio en Enfermería (CIEBA Oruro): 13 materias
   en 2 años / 4 semestres, 5 docentes, 210 estudiantes en 3 cohortes de
   gestión (70 egresados 2024 + 80 en 2.º + 60 en 1.º), matrículas ancladas
   por gestión y certificados. Contenido texto-primero.
   ───────────────────────────────────────────────────────────── */

type Level = 'beginner' | 'intermediate' | 'advanced';

interface LessonSeed {
  title: string;
  isFreePreview?: boolean;
}

interface SectionSeed {
  title: string;
  lessons: LessonSeed[];
}

interface QuizQuestionSeed {
  text: string;
  type: 'multiple_choice' | 'true_false' | 'open';
  options?: { text: string; isCorrect: boolean }[];
  correctAnswer?: string;
  points: number;
}

interface CourseSeed {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  requirements: string;
  targetAudience: string;
  instructorEmail: string;
  level: Level;
  year: 1 | 2;
  sections: SectionSeed[];
  quiz: { title: string; questions: QuizQuestionSeed[] };
  isHero?: boolean;
}

/* ─── Helpers ──────────────────────────────────────────────── */

function avatarUrl(seed: string): string {
  return `https://i.pravatar.cc/300?u=${encodeURIComponent(seed)}`;
}

// Portadas locales (servidas por el frontend desde /public). Escenas clínicas
// del set de salud; se asignan por índice para garantizar covers distintas.
const COURSE_COVERS = [
  '/pro-1-1.jpg',
  '/pro-1-2.jpg',
  '/pro-1-3.jpg',
  '/pro-1-4.jpg',
  '/pro-1-5.jpg',
  '/pro-1-6.jpg',
  '/pro-1-7.jpg',
  '/pro-1-8.jpg',
  '/pro-1-9.jpg',
  '/gal-1-3.jpg',
  '/gal-1-4.jpg',
  '/gal-1-5.jpg',
  '/20-387x310.jpg',
  '/24-387x310.jpg',
  '/blog-s-1-4-387x310.jpg',
];

function courseCover(index: number): string {
  return COURSE_COVERS[index % COURSE_COVERS.length]!;
}

function genCertCode(idx: number): string {
  const yyyy = new Date().getFullYear();
  return `CERT-${yyyy}-${String(idx).padStart(6, '0')}`;
}

// Postgres limita a 65534 parámetros por sentencia. Con 210 alumnos los inserts
// masivos (enrollments, lesson_progress, certificates) los superan → batch fijo.
function chunk<T>(rows: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

// Constructores de preguntas de quiz (mantienen el formato de evaluación).
function mc(
  text: string,
  options: { text: string; isCorrect: boolean }[],
  points = 10,
): QuizQuestionSeed {
  return { text, type: 'multiple_choice', points, options };
}
function tf(text: string, correct: boolean, points = 10): QuizQuestionSeed {
  return {
    text,
    type: 'true_false',
    points,
    options: [
      { text: 'Verdadero', isCorrect: correct },
      { text: 'Falso', isCorrect: !correct },
    ],
  };
}
function open(text: string, correctAnswer: string, points = 10): QuizQuestionSeed {
  return { text, type: 'open', points, correctAnswer };
}

/* ─── Datos maestros ──────────────────────────────────────── */

const INSTRUCTORS = [
  {
    email: 'j.flores@cieba.edu.bo',
    firstName: 'Javier',
    lastName: 'Flores',
    profession:
      'Lic. en Enfermería · Especialista en cuidados fundamentales y valoración del paciente',
  },
  {
    email: 'm.rocha@cieba.edu.bo',
    firstName: 'Mariana',
    lastName: 'Rocha',
    profession:
      'Química Farmacéutica · Especialista en farmacología clínica y administración de medicamentos',
  },
  {
    email: 'd.gutierrez@cieba.edu.bo',
    firstName: 'Daniel',
    lastName: 'Gutiérrez',
    profession: 'Médico Emergenciólogo · Especialista en urgencias, triaje y reanimación',
  },
  {
    email: 'p.salazar@cieba.edu.bo',
    firstName: 'Paola',
    lastName: 'Salazar',
    profession: 'Lic. en Enfermería · Especialista en salud materno-infantil y pediatría',
  },
  {
    email: 'c.aliaga@cieba.edu.bo',
    firstName: 'Carlos',
    lastName: 'Aliaga',
    profession: 'Lic. en Enfermería · Especialista en bioseguridad, salud comunitaria y gestión',
  },
];

/* ─── Cohortes por gestión (matrícula anual del instituto) ─────
   Modelo de negocio CIEBA: matrícula por gestión, no continua. Tres cohortes
   generan una serie histórica realista de 3 gestiones:
     · Gestión 2024 (70) → ya egresados (cursaron 1.º en 2024 y 2.º en 2025).
     · Gestión 2025 (80) → hoy en 2.º año (1.º en 2025, 2.º en curso 2026).
     · Gestión 2026 (60) → hoy en 1.º año (1.º en curso 2026).
   Matrícula distinta por gestión (extract year de enrolled_at):
     2024 = 70 · 2025 = 70+80 = 150 · 2026 = 80+60 = 140.  */
const CURRENT_GESTION = new Date().getFullYear();
const GESTION_LENGTH_DAYS = 365; // duración de una gestión (año académico)
const CURRENT_GESTION_START_DAYS_AGO = 14; // hoy ≈ inicio de la gestión actual (intake reciente)

/**
 * Fecha de matrícula (createdAt del alumno) anclada a su gestión de ingreso.
 * El intake de la gestión en curso cae dentro de los últimos ~14-35 días
 * (por eso "nuevos 30d" refleja solo el ingreso reciente real, no el total).
 */
function matriculaDate(entryGestion: number, jitterDays: number): Date {
  const gestionesAtras = CURRENT_GESTION - entryGestion;
  const daysAgo =
    CURRENT_GESTION_START_DAYS_AGO + gestionesAtras * GESTION_LENGTH_DAYS + jitterDays;
  return new Date(Date.now() - daysAgo * 86_400_000);
}

// Staff (admin + docentes): alta institucional 3 gestiones atrás; nunca cuenta
// como "nuevo en 30d".
const STAFF_CREATED_AT = new Date(Date.now() - 3 * GESTION_LENGTH_DAYS * 86_400_000);

const COHORTS: { gestion: number; count: number; cohortYear: 1 | 2; graduated: boolean }[] = [
  { gestion: 2024, count: 70, cohortYear: 2, graduated: true },
  { gestion: 2025, count: 80, cohortYear: 2, graduated: false },
  { gestion: 2026, count: 60, cohortYear: 1, graduated: false },
];

// Nombres/apellidos frecuentes en Oruro (Bolivia) para generar el plantel de
// forma determinista. La combinación paterno+materno da variedad suficiente.
const FIRST_NAMES = [
  'Juan',
  'Lucía',
  'Diego',
  'Camila',
  'Andrés',
  'Valeria',
  'Sebastián',
  'Daniela',
  'Mateo',
  'Sofía',
  'Joaquín',
  'Antonella',
  'Bruno',
  'Renata',
  'Tomás',
  'Mariana',
  'Lucas',
  'Constanza',
  'Nicolás',
  'Emilia',
  'Ignacio',
  'Sara',
  'Felipe',
  'Natalia',
  'Gabriel',
  'Fernanda',
  'Rodrigo',
  'Alejandra',
  'Marco',
  'Paola',
  'Iván',
  'Rocío',
  'Gonzalo',
  'Andrea',
  'Rubén',
  'Verónica',
  'Álvaro',
  'Gabriela',
  'Óscar',
  'Noelia',
];
const LAST_NAMES = [
  'Pérez',
  'Condori',
  'Rojas',
  'Flores',
  'Quispe',
  'Mamani',
  'Aliaga',
  'Cruz',
  'Ticona',
  'Calle',
  'Castro',
  'Choque',
  'Apaza',
  'Vargas',
  'Coronel',
  'Mendoza',
  'Rivera',
  'Bustos',
  'Loayza',
  'Roca',
  'Pinto',
  'Espinoza',
  'Cárdenas',
  'Cabrera',
  'Colque',
  'Huanca',
  'Villca',
  'Nina',
  'Yujra',
  'Marca',
  'Poma',
  'Guarachi',
  'Salinas',
  'Zabala',
  'Ledezma',
  'Camacho',
  'Ovando',
  'Terrazas',
  'Bautista',
  'Choquehuanca',
];

interface StudentSeed {
  firstName: string;
  lastName: string;
  email: string;
  studentCode: string;
  cohortYear: 1 | 2;
  entryGestion: number;
  graduated: boolean;
}

function buildStudents(): StudentSeed[] {
  const out: StudentSeed[] = [];
  let global = 0;
  for (const cohort of COHORTS) {
    for (let n = 1; n <= cohort.count; n++) {
      global++;
      const first = FIRST_NAMES[(global * 7 + 3) % FIRST_NAMES.length]!;
      const lastA = LAST_NAMES[(global * 3) % LAST_NAMES.length]!;
      const lastB = LAST_NAMES[(global * 5 + 11) % LAST_NAMES.length]!;
      out.push({
        firstName: first,
        lastName: `${lastA} ${lastB}`,
        email: `estudiante${String(global).padStart(3, '0')}@cieba.edu.bo`,
        // Matrícula: E{gestión}-{NNN} (única por prefijo de gestión).
        studentCode: `E${cohort.gestion}-${String(n).padStart(3, '0')}`,
        cohortYear: cohort.cohortYear,
        entryGestion: cohort.gestion,
        graduated: cohort.graduated,
      });
    }
  }
  return out;
}

const STUDENTS = buildStudents();

/**
 * Genera el cuerpo Markdown de una lección a partir de su título y contexto.
 * Contenido didáctico estructurado (texto-primero, sin video): introducción,
 * objetivos, desarrollo, puntos clave, aplicación en enfermería y autoevaluación.
 * No inventa datos clínicos específicos (dosis, fármacos, cifras): es andamiaje
 * pedagógico anclado al título real de la lección, apto para la demo.
 */
function buildLessonContent(
  courseTitle: string,
  sectionTitle: string,
  lessonTitle: string,
  lessonNumber: number,
): string {
  const tema = lessonTitle.toLowerCase();
  return [
    `# ${lessonTitle}`,
    ``,
    `> **Curso:** ${courseTitle} · **Unidad:** ${sectionTitle}`,
    ``,
    `## Introducción`,
    ``,
    `En esta lección abordamos **${tema}**, un contenido clave dentro de la unidad ` +
      `«${sectionTitle}». Conectaremos los conceptos con situaciones reales del ` +
      `cuidado de enfermería para que puedas aplicarlos en la práctica clínica.`,
    ``,
    `## Objetivos de aprendizaje`,
    ``,
    `Al finalizar esta lección serás capaz de:`,
    ``,
    `- Explicar los conceptos fundamentales relacionados con ${tema}.`,
    `- Reconocer su importancia dentro de «${sectionTitle}» y del curso de ${courseTitle}.`,
    `- Aplicar lo aprendido en el razonamiento y la toma de decisiones de enfermería.`,
    ``,
    `## Desarrollo`,
    ``,
    `Este tema constituye una base sobre la que se construyen competencias posteriores ` +
      `del programa. Comprenderlo bien te permite integrar la teoría con el juicio clínico ` +
      `y comunicarte con el equipo de salud usando un lenguaje técnico preciso.`,
    ``,
    `Revisamos las definiciones esenciales, las relaciones entre los elementos implicados ` +
      `y los criterios que guían la actuación profesional. Presta atención a cómo cada ` +
      `concepto se traduce en una intervención concreta y segura para el paciente.`,
    ``,
    `## Puntos clave`,
    ``,
    `- Domina la terminología propia de este tema antes de avanzar.`,
    `- Relaciona cada concepto con su utilidad en el cuidado directo.`,
    `- La seguridad del paciente y la evidencia guían toda decisión.`,
    ``,
    `## Aplicación en la práctica de enfermería`,
    ``,
    `Reflexiona sobre cómo aplicarías este contenido en un escenario real: qué ` +
      `observarías, qué registrarías y cómo lo comunicarías al equipo. La práctica ` +
      `reflexiva consolida el aprendizaje y prepara para la evaluación por competencias.`,
    ``,
    `## Para autoevaluarte`,
    ``,
    `1. ¿Cómo explicarías este tema a un compañero en tus propias palabras?`,
    `2. ¿Qué situación clínica conecta directamente con lo aprendido aquí?`,
    `3. ¿Qué duda te queda por resolver antes del quiz final del curso?`,
    ``,
    `_Lección ${lessonNumber} · Revisa el material y realiza el quiz del curso para ` +
      `consolidar tu dominio por competencias._`,
  ].join('\n');
}

/* ─── Curriculum: malla de 13 materias (2 años) ────────────── */

const COURSES: CourseSeed[] = [
  // ═══════════════════ AÑO 1 (beginner) ═══════════════════
  {
    slug: 'anatomia-fisiologia-humana',
    title: 'Anatomía y Fisiología Humana',
    subtitle: 'El cuerpo humano como base del cuidado enfermero',
    description:
      'Estudia la estructura y el funcionamiento normal del organismo humano, sistema por sistema. El estudiante integra la organización celular, los tejidos y los aparatos corporales para comprender los procesos fisiológicos que sustentan toda intervención de enfermería.',
    requirements: 'Sin requisitos previos. Ideal para quien inicia su formación en salud.',
    targetAudience:
      'Estudiantes de primer año de Técnico Superior en Enfermería sin conocimientos previos de ciencias de la salud.',
    instructorEmail: 'j.flores@cieba.edu.bo',
    level: 'beginner',
    year: 1,
    sections: [
      {
        title: 'Organización general del cuerpo humano',
        lessons: [
          {
            title: 'Niveles de organización: célula, tejido, órgano y sistema',
            isFreePreview: true,
          },
          { title: 'Terminología anatómica, planos y cavidades corporales' },
          { title: 'Homeostasis y regulación del medio interno' },
        ],
      },
      {
        title: 'Sistemas de sostén, movimiento y regulación',
        lessons: [
          { title: 'Sistema osteomuscular: huesos, articulaciones y músculos' },
          { title: 'Sistema nervioso central y periférico' },
          { title: 'Sistema endocrino y principales glándulas' },
        ],
      },
      {
        title: 'Sistemas de mantenimiento vital',
        lessons: [
          { title: 'Aparato cardiovascular y circulación sanguínea' },
          { title: 'Aparato respiratorio e intercambio gaseoso' },
          { title: 'Aparato digestivo, renal y equilibrio hidroelectrolítico' },
        ],
      },
    ],
    quiz: {
      title: 'Quiz: Anatomía y Fisiología Humana',
      questions: [
        mc('¿Cuál es la unidad estructural y funcional básica del cuerpo humano?', [
          { text: 'El tejido', isCorrect: false },
          { text: 'La célula', isCorrect: true },
          { text: 'El órgano', isCorrect: false },
          { text: 'El sistema', isCorrect: false },
        ]),
        tf(
          'La homeostasis es el mantenimiento de un medio interno estable a pesar de los cambios del entorno.',
          true,
        ),
        open(
          'Menciona las cuatro cámaras del corazón.',
          'Aurícula derecha, aurícula izquierda, ventrículo derecho y ventrículo izquierdo.',
        ),
      ],
    },
  },
  {
    slug: 'fundamentos-enfermeria',
    title: 'Fundamentos de Enfermería',
    subtitle: 'Las bases del cuidado y el proceso enfermero',
    description:
      'Introduce los conceptos, principios y procedimientos básicos de la profesión enfermera. El estudiante aprende el modelo de necesidades de Virginia Henderson, el Proceso de Atención de Enfermería (PAE) y las técnicas fundamentales de higiene, confort y movilización del paciente.',
    requirements: 'Sin requisitos previos. Ideal para quien inicia su formación en salud.',
    targetAudience:
      'Estudiantes de primer año que inician su formación en el cuidado directo del paciente.',
    instructorEmail: 'j.flores@cieba.edu.bo',
    level: 'beginner',
    year: 1,
    isHero: true,
    sections: [
      {
        title: 'Bases conceptuales de la enfermería',
        lessons: [
          {
            title: 'Concepto, historia y roles del profesional de enfermería',
            isFreePreview: true,
          },
          { title: 'Las 14 necesidades básicas de Virginia Henderson' },
          { title: 'Independencia, dependencia y fuentes de dificultad' },
        ],
      },
      {
        title: 'El Proceso de Atención de Enfermería (PAE)',
        lessons: [
          {
            title: 'Etapas del PAE: valoración, diagnóstico, planificación, ejecución y evaluación',
          },
          { title: 'Diagnósticos de enfermería según taxonomía NANDA' },
          { title: 'Registro y documentación de los cuidados' },
        ],
      },
      {
        title: 'Cuidados básicos y confort del paciente',
        lessons: [
          { title: 'Higiene, arreglo de cama y prevención de úlceras por presión' },
          { title: 'Mecánica corporal, movilización y posiciones anatómicas' },
          { title: 'Confort, reposo y satisfacción de necesidades de eliminación' },
        ],
      },
    ],
    quiz: {
      title: 'Quiz: Fundamentos de Enfermería',
      questions: [
        mc('¿Cuál es la primera etapa del Proceso de Atención de Enfermería (PAE)?', [
          { text: 'Diagnóstico', isCorrect: false },
          { text: 'Planificación', isCorrect: false },
          { text: 'Valoración', isCorrect: true },
          { text: 'Evaluación', isCorrect: false },
        ]),
        tf('El modelo de Virginia Henderson describe 14 necesidades básicas del ser humano.', true),
        open(
          'Menciona una medida de enfermería para prevenir las úlceras por presión.',
          'Realizar cambios posturales periódicos (cada 2 horas), mantener la piel limpia y seca y usar superficies de alivio de presión.',
        ),
      ],
    },
  },
  {
    slug: 'microbiologia-parasitologia',
    title: 'Microbiología y Parasitología',
    subtitle: 'Los microorganismos y su relación con la enfermedad',
    description:
      'Estudia las bacterias, virus, hongos y parásitos de importancia clínica, su estructura y mecanismos de infección. El estudiante comprende la cadena epidemiológica y las bases microbiológicas que fundamentan las medidas de asepsia y prevención de infecciones.',
    requirements: 'Sin requisitos previos.',
    targetAudience:
      'Estudiantes de primer año de enfermería que requieren la base microbiológica del cuidado.',
    instructorEmail: 'c.aliaga@cieba.edu.bo',
    level: 'beginner',
    year: 1,
    sections: [
      {
        title: 'Introducción a la microbiología',
        lessons: [
          {
            title: 'Concepto, ramas e importancia de la microbiología en enfermería',
            isFreePreview: true,
          },
          { title: 'Estructura bacteriana: pared, membrana, flagelos y esporas' },
          { title: 'Virus, hongos y su clasificación general' },
        ],
      },
      {
        title: 'Infección y cadena epidemiológica',
        lessons: [
          { title: 'Agente, reservorio, puerta de salida, transmisión y huésped' },
          { title: 'Flora normal, patogenicidad y virulencia' },
          { title: 'Toma y transporte de muestras para cultivo' },
        ],
      },
      {
        title: 'Parasitología clínica',
        lessons: [
          { title: 'Concepto de parasitismo y clasificación de los parásitos' },
          { title: 'Protozoos y helmintos de importancia en Bolivia' },
          { title: 'Enfermedad de Chagas y parasitosis intestinales' },
        ],
      },
    ],
    quiz: {
      title: 'Quiz: Microbiología y Parasitología',
      questions: [
        mc(
          '¿Qué tipo de microorganismo carece de estructura celular y requiere una célula huésped para replicarse?',
          [
            { text: 'Bacteria', isCorrect: false },
            { text: 'Virus', isCorrect: true },
            { text: 'Hongo', isCorrect: false },
            { text: 'Protozoo', isCorrect: false },
          ],
        ),
        tf(
          'La enfermedad de Chagas es causada por el parásito Trypanosoma cruzi y es endémica en Bolivia.',
          true,
        ),
        open(
          'Nombra los eslabones de la cadena epidemiológica de la infección.',
          'Agente causal, reservorio, puerta de salida, mecanismo de transmisión, puerta de entrada y huésped susceptible.',
        ),
      ],
    },
  },
  {
    slug: 'bioseguridad-control-infecciones',
    title: 'Bioseguridad y Control de Infecciones',
    subtitle: 'Prácticas seguras para proteger al paciente y al personal',
    description:
      'Capacita al estudiante en las normas de bioseguridad, precauciones estándar y manejo de residuos hospitalarios. Se enfatiza la higiene de manos, el uso correcto del equipo de protección personal y las medidas de aislamiento para prevenir infecciones asociadas a la atención en salud.',
    requirements: 'Microbiología y Parasitología (recomendado).',
    targetAudience:
      'Estudiantes de primer año que se incorporan a prácticas clínicas y manejo de material biológico.',
    instructorEmail: 'c.aliaga@cieba.edu.bo',
    level: 'beginner',
    year: 1,
    sections: [
      {
        title: 'Principios de bioseguridad',
        lessons: [
          {
            title: 'Concepto de bioseguridad y precauciones estándar/universales',
            isFreePreview: true,
          },
          { title: 'Los 5 momentos de la higiene de manos (OMS)' },
          { title: 'Equipo de protección personal (EPP): uso y retiro seguro' },
        ],
      },
      {
        title: 'Asepsia, antisepsia y esterilización',
        lessons: [
          { title: 'Limpieza, desinfección y esterilización de material' },
          { title: 'Técnica aséptica y campo estéril' },
          { title: 'Manejo de accidentes con material corto-punzante' },
        ],
      },
      {
        title: 'Aislamiento y manejo de residuos',
        lessons: [
          { title: 'Tipos de aislamiento: contacto, gotas y aéreo' },
          { title: 'Clasificación y segregación de residuos hospitalarios' },
          { title: 'Infecciones asociadas a la atención en salud (IAAS)' },
        ],
      },
    ],
    quiz: {
      title: 'Quiz: Bioseguridad y Control de Infecciones',
      questions: [
        mc(
          'Según la OMS, ¿cuál es la medida más eficaz y económica para prevenir la transmisión de infecciones?',
          [
            { text: 'El uso de antibióticos profilácticos', isCorrect: false },
            { text: 'La higiene de manos', isCorrect: true },
            { text: 'El uso permanente de guantes', isCorrect: false },
            { text: 'La esterilización del ambiente', isCorrect: false },
          ],
        ),
        tf(
          'El equipo de protección personal debe retirarse en un orden específico para evitar la autocontaminación.',
          true,
        ),
        open(
          '¿En qué tipo de recipiente deben desecharse las agujas y objetos corto-punzantes?',
          'En un recipiente rígido, resistente a la punción (contenedor para corto-punzantes), sin reencapuchar la aguja.',
        ),
      ],
    },
  },
  {
    slug: 'primeros-auxilios-rcp',
    title: 'Primeros Auxilios y RCP básica',
    subtitle: 'Actuación inmediata que salva vidas',
    description:
      'Forma al estudiante en la atención inicial de urgencias hasta la llegada de ayuda especializada. Incluye el soporte vital básico, la reanimación cardiopulmonar, el manejo de la obstrucción de la vía aérea y la atención de hemorragias, quemaduras y fracturas.',
    requirements: 'Sin requisitos previos.',
    targetAudience:
      'Estudiantes de primer año y todo personal de salud que deba responder ante emergencias.',
    instructorEmail: 'd.gutierrez@cieba.edu.bo',
    level: 'beginner',
    year: 1,
    sections: [
      {
        title: 'Soporte Vital Básico (SVB) y RCP',
        lessons: [
          {
            title: 'Valoración de la escena, seguridad y activación del sistema de emergencia',
            isFreePreview: true,
          },
          { title: 'Cadena de supervivencia y secuencia C-A-B' },
          { title: 'RCP de calidad y uso del DEA (desfibrilador externo automático)' },
        ],
      },
      {
        title: 'Obstrucción de la vía aérea y valoración',
        lessons: [
          { title: 'Maniobra de Heimlich en adulto, niño y lactante' },
          { title: 'Posición lateral de seguridad y control de conciencia' },
        ],
      },
      {
        title: 'Atención de lesiones frecuentes',
        lessons: [
          { title: 'Control de hemorragias y estados de shock' },
          { title: 'Quemaduras: clasificación y primeros cuidados' },
          { title: 'Inmovilización de fracturas y esguinces' },
        ],
      },
    ],
    quiz: {
      title: 'Quiz: Primeros Auxilios y RCP básica',
      questions: [
        mc('¿Cuál es la frecuencia recomendada de compresiones torácicas en la RCP del adulto?', [
          { text: '60 a 80 por minuto', isCorrect: false },
          { text: '100 a 120 por minuto', isCorrect: true },
          { text: '140 a 160 por minuto', isCorrect: false },
          { text: '40 a 60 por minuto', isCorrect: false },
        ]),
        tf(
          'La maniobra de Heimlich se utiliza para desobstruir la vía aérea en caso de atragantamiento.',
          true,
        ),
        open(
          '¿Qué se debe hacer primero al encontrar a una persona inconsciente en la vía pública?',
          'Garantizar la seguridad de la escena, comprobar la respuesta/consciencia y activar el sistema de emergencias antes de iniciar la valoración y la RCP si procede.',
        ),
      ],
    },
  },
  {
    slug: 'etica-deontologia-enfermeria',
    title: 'Ética y Deontología en Enfermería',
    subtitle: 'El cuidado con responsabilidad y valores',
    description:
      'Analiza los principios éticos y las normas deontológicas que rigen el ejercicio profesional de enfermería. El estudiante reflexiona sobre bioética, derechos del paciente, consentimiento informado y secreto profesional para tomar decisiones responsables en su práctica.',
    requirements: 'Sin requisitos previos.',
    targetAudience:
      'Estudiantes de primer año que construyen su identidad y responsabilidad profesional.',
    instructorEmail: 'c.aliaga@cieba.edu.bo',
    level: 'beginner',
    year: 1,
    sections: [
      {
        title: 'Fundamentos de la ética profesional',
        lessons: [
          { title: 'Ética, moral y deontología: conceptos y diferencias', isFreePreview: true },
          {
            title: 'Principios de la bioética: autonomía, beneficencia, no maleficencia y justicia',
          },
          { title: 'Código deontológico del CIE para enfermería' },
        ],
      },
      {
        title: 'Derechos del paciente y práctica responsable',
        lessons: [
          { title: 'Consentimiento informado y autonomía del paciente' },
          { title: 'Secreto profesional y confidencialidad' },
          { title: 'Dilemas éticos y toma de decisiones en el cuidado' },
        ],
      },
    ],
    quiz: {
      title: 'Quiz: Ética y Deontología en Enfermería',
      questions: [
        mc(
          '¿Cuál de los siguientes es uno de los cuatro principios fundamentales de la bioética?',
          [
            { text: 'Jerarquía', isCorrect: false },
            { text: 'Autonomía', isCorrect: true },
            { text: 'Rentabilidad', isCorrect: false },
            { text: 'Obediencia', isCorrect: false },
          ],
        ),
        tf(
          'El secreto profesional obliga a la enfermera a mantener la confidencialidad de la información del paciente.',
          true,
        ),
        open(
          'Define brevemente el consentimiento informado.',
          'Es la aceptación libre y voluntaria del paciente, tras recibir información suficiente y comprensible, para que se le realice un procedimiento o tratamiento.',
        ),
      ],
    },
  },

  // ═══════════════════ AÑO 2 (intermediate) ═══════════════════
  {
    slug: 'farmacologia',
    title: 'Farmacología',
    subtitle: 'Medicamentos seguros: del principio activo al paciente',
    description:
      'Materia central del programa que integra las bases de la farmacología, los principales grupos terapéuticos, el cálculo de dosis y goteo, y la administración segura de medicamentos. El estudiante desarrolla competencia para preparar y administrar fármacos por distintas vías con seguridad y precisión.',
    requirements: 'Anatomía y Fisiología Humana, Fundamentos de Enfermería.',
    targetAudience:
      'Estudiantes de segundo año que asumirán la responsabilidad de administrar medicación.',
    instructorEmail: 'm.rocha@cieba.edu.bo',
    level: 'intermediate',
    year: 2,
    sections: [
      {
        title: 'Principios de farmacología',
        lessons: [
          {
            title: 'Farmacocinética: absorción, distribución, metabolismo y excreción',
            isFreePreview: true,
          },
          { title: 'Farmacodinamia: mecanismo de acción y receptores' },
          { title: 'Reacciones adversas, interacciones y farmacovigilancia' },
        ],
      },
      {
        title: 'Grupos terapéuticos',
        lessons: [
          { title: 'Antibióticos, antiinflamatorios y analgésicos' },
          { title: 'Fármacos cardiovasculares: antihipertensivos y diuréticos' },
          { title: 'Antidiabéticos, insulinas y fármacos del sistema nervioso' },
        ],
      },
      {
        title: 'Cálculo de dosis y goteo',
        lessons: [
          { title: 'Sistema de unidades y conversiones (mg, g, mL, UI)' },
          { title: 'Cálculo de dosis por peso y regla de tres' },
          { title: 'Cálculo de goteo: gotas y microgotas por minuto' },
        ],
      },
      {
        title: 'Administración segura y vías',
        lessons: [
          { title: 'Los 10 correctos de la administración de medicamentos' },
          { title: 'Vías enterales: oral, sublingual y rectal' },
          { title: 'Vías parenterales: IM, SC, IV e intradérmica' },
        ],
      },
    ],
    quiz: {
      title: 'Quiz: Farmacología',
      questions: [
        mc(
          'Se indica una infusión de 1000 mL para pasar en 8 horas con equipo de macrogoteo (20 gotas/mL). ¿A cuántas gotas por minuto debe regularse?',
          [
            { text: '21 gotas/min', isCorrect: true },
            { text: '42 gotas/min', isCorrect: false },
            { text: '60 gotas/min', isCorrect: false },
            { text: '15 gotas/min', isCorrect: false },
          ],
        ),
        tf(
          'La vía intravenosa produce un efecto más rápido que la vía oral porque el fármaco llega directamente a la circulación.',
          true,
        ),
        open(
          "Menciona al menos cinco de los 'correctos' en la administración de medicamentos.",
          'Paciente correcto, medicamento correcto, dosis correcta, vía correcta y hora correcta (otros: registro, caducidad, velocidad, educación al paciente y derecho a rechazar).',
        ),
      ],
    },
  },
  {
    slug: 'enfermeria-medico-quirurgica',
    title: 'Enfermería Médico-Quirúrgica',
    subtitle: 'Cuidados integrales al paciente adulto',
    description:
      'Aborda los cuidados de enfermería al paciente adulto con patologías médicas y quirúrgicas de los principales sistemas. El estudiante domina la atención perioperatoria, la cura de heridas y el manejo de las patologías más frecuentes en el ámbito hospitalario.',
    requirements: 'Anatomía y Fisiología Humana, Fundamentos de Enfermería.',
    targetAudience:
      'Estudiantes de segundo año que rotan por servicios de medicina interna y cirugía.',
    instructorEmail: 'd.gutierrez@cieba.edu.bo',
    level: 'intermediate',
    year: 2,
    sections: [
      {
        title: 'Cuidados perioperatorios',
        lessons: [
          { title: 'Valoración y preparación preoperatoria del paciente', isFreePreview: true },
          { title: 'Cuidados intraoperatorios y transoperatorios' },
          { title: 'Cuidados postoperatorios y prevención de complicaciones' },
        ],
      },
      {
        title: 'Cuidados médicos por sistemas',
        lessons: [
          { title: 'Patología cardiovascular y respiratoria' },
          { title: 'Patología digestiva, renal y endocrina (diabetes)' },
          { title: 'Cuidados del paciente oncológico y crónico' },
        ],
      },
      {
        title: 'Manejo de heridas y procedimientos',
        lessons: [
          { title: 'Tipos de heridas y proceso de cicatrización' },
          { title: 'Técnica de curación y manejo de drenajes' },
          { title: 'Administración de oxígeno y sondajes' },
        ],
      },
    ],
    quiz: {
      title: 'Quiz: Enfermería Médico-Quirúrgica',
      questions: [
        mc('¿Cuál es una prioridad de enfermería en el postoperatorio inmediato?', [
          { text: 'Iniciar dieta completa de inmediato', isCorrect: false },
          {
            text: 'Mantener la permeabilidad de la vía aérea y la estabilidad hemodinámica',
            isCorrect: true,
          },
          { text: 'Retirar todos los drenajes', isCorrect: false },
          { text: 'Suspender el control de signos vitales', isCorrect: false },
        ]),
        tf(
          'El consentimiento informado firmado es un requisito antes de una intervención quirúrgica programada.',
          true,
        ),
        open(
          'Menciona dos cuidados de enfermería en la preparación preoperatoria del paciente.',
          'Verificar el ayuno indicado y el consentimiento informado; además, valorar antecedentes/alergias, control de signos vitales y preparación de la zona quirúrgica.',
        ),
      ],
    },
  },
  {
    slug: 'signos-vitales-valoracion',
    title: 'Signos Vitales y Valoración del Paciente',
    subtitle: 'Interpretar el cuerpo para cuidar mejor',
    description:
      'Desarrolla la competencia para medir, registrar e interpretar los signos vitales y realizar la valoración clínica integral del paciente, incorporando la valoración nutricional como parte del examen. El estudiante aprende la técnica correcta de cada parámetro, reconoce los valores de alarma y aplica dietas terapéuticas según la condición clínica.',
    requirements: 'Anatomía y Fisiología Humana.',
    targetAudience:
      'Estudiantes de segundo año que consolidan la valoración clínica y nutricional del paciente.',
    instructorEmail: 'j.flores@cieba.edu.bo',
    level: 'intermediate',
    year: 2,
    sections: [
      {
        title: 'Medición de los signos vitales',
        lessons: [
          {
            title: 'Temperatura corporal: técnica, sitios y valores normales',
            isFreePreview: true,
          },
          { title: 'Pulso y frecuencia respiratoria: técnica e interpretación' },
          { title: 'Presión arterial y saturación de oxígeno (SpO2)' },
        ],
      },
      {
        title: 'Valoración integral del paciente',
        lessons: [
          { title: 'Anamnesis y exploración física céfalo-caudal' },
          { title: 'Valoración del dolor y escalas de medición' },
          { title: 'Registro clínico y detección de signos de alarma' },
        ],
      },
      {
        title: 'Nutrición aplicada a la valoración del paciente',
        lessons: [
          { title: 'Macronutrientes, micronutrientes y grupos de alimentos' },
          { title: 'Valoración del estado nutricional e IMC' },
          { title: 'Dietas terapéuticas y soporte nutricional (enteral y parenteral)' },
        ],
      },
    ],
    quiz: {
      title: 'Quiz: Signos Vitales y Valoración del Paciente',
      questions: [
        mc('¿Cuál es el rango normal de saturación de oxígeno (SpO2) en un adulto sano?', [
          { text: '80–85%', isCorrect: false },
          { text: '85–90%', isCorrect: false },
          { text: '95–100%', isCorrect: true },
          { text: '70–80%', isCorrect: false },
        ]),
        tf(
          'La presión arterial se expresa con dos valores: sistólica (máxima) y diastólica (mínima).',
          true,
        ),
        open(
          '¿Cuál es el rango normal de la frecuencia cardíaca en un adulto en reposo?',
          'Entre 60 y 100 latidos por minuto.',
        ),
        mc('El Índice de Masa Corporal (IMC) se calcula como:', [
          { text: 'Peso (kg) entre la talla al cuadrado (m²)', isCorrect: true },
          { text: 'Talla (m) entre el peso (kg)', isCorrect: false },
          { text: 'Peso (kg) por la talla (m)', isCorrect: false },
          { text: 'Perímetro abdominal entre la talla', isCorrect: false },
        ]),
      ],
    },
  },
  {
    slug: 'enfermeria-materno-neonatal',
    title: 'Enfermería Materno-Infantil',
    subtitle: 'Cuidados para la madre, el neonato, el niño y la familia',
    description:
      'Capacita en los cuidados de enfermería durante el embarazo, parto, puerperio y atención del recién nacido, e integra el cuidado del niño y el adolescente (Pediatría). El estudiante aprende el control prenatal, la asistencia en el parto normal, los cuidados del neonato, la lactancia materna, la vigilancia del crecimiento y desarrollo, el esquema de inmunizaciones y el manejo de las patologías pediátricas más frecuentes.',
    requirements: 'Anatomía y Fisiología Humana, Fundamentos de Enfermería.',
    targetAudience:
      'Estudiantes de segundo año orientados al cuidado de la mujer gestante, el neonato y el niño.',
    instructorEmail: 'p.salazar@cieba.edu.bo',
    level: 'intermediate',
    year: 2,
    sections: [
      {
        title: 'Embarazo y control prenatal',
        lessons: [
          { title: 'Fisiología y modificaciones del embarazo', isFreePreview: true },
          { title: 'Control prenatal y signos de alarma en la gestante' },
          { title: 'Complicaciones frecuentes: preeclampsia y hemorragias' },
        ],
      },
      {
        title: 'Parto y puerperio',
        lessons: [
          { title: 'Etapas del trabajo de parto y asistencia de enfermería' },
          { title: 'Cuidados de enfermería en el puerperio' },
        ],
      },
      {
        title: 'Atención del recién nacido',
        lessons: [
          { title: 'Cuidados inmediatos y mediatos del neonato' },
          { title: 'Valoración del recién nacido: APGAR y antropometría' },
          { title: 'Lactancia materna y alimentación del neonato' },
        ],
      },
      {
        title: 'Crecimiento, desarrollo e inmunizaciones del niño',
        lessons: [
          { title: 'Vigilancia del crecimiento y desarrollo del niño' },
          { title: 'Esquema nacional de vacunación (PAI)' },
          { title: 'Control del niño sano y educación a la familia' },
        ],
      },
      {
        title: 'Patologías pediátricas frecuentes',
        lessons: [
          { title: 'Infecciones respiratorias agudas (IRA)' },
          { title: 'Enfermedad diarreica aguda (EDA) y deshidratación' },
          { title: 'Desnutrición infantil y planes de rehidratación' },
        ],
      },
    ],
    quiz: {
      title: 'Quiz: Enfermería Materno-Infantil',
      questions: [
        mc('¿Qué evalúa la escala de APGAR en el recién nacido?', [
          { text: 'El peso y la talla al nacer', isCorrect: false },
          {
            text: 'La vitalidad: frecuencia cardíaca, respiración, tono, reflejos y color',
            isCorrect: true,
          },
          { text: 'El grupo sanguíneo del neonato', isCorrect: false },
          { text: 'La edad gestacional exacta', isCorrect: false },
        ]),
        tf(
          'Se recomienda la lactancia materna exclusiva durante los primeros seis meses de vida.',
          true,
        ),
        open(
          'Menciona un signo de alarma durante el embarazo que la gestante debe reportar de inmediato.',
          'Sangrado vaginal, cefalea intensa, visión borrosa, edema marcado o ausencia de movimientos fetales.',
        ),
        mc(
          '¿Cuál es la principal complicación de la enfermedad diarreica aguda (EDA) en el niño pequeño?',
          [
            { text: 'La hipertensión arterial', isCorrect: false },
            { text: 'La deshidratación', isCorrect: true },
            { text: 'La obesidad', isCorrect: false },
            { text: 'La hiperglucemia', isCorrect: false },
          ],
        ),
      ],
    },
  },

  // ═══════════════════ AÑO 2 · avanzado / práctica ═══════════════════
  {
    slug: 'urgencias-emergencias',
    title: 'Enfermería en Urgencias y Salud Mental',
    subtitle: 'Respuesta rápida ante la vida en riesgo y contención emocional',
    description:
      'Fusiona la atención de urgencias y emergencias con los cuidados de enfermería en salud mental. El estudiante aprende el triage, el manejo del paciente politraumatizado, los estados de shock y el soporte vital avanzado, y desarrolla la relación terapéutica y el manejo de la ansiedad, la depresión, los trastornos psicóticos y las urgencias en salud mental (conducta suicida y paciente agitado).',
    requirements: 'Primeros Auxilios y RCP básica, Enfermería Médico-Quirúrgica, Farmacología.',
    targetAudience:
      'Estudiantes de segundo año orientados a la respuesta rápida y la contención emocional del paciente.',
    instructorEmail: 'd.gutierrez@cieba.edu.bo',
    level: 'advanced',
    year: 2,
    sections: [
      {
        title: 'Organización de la atención de urgencias',
        lessons: [
          { title: 'Triage: clasificación y priorización del paciente', isFreePreview: true },
          { title: 'Cadena de supervivencia y trabajo en equipo' },
          { title: 'Farmacología de emergencia y carro de paro' },
        ],
      },
      {
        title: 'Manejo del paciente crítico',
        lessons: [
          { title: 'Valoración primaria y secundaria del politraumatizado' },
          { title: 'Estados de shock: tipos y manejo inicial' },
          { title: 'Paro cardiorrespiratorio y soporte vital avanzado (SVA)' },
        ],
      },
      {
        title: 'Enfermería en salud mental y relación terapéutica',
        lessons: [
          { title: 'Concepto de salud mental, comunicación y relación terapéutica' },
          { title: 'Trastornos de ansiedad, del estado de ánimo y psicóticos' },
          { title: 'Urgencias en salud mental: conducta suicida y paciente agitado' },
        ],
      },
    ],
    quiz: {
      title: 'Quiz: Enfermería en Urgencias y Salud Mental',
      questions: [
        mc('¿Cuál es el objetivo principal del triage en un servicio de urgencias?', [
          { text: 'Atender a los pacientes por orden de llegada', isCorrect: false },
          { text: 'Clasificar y priorizar la atención según la gravedad', isCorrect: true },
          { text: 'Registrar los datos administrativos', isCorrect: false },
          { text: 'Dar de alta a los pacientes leves', isCorrect: false },
        ]),
        tf(
          'El shock hipovolémico se produce por una disminución del volumen sanguíneo circulante, por ejemplo por una hemorragia.',
          true,
        ),
        mc('¿Cuál es una característica esencial de la relación terapéutica en salud mental?', [
          { text: 'Emitir juicios sobre la conducta del paciente', isCorrect: false },
          { text: 'La escucha activa y la empatía sin juzgar', isCorrect: true },
          { text: 'Mantener distancia emocional total', isCorrect: false },
          { text: 'Imponer decisiones al paciente', isCorrect: false },
        ]),
        open(
          "En la valoración primaria del paciente politraumatizado, ¿qué evalúa la 'A' del abordaje ABCDE?",
          'La vía aérea (Airway) con control de la columna cervical.',
        ),
      ],
    },
  },
  {
    slug: 'salud-comunitaria-promocion',
    title: 'Salud Comunitaria y Promoción de la Salud',
    subtitle: 'Cuidar más allá del hospital',
    description:
      'Orienta al estudiante hacia el cuidado de la salud colectiva en el primer nivel de atención. Integra la atención primaria, los determinantes de la salud, la epidemiología básica y las estrategias de educación y promoción de la salud en la comunidad.',
    requirements: 'Microbiología y Parasitología, Fundamentos de Enfermería.',
    targetAudience:
      'Estudiantes de segundo año orientados a la salud pública y el trabajo comunitario.',
    instructorEmail: 'c.aliaga@cieba.edu.bo',
    level: 'intermediate',
    year: 2,
    sections: [
      {
        title: 'Atención primaria y determinantes de la salud',
        lessons: [
          { title: 'Concepto de salud comunitaria y atención primaria (APS)', isFreePreview: true },
          { title: 'Modelo de Salud Familiar Comunitario Intercultural (SAFCI)' },
          { title: 'Determinantes sociales de la salud' },
          { title: 'Niveles de prevención: primaria, secundaria y terciaria' },
        ],
      },
      {
        title: 'Epidemiología y promoción de la salud',
        lessons: [
          { title: 'Epidemiología básica e indicadores de salud' },
          { title: 'Educación para la salud y participación comunitaria' },
          { title: 'Programas de salud y visita domiciliaria' },
        ],
      },
    ],
    quiz: {
      title: 'Quiz: Salud Comunitaria y Promoción de la Salud',
      questions: [
        mc(
          'La vacunación como estrategia para evitar que aparezca la enfermedad corresponde a un nivel de prevención:',
          [
            { text: 'Primaria', isCorrect: true },
            { text: 'Secundaria', isCorrect: false },
            { text: 'Terciaria', isCorrect: false },
            { text: 'Cuaternaria', isCorrect: false },
          ],
        ),
        tf(
          'Los determinantes sociales de la salud (educación, vivienda, ingresos) influyen en el estado de salud de la población.',
          true,
        ),
        open(
          'Define brevemente qué es la promoción de la salud.',
          'Es el proceso que permite a las personas y comunidades incrementar el control sobre los determinantes de su salud para mejorarla, mediante educación y estilos de vida saludables.',
        ),
      ],
    },
  },
  {
    slug: 'internado-rotatorio',
    title: 'Internado Rotatorio Técnico (Práctica Clínica)',
    subtitle: 'Integrar todo el aprendizaje en el campo real',
    description:
      'Etapa final de práctica clínica supervisada en la que el estudiante integra los conocimientos de toda la carrera. Rota por los principales servicios hospitalarios y comunitarios, brindando cuidados directos bajo supervisión y desarrollando su autonomía profesional.',
    requirements: 'Aprobación del primer año y de las materias teóricas del segundo año.',
    targetAudience:
      'Estudiantes de segundo año en su etapa final de práctica clínica supervisada (último semestre).',
    instructorEmail: 'd.gutierrez@cieba.edu.bo',
    level: 'advanced',
    year: 2,
    sections: [
      {
        title: 'Rotación por servicios hospitalarios',
        lessons: [
          { title: 'Rotación en medicina interna y cirugía', isFreePreview: true },
          { title: 'Rotación en pediatría y maternidad' },
          { title: 'Rotación en urgencias y cuidados críticos' },
        ],
      },
      {
        title: 'Integración profesional y comunitaria',
        lessons: [
          { title: 'Rotación en atención primaria y salud comunitaria' },
          { title: 'Aplicación del PAE en casos reales' },
          { title: 'Ética, registros clínicos y evaluación de desempeño' },
        ],
      },
    ],
    quiz: {
      title: 'Quiz: Internado Rotatorio',
      questions: [
        mc('Durante el internado rotatorio, el estudiante brinda cuidados directos:', [
          { text: 'De forma totalmente independiente y sin control', isCorrect: false },
          { text: 'Bajo supervisión de un tutor o profesional responsable', isCorrect: true },
          { text: 'Solo observando, sin realizar procedimientos', isCorrect: false },
          { text: 'Únicamente en tareas administrativas', isCorrect: false },
        ]),
        tf(
          'El internado rotatorio permite integrar en la práctica los conocimientos teóricos adquiridos durante la carrera.',
          true,
        ),
        open(
          'Menciona dos servicios por los que típicamente rota un interno de enfermería.',
          'Medicina interna, cirugía, pediatría, maternidad, urgencias o atención primaria (cualesquiera dos son válidos).',
        ),
      ],
    },
  },
];

/* ─── Main ────────────────────────────────────────────────── */

async function main() {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://cieba:cieba_dev_password@localhost:5433/cieba_lms';

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  console.info(`🌱 Seeding CIEBA LMS — ${COURSES.length} materias (malla 2 años)...`);

  /* ─── 1. Roles ─── */
  console.info('  → Roles...');
  await db
    .insert(schema.roles)
    .values([
      { name: 'admin', description: 'Administrador del sistema', isSystem: true },
      { name: 'teacher', description: 'Docente', isSystem: true },
      { name: 'student', description: 'Estudiante', isSystem: true },
    ])
    .onConflictDoNothing();
  const roles = await db.select().from(schema.roles);
  const roleByName = new Map(roles.map((r) => [r.name, r]));

  /* ─── 1b. Permisos + role_permissions (diccionario RBAC) ─── */
  console.info('  → Permisos + role_permissions...');
  const permStats = await seedPermissions(db);
  console.info(
    `     ${permStats.permissions} permisos, ${permStats.rolePermissions} role_permissions`,
  );

  /* ─── 2. Usuarios ─── */
  console.info(`  → Users (1 admin + 5 docentes + ${STUDENTS.length} estudiantes)...`);
  const passwordHash = await bcrypt.hash('Cieba2025!', 10);

  await db
    .insert(schema.users)
    .values([
      {
        email: 'admin@cieba.edu.bo',
        passwordHash,
        firstName: 'Admin',
        lastName: 'CIEBA',
        avatarUrl: avatarUrl('admin'),
        status: 'active',
        // Staff institucional: dado de alta al inicio (no cuenta como "nuevo 30d").
        createdAt: STAFF_CREATED_AT,
        emailVerifiedAt: new Date(),
      },
      ...INSTRUCTORS.map((i) => ({
        email: i.email,
        passwordHash,
        firstName: i.firstName,
        lastName: i.lastName,
        profession: i.profession,
        avatarUrl: avatarUrl(i.email),
        status: 'active' as const,
        createdAt: STAFF_CREATED_AT,
        emailVerifiedAt: new Date(),
      })),
      ...STUDENTS.map((s, idx) => ({
        email: s.email,
        passwordHash,
        firstName: s.firstName,
        lastName: s.lastName,
        studentCode: s.studentCode,
        cohortYear: s.cohortYear,
        avatarUrl: avatarUrl(`student-${idx}`),
        // Egresados quedan 'inactive' (no inflan activeUsers ni el motor adaptativo).
        status: s.graduated ? ('inactive' as const) : ('active' as const),
        // createdAt = matrícula de su gestión de ingreso ⇒ "nuevos 30d" solo cuenta
        // el intake reciente (gestión en curso), no toda la plataforma.
        createdAt: matriculaDate(s.entryGestion, (idx * 3) % 21),
        // Dev: mantienen Cieba2025! y no se les fuerza cambio en primer login.
        mustChangePassword: false,
        emailVerifiedAt: new Date(),
      })),
    ])
    .onConflictDoNothing();

  const users = await db.select().from(schema.users);
  const userByEmail = new Map(users.map((u) => [u.email, u]));
  const adminUser = userByEmail.get('admin@cieba.edu.bo')!;
  const instructorUsers = INSTRUCTORS.map((i) => userByEmail.get(i.email)!);
  const studentUsers = STUDENTS.map((s) => userByEmail.get(s.email)!);

  /* ─── 3. Asignación de roles ─── */
  console.info('  → User roles...');
  const userRoleValues: { userId: string; roleId: string }[] = [
    { userId: adminUser.id, roleId: roleByName.get('admin')!.id },
    ...instructorUsers.map((u) => ({ userId: u.id, roleId: roleByName.get('teacher')!.id })),
    ...studentUsers.map((u) => ({ userId: u.id, roleId: roleByName.get('student')!.id })),
  ];
  await db.insert(schema.userRoles).values(userRoleValues).onConflictDoNothing();

  /* ─── 4. Malla curricular vigente + Cursos ─── */
  const MALLA_NAME = 'Plan CIEBA — Res. 007/07';
  let malla = (
    await db.select().from(schema.curricula).where(eq(schema.curricula.name, MALLA_NAME))
  )[0];
  if (!malla) {
    malla = (
      await db
        .insert(schema.curricula)
        .values({ name: MALLA_NAME, resolution: 'Res. 007/07', status: 'published' as const })
        .returning()
    )[0];
  }
  if (!malla) throw new Error('No se pudo crear/obtener la malla curricular base');
  const curriculumId = malla.id;
  console.info(`  → Malla vigente: ${malla.name}`);

  console.info(`  → Courses (${COURSES.length})...`);
  await db
    .insert(schema.courses)
    .values(
      COURSES.map((c, i) => {
        const instructor = userByEmail.get(c.instructorEmail);
        if (!instructor) throw new Error(`Instructor not found: ${c.instructorEmail}`);
        const totalLessons = c.sections.reduce((sum, s) => sum + s.lessons.length, 0);
        // Tiempo estimado de lectura: ~10 min por lección (contenido texto-primero).
        const durationMinutes = totalLessons * 10;
        return {
          slug: c.slug,
          title: c.title,
          subtitle: c.subtitle,
          description: c.description,
          requirements: c.requirements,
          targetAudience: c.targetAudience,
          coverImageUrl: courseCover(i),
          instructorId: instructor.id,
          curriculumId,
          level: c.level,
          academicYear: c.year,
          language: 'es' as const,
          status: 'published' as const,
          publishedAt: new Date(Date.now() - Math.floor(Math.random() * 90) * 86_400_000),
          durationMinutes,
          totalLessons,
        };
      }),
    )
    .onConflictDoNothing();

  const coursesRows = await db.select().from(schema.courses);
  const courseBySlug = new Map(coursesRows.map((c) => [c.slug, c]));

  /* ─── 5. Sections + Lessons ─── */
  console.info('  → Sections + Lessons (curriculum específico por materia)...');
  const existingSections = await db.select().from(schema.sections);
  const courseIdsWithSections = new Set(existingSections.map((s) => s.courseId));

  let totalSectionsInserted = 0;
  let totalLessonsInserted = 0;

  for (const c of COURSES) {
    const course = courseBySlug.get(c.slug);
    if (!course || courseIdsWithSections.has(course.id)) continue;

    const insertedSections = await db
      .insert(schema.sections)
      .values(
        c.sections.map((s, idx) => ({
          courseId: course.id,
          title: s.title,
          position: idx + 1,
          isActive: true,
        })),
      )
      .returning();
    totalSectionsInserted += insertedSections.length;

    let lessonGlobalNumber = 0;
    const lessonValues: (typeof schema.lessons.$inferInsert)[] = [];
    for (let sIdx = 0; sIdx < insertedSections.length; sIdx++) {
      const section = insertedSections[sIdx]!;
      const tpl = c.sections[sIdx]!;
      tpl.lessons.forEach((lesson, lIdx) => {
        lessonGlobalNumber++;
        lessonValues.push({
          sectionId: section.id,
          courseId: course.id,
          slug: `${c.slug}-l${String(lessonGlobalNumber).padStart(2, '0')}`,
          title: lesson.title,
          description: `Lección ${lessonGlobalNumber}: ${lesson.title}`,
          content: buildLessonContent(c.title, tpl.title, lesson.title, lessonGlobalNumber),
          position: lIdx + 1,
          isFreePreview: lesson.isFreePreview ?? false,
          isActive: true,
        });
      });
    }
    if (lessonValues.length > 0) {
      await db.insert(schema.lessons).values(lessonValues).onConflictDoNothing();
      totalLessonsInserted += lessonValues.length;
    }
  }

  // Lookup de lessons por curso (necesario para enrollments+progreso)
  const allLessons = await db.select().from(schema.lessons);
  const lessonsByCourse = new Map<string, typeof allLessons>();
  for (const l of allLessons) {
    const arr = lessonsByCourse.get(l.courseId) ?? [];
    arr.push(l);
    lessonsByCourse.set(l.courseId, arr);
  }

  /* ─── 5b. Course schedules (bloques semanales, coherentes por año de malla) ─── */
  console.info('  → Course schedules (2 bloques/curso, sin choques por año)...');
  const existingSchedules = await db.select().from(schema.courseSchedules);
  const courseIdsWithSchedules = new Set(existingSchedules.map((s) => s.courseId));

  // Franjas horarias fijas [inicio, fin].
  const TIME_SLOTS: [string, string][] = [
    ['08:00', '10:00'],
    ['10:15', '12:15'],
    ['14:00', '16:00'],
    ['16:15', '18:15'],
  ];
  // Pares (día lun-vie × franja) ordenados por franja→día: dos consecutivos
  // caen en días distintos. Cada AÑO reutiliza esta secuencia desde el inicio,
  // de modo que dos materias del MISMO año nunca comparten día+hora (el alumno
  // cursa un solo año a la vez; 6 materias × 2 bloques = 12 ≤ 20 pares).
  const SLOT_PAIRS: { day: number; slot: [string, string] }[] = [];
  for (let s = 0; s < TIME_SLOTS.length; s++) {
    for (let d = 1; d <= 5; d++) {
      SLOT_PAIRS.push({ day: d, slot: TIME_SLOTS[s]! });
    }
  }

  // Agrupar por año académico y asignar la grilla dentro de cada año.
  const coursesByYearForSchedule = new Map<number, (typeof COURSES)[number][]>();
  for (const c of COURSES) {
    const arr = coursesByYearForSchedule.get(c.year) ?? [];
    arr.push(c);
    coursesByYearForSchedule.set(c.year, arr);
  }

  const scheduleValues: (typeof schema.courseSchedules.$inferInsert)[] = [];
  for (const [, yearCourses] of coursesByYearForSchedule) {
    yearCourses.forEach((c, j) => {
      const course = courseBySlug.get(c.slug);
      if (!course || courseIdsWithSchedules.has(course.id)) return;
      const a = SLOT_PAIRS[(j * 2) % SLOT_PAIRS.length]!;
      const b = SLOT_PAIRS[(j * 2 + 1) % SLOT_PAIRS.length]!;
      const room = `Aula ${(j % 6) + 1}`;
      scheduleValues.push(
        { courseId: course.id, dayOfWeek: a.day, startTime: a.slot[0], endTime: a.slot[1], room },
        { courseId: course.id, dayOfWeek: b.day, startTime: b.slot[0], endTime: b.slot[1], room },
      );
    });
  }
  if (scheduleValues.length > 0) {
    await db.insert(schema.courseSchedules).values(scheduleValues).onConflictDoNothing();
  }

  /* ─── 6. Evaluations + Questions ─── */
  console.info(`  → Evaluations (${COURSES.length} quizzes con preguntas)...`);
  const existingEvals = await db.select().from(schema.evaluations);
  const courseIdsWithEvals = new Set(existingEvals.map((e) => e.courseId));

  for (const c of COURSES) {
    const course = courseBySlug.get(c.slug);
    if (!course || courseIdsWithEvals.has(course.id)) continue;

    const quiz = c.quiz;
    const [evalRow] = await db
      .insert(schema.evaluations)
      .values({
        courseId: course.id,
        title: quiz.title,
        description: `Evaluación final del curso "${c.title}".`,
        difficulty:
          c.level === 'advanced' ? 'hard' : c.level === 'intermediate' ? 'medium' : 'easy',
        passingScore: '60.00',
        maxAttempts: 3,
        timeLimitMinutes: 20,
        isAiGenerated: false,
        createdBy: userByEmail.get(c.instructorEmail)!.id,
      })
      .returning();

    if (evalRow) {
      await db.insert(schema.evaluationQuestions).values(
        quiz.questions.map((q, idx) => ({
          evaluationId: evalRow.id,
          questionText: q.text,
          questionType: q.type,
          options: q.options
            ? q.options.map((o, i) => ({
                id: `opt-${idx}-${i}`,
                text: o.text,
                isCorrect: o.isCorrect,
              }))
            : null,
          correctAnswer: q.correctAnswer ?? null,
          points: String(q.points),
          position: idx + 1,
        })),
      );
    }
  }

  /* ─── 7. Enrollments por cohorte (año académico) ─── */
  console.info('  → Enrollments por cohorte (años previos completados + año actual variado)...');
  const existingEnrollments = await db.select().from(schema.enrollments);
  if (existingEnrollments.length === 0) {
    const coursesByYear = new Map<number, CourseSeed[]>();
    for (const c of COURSES) {
      const arr = coursesByYear.get(c.year) ?? [];
      arr.push(c);
      coursesByYear.set(c.year, arr);
    }

    const enrollmentInserts: (typeof schema.enrollments.$inferInsert)[] = [];
    const lessonProgressInserts: (typeof schema.lessonProgress.$inferInsert)[] = [];

    // ─── Calendario de matrícula (instituto, gestión anual) ───
    // Supuesto de dominio (revisable): la inscripción se abre en una ventana corta al
    // inicio de cada gestión; NO es continua como un MOOC. Cada cohorte matricula sus
    // materias de 1.º en su gestión de ingreso y las de 2.º en la gestión siguiente.
    const INSCRIPCION_WINDOW_DAYS = 21; // ancho de la ventana de inscripción (~3 semanas)

    let enrollmentSeq = 0;
    for (let sIdx = 0; sIdx < studentUsers.length; sIdx++) {
      const student = studentUsers[sIdx]!;
      const meta = STUDENTS[sIdx]!;

      // El estudiante cursa las materias de su año actual y de todos los previos.
      for (let y = 1; y <= meta.cohortYear; y++) {
        const yearCourses = coursesByYear.get(y) ?? [];
        for (const courseSeed of yearCourses) {
          const course = courseBySlug.get(courseSeed.slug);
          if (!course) continue;
          const lessons = lessonsByCourse.get(course.id) ?? [];
          const totalLessons = lessons.length;

          let progressRatio: number;
          let status: 'active' | 'completed';
          let completedAt: Date | null = null;

          // Gestión calendario en la que se matriculó esta materia:
          //   1.º → gestión de ingreso · 2.º → gestión de ingreso + 1.
          const gestionEnrolled = meta.entryGestion + (y - 1);
          const gestionesAtras = CURRENT_GESTION - gestionEnrolled; // 0 = gestión en curso
          const isPast = gestionesAtras > 0; // gestión ya cerrada → materia aprobada
          const gestionStartDaysAgo =
            CURRENT_GESTION_START_DAYS_AGO + gestionesAtras * GESTION_LENGTH_DAYS;
          // Jitter dentro de la ventana de inscripción (~3 semanas).
          const enrolledDaysAgo = gestionStartDaysAgo + (enrollmentSeq % INSCRIPCION_WINDOW_DAYS);
          const enrolledAt = new Date(Date.now() - enrolledDaysAgo * 86_400_000);

          if (isPast) {
            // Gestiones previas (incluye egresados): materia aprobada en su gestión.
            progressRatio = 1;
            status = 'completed';
            const daysToComplete = 150 + (enrollmentSeq % 90); // se cierra dentro de la gestión
            completedAt = new Date(enrolledAt.getTime() + daysToComplete * 86_400_000);
          } else {
            // Gestión en curso: progreso variado (≈30% completado, 50% en curso, 20% reciente).
            const bucket = enrollmentSeq % 10;
            if (bucket < 3) {
              progressRatio = 1;
              status = 'completed';
              // Completada hace poco, siempre después de matricular.
              const doneDaysAgo = Math.max(
                2,
                enrolledDaysAgo - (15 + Math.floor(Math.random() * 10)),
              );
              completedAt = new Date(Date.now() - doneDaysAgo * 86_400_000);
            } else if (bucket < 8) {
              progressRatio = 0.2 + Math.random() * 0.6; // 20-80%
              status = 'active';
            } else {
              progressRatio = Math.random() * 0.15; // 0-15%
              status = 'active';
            }
          }

          const lessonsCompleted = Math.round(totalLessons * progressRatio);

          enrollmentInserts.push({
            userId: student.id,
            courseId: course.id,
            enrolledAt,
            startedAt: lessonsCompleted > 0 ? enrolledAt : null,
            completedAt,
            progressPercentage: (progressRatio * 100).toFixed(2),
            lessonsCompleted,
            totalLessons,
            status,
          });
          enrollmentSeq++;
        }
      }
    }

    const insertedEnrollments: (typeof schema.enrollments.$inferSelect)[] = [];
    for (const batch of chunk(enrollmentInserts)) {
      const rows = await db
        .insert(schema.enrollments)
        .values(batch)
        .onConflictDoNothing()
        .returning();
      insertedEnrollments.push(...rows);
    }

    // Lesson progress por enrollment (marca lessons completadas)
    for (const e of insertedEnrollments) {
      const lessons = lessonsByCourse.get(e.courseId) ?? [];
      for (let i = 0; i < e.lessonsCompleted && i < lessons.length; i++) {
        const lesson = lessons[i]!;
        lessonProgressInserts.push({
          enrollmentId: e.id,
          userId: e.userId,
          lessonId: lesson.id,
          isCompleted: true,
          completedAt: new Date(Date.now() - Math.floor(Math.random() * 30) * 86_400_000),
        });
      }
    }
    for (const batch of chunk(lessonProgressInserts)) {
      await db.insert(schema.lessonProgress).values(batch);
    }

    // Update courses.totalStudents
    for (const course of coursesRows) {
      const count = insertedEnrollments.filter((e) => e.courseId === course.id).length;
      if (count > 0) {
        await db
          .update(schema.courses)
          .set({ totalStudents: count })
          .where(eq(schema.courses.id, course.id));
      }
    }
  }

  /* ─── 8. Certificates ─── */
  console.info('  → Certificates (1 por enrollment completed)...');
  const existingCerts = await db.select().from(schema.certificates);
  if (existingCerts.length === 0) {
    const completedEnrollments = await db
      .select()
      .from(schema.enrollments)
      .where(eq(schema.enrollments.status, 'completed'));

    const certInserts: (typeof schema.certificates.$inferInsert)[] = completedEnrollments.map(
      (e, idx) => ({
        studentId: e.userId,
        courseId: e.courseId,
        enrollmentId: e.id,
        certificateCode: genCertCode(idx + 1),
        issuedAt: e.completedAt ?? new Date(),
        finalScore: '85.00',
      }),
    );
    for (const batch of chunk(certInserts)) {
      await db.insert(schema.certificates).values(batch).onConflictDoNothing();
    }
  }

  /* ─── Resumen ─── */
  console.info('\n✅ Seed completado');
  console.info(`   • ${roles.length} roles`);
  console.info(
    `   • ${users.length} usuarios (1 admin + ${INSTRUCTORS.length} docentes + ${STUDENTS.length} estudiantes)`,
  );
  console.info(`   • ${coursesRows.length} materias (malla 2 años / 4 semestres)`);
  console.info(`   • ${totalSectionsInserted} secciones nuevas`);
  console.info(`   • ${totalLessonsInserted} lecciones nuevas`);
  const finalEnrollments = await db.select().from(schema.enrollments);
  const finalCerts = await db.select().from(schema.certificates);
  console.info(`   • ${finalEnrollments.length} inscripciones (cohortes por año)`);
  console.info(`   • ${finalCerts.length} certificados emitidos`);

  console.info('\n🔐 Credenciales de prueba (todas las cuentas: Cieba2025!):');
  console.info('   👑 admin@cieba.edu.bo');
  console.info('   👨‍🏫 j.flores@cieba.edu.bo (docente · fundamentos y valoración)');
  console.info('   👩‍🏫 m.rocha@cieba.edu.bo (docente · farmacología)');
  console.info('   👨‍🏫 d.gutierrez@cieba.edu.bo (docente · urgencias y médico-quirúrgica)');
  console.info('   👩‍🏫 p.salazar@cieba.edu.bo (docente · materno-infantil, pediatría y nutrición)');
  console.info('   👨‍🏫 c.aliaga@cieba.edu.bo (docente · bioseguridad, comunitaria y gestión)');
  console.info(
    `   🎓 estudiante001@cieba.edu.bo … estudiante${String(STUDENTS.length).padStart(3, '0')}@cieba.edu.bo`,
  );
  console.info('      (cohortes por gestión: 2024 egresados · 2025 → 2.º año · 2026 → 1.º año)');

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
