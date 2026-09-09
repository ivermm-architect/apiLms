import { resolve } from 'node:path';

import { config } from 'dotenv';
config({ path: resolve(process.cwd(), '../../.env') });
import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index';

/* ─────────────────────────────────────────────────────────────
   CIEBA LMS · Seed de DEMO — estudiante de 1.er año completo
   ─────────────────────────────────────────────────────────────
   Construye un caso de demostración cerrado alrededor de UN
   estudiante de primer año y sus docentes, con alcance limitado a
   las 6 materias del 1.er año de la malla.

   Existe porque ni `seed` ni `seed-validation` crean `competencies`
   ni `question_competencies`, y sin esas dos tablas la cadena

     evaluation_answers → evaluation_questions → question_competencies
                        → competencies → getWeakCompetencies()

   devuelve siempre [], de modo que el recomendador (HIST-7), el
   dominio por competencia y el explicador IA quedan mudos.

   Qué puebla:
     A · Identidad del estudiante demo (nombre propio, sin colisión)
     B · competencies            (17 en 1.er año + 7 gemelas en 2.º)
     C · lesson_competencies     (lección ↔ competencia de su sección)
     D · evaluation_questions    (banco: de 3 a 10 ítems por quiz)
     E · question_competencies   (cada ítem etiquetado)
     F · course_grade_weights + course_activities
     G · Progreso del estudiante alineado a su perfil
     H · evaluation_attempts + evaluation_answers (dominio exacto)
     I · grades                  (examen + prácticas + actividades)
     J · reports + alerts
     K · recommendation_ai

   Idempotente: reejecutable sin duplicar (borra lo suyo y reinserta).
   Autónomo: NO depende de `seed-validation`.
   Debe correr DESPUÉS de: pnpm db:seed
   ───────────────────────────────────────────────────────────── */

/** Estudiante golden demo: primero de la cohorte 2026 (1.er año). */
const DEMO_STUDENT_EMAIL = 'estudiante151@cieba.edu.bo';
/** Nombre propio para que no colisione con el generado para estudiante071. */
const DEMO_STUDENT_NAME = { firstName: 'Rosa Elena', lastName: 'Quispe Mamani' };

/** Puntaje por ítem: el seed base usa 10 en todas las preguntas. */
const QUESTION_POINTS = '10';

/** Marca de posición: los ítems creados aquí viven de 100 en adelante. */
const DEMO_QUESTION_POSITION_BASE = 100;

/* ─── Catálogo de competencias ──────────────────────────────────

   `rankRecommendations` empareja competencias POR NOMBRE NORMALIZADO
   entre cursos (recommendation.ts:53-60). Por eso las competencias
   marcadas con ★ se repiten literalmente en una materia de 2.º año:
   son el destino al que apunta el recomendador cuando el estudiante
   queda débil en ellas. Sin esas gemelas el ranking cae a
   "Curso popular entre estudiantes" y se pierde la justificación.  */

interface CompetencySeed {
  code: string;
  name: string;
  /** Título de la sección del curso a la que se mapean sus lecciones. */
  section: string;
  description: string;
}

interface CourseSeed {
  slug: string;
  competencies: CompetencySeed[];
}

const YEAR1: CourseSeed[] = [
  {
    slug: 'fundamentos-enfermeria',
    competencies: [
      {
        code: 'FUN-01',
        name: 'Bases conceptuales de la enfermería',
        section: 'Bases conceptuales de la enfermería',
        description: 'Comprende el objeto, los roles y los modelos teóricos de la profesión.',
      },
      {
        code: 'FUN-02',
        name: 'Valoración del paciente',
        section: 'El Proceso de Atención de Enfermería (PAE)',
        description: 'Recolecta e interpreta datos objetivos y subjetivos del paciente.',
      },
      {
        code: 'FUN-03',
        name: 'Administración de medicamentos',
        section: 'Cuidados básicos y confort del paciente',
        description: 'Aplica los correctos de la administración segura de fármacos.',
      },
    ],
  },
  {
    slug: 'anatomia-fisiologia-humana',
    competencies: [
      {
        code: 'ANA-01',
        name: 'Organización del cuerpo humano',
        section: 'Organización general del cuerpo humano',
        description: 'Identifica niveles de organización, planos y cavidades corporales.',
      },
      {
        code: 'ANA-02',
        name: 'Sistemas de sostén y movimiento',
        section: 'Sistemas de sostén, movimiento y regulación',
        description: 'Describe la estructura y función del sistema osteomuscular y nervioso.',
      },
      {
        code: 'ANA-03',
        name: 'Sistemas de mantenimiento vital',
        section: 'Sistemas de mantenimiento vital',
        description: 'Explica los sistemas cardiovascular, respiratorio, digestivo y renal.',
      },
    ],
  },
  {
    slug: 'bioseguridad-control-infecciones',
    competencies: [
      {
        code: 'BIO-01',
        name: 'Principios de bioseguridad',
        section: 'Principios de bioseguridad',
        description: 'Aplica precauciones estándar y uso correcto del equipo de protección.',
      },
      {
        code: 'BIO-02',
        name: 'Control de infecciones',
        section: 'Asepsia, antisepsia y esterilización',
        description: 'Ejecuta asepsia, antisepsia y esterilización para cortar la transmisión.',
      },
      {
        code: 'BIO-03',
        name: 'Manejo de residuos y aislamiento',
        section: 'Aislamiento y manejo de residuos',
        description: 'Clasifica residuos y aplica el tipo de aislamiento que corresponde.',
      },
    ],
  },
  {
    slug: 'microbiologia-parasitologia',
    competencies: [
      {
        code: 'MIC-01',
        name: 'Microbiología básica',
        section: 'Introducción a la microbiología',
        description: 'Reconoce los grupos de microorganismos y su relevancia clínica.',
      },
      {
        code: 'MIC-02',
        name: 'Cadena epidemiológica',
        section: 'Infección y cadena epidemiológica',
        description: 'Identifica los eslabones de la cadena y los puntos donde se corta.',
      },
      {
        code: 'MIC-03',
        name: 'Parasitología clínica',
        section: 'Parasitología clínica',
        description: 'Reconoce los parásitos de mayor prevalencia y su transmisión.',
      },
    ],
  },
  {
    slug: 'primeros-auxilios-rcp',
    competencies: [
      {
        code: 'PRA-01',
        name: 'Soporte vital básico y RCP',
        section: 'Soporte Vital Básico (SVB) y RCP',
        description: 'Ejecuta la cadena de supervivencia y la RCP de alta calidad.',
      },
      {
        code: 'PRA-02',
        name: 'Atención de urgencias',
        section: 'Obstrucción de la vía aérea y valoración',
        description: 'Valora y prioriza a la víctima en una situación de urgencia.',
      },
      {
        code: 'PRA-03',
        name: 'Manejo de lesiones frecuentes',
        section: 'Atención de lesiones frecuentes',
        description: 'Atiende hemorragias, quemaduras, fracturas y heridas.',
      },
    ],
  },
  {
    slug: 'etica-deontologia-enfermeria',
    competencies: [
      {
        code: 'ETI-01',
        name: 'Ética profesional',
        section: 'Fundamentos de la ética profesional',
        description: 'Aplica los principios bioéticos en la toma de decisiones del cuidado.',
      },
      {
        code: 'ETI-02',
        name: 'Derechos del paciente',
        section: 'Derechos del paciente y práctica responsable',
        description: 'Respeta el consentimiento informado, la confidencialidad y la dignidad.',
      },
    ],
  },
];

/** Competencias "gemelas" en 2.º año: destino del recomendador. */
const YEAR2_TWINS: { slug: string; competencies: Omit<CompetencySeed, 'section'>[] }[] = [
  {
    slug: 'signos-vitales-valoracion',
    competencies: [
      {
        code: 'SIG-01',
        name: 'Valoración del paciente',
        description: 'Profundiza la valoración integral por patrones funcionales.',
      },
    ],
  },
  {
    slug: 'farmacologia',
    competencies: [
      {
        code: 'FAR-01',
        name: 'Administración de medicamentos',
        description: 'Cálculo de dosis, vías y administración segura de fármacos.',
      },
    ],
  },
  {
    slug: 'enfermeria-medico-quirurgica',
    competencies: [
      {
        code: 'MQX-01',
        name: 'Control de infecciones',
        description: 'Prevención de infecciones asociadas a la atención en salud.',
      },
      {
        code: 'MQX-02',
        name: 'Sistemas de mantenimiento vital',
        description: 'Cuidados médicos por sistemas en el paciente hospitalizado.',
      },
    ],
  },
  {
    slug: 'urgencias-emergencias',
    competencies: [
      {
        code: 'URG-01',
        name: 'Atención de urgencias',
        description: 'Triaje, manejo del paciente crítico y estabilización.',
      },
    ],
  },
  {
    slug: 'salud-comunitaria-promocion',
    competencies: [
      {
        code: 'COM-01',
        name: 'Cadena epidemiológica',
        description: 'Vigilancia epidemiológica y control de brotes en la comunidad.',
      },
      {
        code: 'COM-02',
        name: 'Ética profesional',
        description: 'Ética aplicada al trabajo comunitario y la equidad en salud.',
      },
    ],
  },
];

/* ─── Banco de ítems ────────────────────────────────────────────
   7 ítems nuevos por quiz de 1.er año (los 3 del seed base se
   conservan y también quedan etiquetados). `comp` es el código de
   la competencia que mide el ítem.                               */

type Difficulty = 'easy' | 'medium' | 'hard';

interface QuestionSeed {
  comp: string;
  text: string;
  difficulty: Difficulty;
  options: [string, string, string, string];
  /** Índice (0..3) de la opción correcta. */
  answer: number;
}

const QUESTION_BANK: Record<string, QuestionSeed[]> = {
  'fundamentos-enfermeria': [
    {
      comp: 'FUN-01',
      text: '¿Cuál es el objeto de estudio propio de la disciplina de enfermería?',
      difficulty: 'easy',
      options: [
        'La enfermedad y su tratamiento farmacológico',
        'El cuidado de la respuesta humana ante procesos de salud y enfermedad',
        'El diagnóstico por imágenes',
        'La administración hospitalaria',
      ],
      answer: 1,
    },
    {
      comp: 'FUN-01',
      text: 'Según Virginia Henderson, el rol de la enfermera es asistir a la persona en las actividades que contribuyen a su salud hasta que:',
      difficulty: 'medium',
      options: [
        'El médico autorice el alta',
        'La persona recupere su independencia',
        'Se agoten los recursos del servicio',
        'Finalice el turno asignado',
      ],
      answer: 1,
    },
    {
      comp: 'FUN-01',
      text: 'La diferencia esencial entre diagnóstico médico y diagnóstico enfermero es que este último:',
      difficulty: 'hard',
      options: [
        'Identifica el agente etiológico de la enfermedad',
        'Solo puede formularse en el servicio de urgencias',
        'Describe la respuesta de la persona ante la condición de salud',
        'Sustituye al diagnóstico médico en la historia clínica',
      ],
      answer: 2,
    },
    {
      comp: 'FUN-02',
      text: 'En la etapa de valoración del PAE, ¿qué se considera un dato objetivo?',
      difficulty: 'easy',
      options: [
        'El dolor que el paciente refiere',
        'La náusea que el paciente describe',
        'Una temperatura axilar de 38,5 °C medida por la enfermera',
        'La preocupación que el paciente expresa',
      ],
      answer: 2,
    },
    {
      comp: 'FUN-02',
      text: '¿Cuál es el orden correcto de las cinco etapas del PAE?',
      difficulty: 'medium',
      options: [
        'Valoración, diagnóstico, planificación, ejecución, evaluación',
        'Diagnóstico, valoración, ejecución, planificación, evaluación',
        'Planificación, valoración, diagnóstico, evaluación, ejecución',
        'Valoración, planificación, diagnóstico, evaluación, ejecución',
      ],
      answer: 0,
    },
    {
      comp: 'FUN-03',
      text: 'Entre los "correctos" de la administración de medicamentos, ¿cuál se verifica siempre antes de administrar?',
      difficulty: 'easy',
      options: [
        'El color del envase',
        'El paciente correcto',
        'La marca del laboratorio',
        'El precio del fármaco',
      ],
      answer: 1,
    },
    {
      comp: 'FUN-03',
      text: 'Si la indicación médica resulta ilegible o dudosa, la conducta correcta de enfermería es:',
      difficulty: 'medium',
      options: [
        'Administrar la dosis habitual del servicio',
        'Consultar y confirmar con quien prescribió antes de administrar',
        'Delegar la decisión al familiar del paciente',
        'Omitir el registro para no dejar constancia',
      ],
      answer: 1,
    },
  ],
  'anatomia-fisiologia-humana': [
    {
      comp: 'ANA-01',
      text: 'El plano que divide el cuerpo en mitades derecha e izquierda se denomina:',
      difficulty: 'easy',
      options: ['Plano transversal', 'Plano sagital medio', 'Plano coronal', 'Plano oblicuo'],
      answer: 1,
    },
    {
      comp: 'ANA-01',
      text: 'Ordenados de menor a mayor complejidad, los niveles de organización del cuerpo son:',
      difficulty: 'medium',
      options: [
        'Célula, tejido, órgano, sistema, organismo',
        'Tejido, célula, sistema, órgano, organismo',
        'Órgano, célula, tejido, organismo, sistema',
        'Célula, órgano, tejido, sistema, organismo',
      ],
      answer: 0,
    },
    {
      comp: 'ANA-01',
      text: 'La cavidad torácica está separada de la cavidad abdominal por:',
      difficulty: 'hard',
      options: ['El peritoneo', 'La pleura parietal', 'El diafragma', 'El mediastino'],
      answer: 2,
    },
    {
      comp: 'ANA-02',
      text: 'El tejido muscular que forma la pared del corazón es:',
      difficulty: 'easy',
      options: ['Músculo liso', 'Músculo esquelético', 'Músculo cardíaco', 'Tejido conectivo'],
      answer: 2,
    },
    {
      comp: 'ANA-02',
      text: 'La unidad funcional del sistema nervioso es:',
      difficulty: 'medium',
      options: ['La neurona', 'El nefrón', 'El alvéolo', 'El sarcómero'],
      answer: 0,
    },
    {
      comp: 'ANA-03',
      text: 'El intercambio gaseoso en el pulmón ocurre en:',
      difficulty: 'easy',
      options: ['Los bronquios', 'La tráquea', 'Los alvéolos', 'La laringe'],
      answer: 2,
    },
    {
      comp: 'ANA-03',
      text: 'La unidad funcional del riñón encargada de filtrar la sangre es:',
      difficulty: 'medium',
      options: ['El uréter', 'La nefrona', 'El glomérulo hepático', 'El hilio renal'],
      answer: 1,
    },
  ],
  'bioseguridad-control-infecciones': [
    {
      comp: 'BIO-01',
      text: 'Las precauciones estándar deben aplicarse:',
      difficulty: 'easy',
      options: [
        'Solo con pacientes con diagnóstico infeccioso confirmado',
        'Con todos los pacientes, independientemente de su diagnóstico',
        'Solo en el quirófano',
        'Solo cuando lo indique el médico tratante',
      ],
      answer: 1,
    },
    {
      comp: 'BIO-01',
      text: 'Al retirar el equipo de protección personal, el orden correcto termina con:',
      difficulty: 'hard',
      options: ['La higiene de manos', 'Los guantes', 'La bata', 'Las gafas protectoras'],
      answer: 0,
    },
    {
      comp: 'BIO-01',
      text: 'La medida aislada más eficaz para prevenir infecciones asociadas a la atención en salud es:',
      difficulty: 'easy',
      options: [
        'El uso permanente de guantes',
        'La higiene de manos',
        'La antibioticoterapia profiláctica',
        'El aislamiento de todos los pacientes',
      ],
      answer: 1,
    },
    {
      comp: 'BIO-02',
      text: 'La esterilización se diferencia de la desinfección de alto nivel en que la primera:',
      difficulty: 'medium',
      options: [
        'Elimina solo bacterias vegetativas',
        'Destruye toda forma de vida microbiana, incluidas las esporas',
        'Se aplica únicamente a superficies',
        'No requiere control de proceso',
      ],
      answer: 1,
    },
    {
      comp: 'BIO-02',
      text: 'Un material considerado crítico, por ingresar a tejido estéril, requiere:',
      difficulty: 'hard',
      options: [
        'Limpieza con agua y jabón',
        'Desinfección de bajo nivel',
        'Esterilización',
        'Solo secado al aire',
      ],
      answer: 2,
    },
    {
      comp: 'BIO-03',
      text: 'Los residuos punzocortantes deben desecharse en:',
      difficulty: 'easy',
      options: [
        'Bolsa negra común',
        'Recipiente rígido resistente a punción',
        'Bolsa roja sin recipiente',
        'Contenedor de reciclaje',
      ],
      answer: 1,
    },
    {
      comp: 'BIO-03',
      text: 'Ante un paciente con tuberculosis pulmonar bacilífera corresponde aislamiento de tipo:',
      difficulty: 'medium',
      options: ['Por contacto', 'Por gotas', 'Aéreo', 'Protector o inverso'],
      answer: 2,
    },
  ],
  'microbiologia-parasitologia': [
    {
      comp: 'MIC-01',
      text: 'A diferencia de las bacterias, los virus se caracterizan por:',
      difficulty: 'medium',
      options: [
        'Tener pared celular de peptidoglicano',
        'Ser parásitos intracelulares obligados',
        'Reproducirse por fisión binaria',
        'Responder a los antibióticos betalactámicos',
      ],
      answer: 1,
    },
    {
      comp: 'MIC-01',
      text: 'La tinción de Gram permite clasificar a las bacterias según:',
      difficulty: 'easy',
      options: [
        'Su tamaño',
        'La composición de su pared celular',
        'Su temperatura óptima',
        'Su velocidad de crecimiento',
      ],
      answer: 1,
    },
    {
      comp: 'MIC-01',
      text: 'La flora normal o microbiota residente cumple la función protectora de:',
      difficulty: 'hard',
      options: [
        'Producir anticuerpos específicos',
        'Competir con microorganismos patógenos por nutrientes y espacio',
        'Sustituir a los linfocitos T',
        'Esterilizar la superficie cutánea',
      ],
      answer: 1,
    },
    {
      comp: 'MIC-02',
      text: '¿Cuál de los siguientes NO es un eslabón de la cadena epidemiológica?',
      difficulty: 'medium',
      options: [
        'Agente causal',
        'Puerta de salida',
        'Huésped susceptible',
        'Tratamiento antibiótico',
      ],
      answer: 3,
    },
    {
      comp: 'MIC-02',
      text: 'El lavado de manos actúa cortando principalmente el eslabón de:',
      difficulty: 'hard',
      options: ['Agente causal', 'Mecanismo de transmisión', 'Reservorio', 'Huésped susceptible'],
      answer: 1,
    },
    {
      comp: 'MIC-03',
      text: 'La giardiasis se transmite principalmente por vía:',
      difficulty: 'easy',
      options: ['Fecal-oral', 'Aérea', 'Sexual', 'Vectorial por mosquito'],
      answer: 0,
    },
    {
      comp: 'MIC-03',
      text: 'La enfermedad de Chagas, endémica en zonas de Bolivia, es transmitida por:',
      difficulty: 'medium',
      options: [
        'El mosquito Anopheles',
        'La vinchuca (Triatoma infestans)',
        'La garrapata del ganado',
        'El caracol de agua dulce',
      ],
      answer: 1,
    },
  ],
  'primeros-auxilios-rcp': [
    {
      comp: 'PRA-01',
      text: 'En un adulto, la frecuencia de compresiones torácicas en RCP debe ser de:',
      difficulty: 'easy',
      options: [
        '60 a 80 por minuto',
        '100 a 120 por minuto',
        '140 a 160 por minuto',
        'Tan rápido como sea posible',
      ],
      answer: 1,
    },
    {
      comp: 'PRA-01',
      text: 'La relación compresión-ventilación en RCP de adulto con un solo reanimador es:',
      difficulty: 'medium',
      options: ['15:2', '30:2', '5:1', '10:1'],
      answer: 1,
    },
    {
      comp: 'PRA-01',
      text: 'La profundidad correcta de las compresiones torácicas en el adulto es de:',
      difficulty: 'hard',
      options: ['2 a 3 cm', '5 a 6 cm', '8 a 10 cm', 'La que permita la fuerza del reanimador'],
      answer: 1,
    },
    {
      comp: 'PRA-02',
      text: 'Ante una obstrucción completa de la vía aérea en un adulto consciente corresponde:',
      difficulty: 'easy',
      options: [
        'Iniciar compresiones torácicas de inmediato',
        'Aplicar la maniobra de Heimlich',
        'Dar de beber agua',
        'Colocar al paciente en decúbito supino y esperar',
      ],
      answer: 1,
    },
    {
      comp: 'PRA-02',
      text: 'En el triaje de emergencias, el color rojo identifica al paciente que:',
      difficulty: 'medium',
      options: [
        'Puede esperar sin riesgo',
        'Requiere atención inmediata por riesgo vital',
        'Ha fallecido',
        'Presenta lesiones leves',
      ],
      answer: 1,
    },
    {
      comp: 'PRA-03',
      text: 'La primera medida ante una hemorragia externa abundante es:',
      difficulty: 'easy',
      options: [
        'Aplicar torniquete de inmediato',
        'Ejercer presión directa sobre la herida',
        'Lavar la herida con alcohol',
        'Elevar los pies del paciente',
      ],
      answer: 1,
    },
    {
      comp: 'PRA-03',
      text: 'Ante una quemadura de segundo grado, la conducta correcta es:',
      difficulty: 'medium',
      options: [
        'Romper las ampollas para drenarlas',
        'Aplicar hielo directo sobre la lesión',
        'Enfriar con agua a temperatura ambiente y cubrir con apósito limpio',
        'Cubrir con pasta dental o aceite',
      ],
      answer: 2,
    },
  ],
  'etica-deontologia-enfermeria': [
    {
      comp: 'ETI-01',
      text: 'El principio bioético que obliga a no causar daño al paciente se denomina:',
      difficulty: 'easy',
      options: ['Autonomía', 'No maleficencia', 'Justicia', 'Beneficencia'],
      answer: 1,
    },
    {
      comp: 'ETI-01',
      text: 'Respetar la decisión de un paciente competente que rechaza un tratamiento corresponde al principio de:',
      difficulty: 'medium',
      options: ['Justicia', 'Beneficencia', 'Autonomía', 'No maleficencia'],
      answer: 2,
    },
    {
      comp: 'ETI-01',
      text: 'Distribuir equitativamente los recursos limitados de un servicio responde al principio de:',
      difficulty: 'medium',
      options: ['Justicia', 'Autonomía', 'Confidencialidad', 'Beneficencia'],
      answer: 0,
    },
    {
      comp: 'ETI-02',
      text: 'Para que el consentimiento informado sea válido, el paciente debe:',
      difficulty: 'medium',
      options: [
        'Firmar el documento sin necesidad de explicación',
        'Recibir información comprensible y decidir de forma libre',
        'Contar con la autorización de un familiar siempre',
        'Aceptar lo que indique el equipo tratante',
      ],
      answer: 1,
    },
    {
      comp: 'ETI-02',
      text: 'Comentar el diagnóstico de un paciente en el pasillo del hospital vulnera:',
      difficulty: 'easy',
      options: [
        'El principio de justicia distributiva',
        'El deber de confidencialidad',
        'La jerarquía del servicio',
        'El protocolo de bioseguridad',
      ],
      answer: 1,
    },
    {
      comp: 'ETI-02',
      text: 'Ante una indicación que el profesional considera perjudicial para el paciente, corresponde:',
      difficulty: 'hard',
      options: [
        'Ejecutarla sin observaciones por respeto a la jerarquía',
        'Plantear la objeción y dejar constancia escrita antes de actuar',
        'Delegarla en un colega con menos experiencia',
        'Omitirla sin informar a nadie',
      ],
      answer: 1,
    },
  ],
};

/* ─── Respuestas a las preguntas abiertas ───────────────────────
   Cada quiz del seed base trae UNA pregunta abierta. El estudiante
   demo las responde, pero quedan SIN calificar (is_correct = null,
   sin feedback): ese es justamente el estado que habilita la demo de
   sugerencia de retroalimentación con IA al calificar. Al ser null,
   quedan excluidas del cálculo de dominio.                        */

const OPEN_ANSWERS: Record<string, string> = {
  'fundamentos-enfermeria':
    'Realizar cambios de posición cada dos horas, valorando los puntos de apoyo en cada movilización y manteniendo la piel limpia y seca.',
  'anatomia-fisiologia-humana':
    'Aurícula derecha, ventrículo derecho, aurícula izquierda y ventrículo izquierdo.',
  'bioseguridad-control-infecciones':
    'En un recipiente rígido, resistente a la punción y rotulado, que no debe llenarse más allá de las tres cuartas partes.',
  'microbiologia-parasitologia':
    'Agente causal, reservorio, puerta de salida, mecanismo de transmisión, puerta de entrada y huésped susceptible.',
  'primeros-auxilios-rcp':
    'Comprobar que la escena sea segura, verificar la respuesta de la víctima y pedir ayuda activando el sistema de emergencias.',
  'etica-deontologia-enfermeria':
    'Es la aceptación libre y voluntaria de un procedimiento por parte del paciente, después de recibir información comprensible sobre en qué consiste, sus riesgos y sus alternativas.',
};

/* ─── Perfil de desempeño del estudiante demo ───────────────────

   Por competencia: cuántos ítems la miden y cuántos acierta. El
   dominio resultante es EXACTO (aciertos/total), no aleatorio, para
   que la demo sea reproducible ante el tribunal.

   Diseño deliberado: 4 competencias quedan bajo el umbral de 0,60
   (WEAK_MASTERY_THRESHOLD) y las cuatro tienen gemela en 2.º año,
   de modo que el recomendador devuelve 4 cursos con justificación
   real en lugar de "curso popular".                               */

const TARGET: Record<string, number> = {
  // Fundamentos — fuerte, con una debilidad puntual muy visible
  'FUN-01': 0.75,
  'FUN-02': 1.0,
  'FUN-03': 0.33, // ← débil ★ gemela en Farmacología
  // Anatomía — sólido medio
  'ANA-01': 0.75,
  'ANA-02': 0.67,
  'ANA-03': 0.67,
  // Bioseguridad — irregular
  'BIO-01': 0.75,
  'BIO-02': 0.33, // ← débil ★ gemela en Médico-Quirúrgica
  'BIO-03': 0.67,
  // Microbiología — irregular
  'MIC-01': 0.75,
  'MIC-02': 0.33, // ← débil ★ gemela en Salud Comunitaria
  'MIC-03': 0.67,
  // Primeros auxilios — la materia floja
  'PRA-01': 0.5, // ← débil (sin gemela)
  'PRA-02': 0.33, // ← débil ★ gemela en Urgencias
  'PRA-03': 0.67,
  // Ética — la materia fuerte
  'ETI-01': 1.0,
  'ETI-02': 0.8,
};

/**
 * Cuántos ítems debe acertar el estudiante en una competencia con `n` ítems
 * puntuables para alcanzar el dominio objetivo. Se calcula sobre el número REAL
 * de ítems etiquetados (no sobre un conteo declarado a mano, que se desincroniza
 * en cuanto cambia el banco) y se ajusta para que el resultado caiga siempre del
 * mismo lado del umbral de 0,60 que indica el objetivo: una competencia diseñada
 * como débil nunca debe quedar por encima del umbral por un redondeo.
 */
function correctCountFor(target: number, n: number): number {
  if (n <= 0) return 0;
  const k = Math.round(target * n);
  const threshold = Math.ceil(WEAK_THRESHOLD * n);
  if (target < WEAK_THRESHOLD) {
    // Débil: como máximo, uno menos de los que harían falta para llegar al umbral.
    return Math.max(0, Math.min(k, threshold - 1));
  }
  return Math.min(n, Math.max(k, threshold));
}

/** Espejo de WEAK_MASTERY_THRESHOLD del dominio del recomendador. */
const WEAK_THRESHOLD = 0.6;

/** Avance por curso, coherente con el desempeño. */
const PROGRESS: Record<string, number> = {
  'fundamentos-enfermeria': 100,
  'etica-deontologia-enfermeria': 100,
  'anatomia-fisiologia-humana': 85,
  'microbiologia-parasitologia': 78,
  'bioseguridad-control-infecciones': 62,
  'primeros-auxilios-rcp': 48,
};

/** Actividades manuales del docente por curso (2 prácticas + 2 actividades). */
const ACTIVITIES: { title: string; category: 'practica' | 'actividad' }[] = [
  { title: 'Práctica de laboratorio 1', category: 'practica' },
  { title: 'Práctica de laboratorio 2', category: 'practica' },
  { title: 'Trabajo de investigación', category: 'actividad' },
  { title: 'Exposición grupal', category: 'actividad' },
];

/** Nota del estudiante en cada actividad, por curso (sobre 100). */
const ACTIVITY_SCORES: Record<string, [number, number, number, number]> = {
  'fundamentos-enfermeria': [88, 92, 85, 90],
  'etica-deontologia-enfermeria': [95, 90, 93, 96],
  'anatomia-fisiologia-humana': [78, 72, 80, 75],
  'microbiologia-parasitologia': [70, 75, 68, 72],
  'bioseguridad-control-infecciones': [62, 58, 65, 60],
  'primeros-auxilios-rcp': [50, 45, 55, 48],
};

const now = new Date();
const daysAgo = (n: number): Date => new Date(now.getTime() - n * 86_400_000);

/* ─── Main ─────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://cieba:cieba_dev_password@localhost:5433/cieba_lms';
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  console.info('🎓 Seed de DEMO — estudiante de 1.er año completo...');

  /* ── A · Estudiante demo ── */
  const [student] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, DEMO_STUDENT_EMAIL))
    .limit(1);

  if (!student) {
    console.error(`❌ No existe ${DEMO_STUDENT_EMAIL}. Ejecuta primero: pnpm db:seed`);
    await client.end();
    process.exit(1);
  }

  await db
    .update(schema.users)
    .set({ firstName: DEMO_STUDENT_NAME.firstName, lastName: DEMO_STUDENT_NAME.lastName })
    .where(eq(schema.users.id, student.id));

  console.info(
    `  → Estudiante: ${DEMO_STUDENT_NAME.firstName} ${DEMO_STUDENT_NAME.lastName} <${DEMO_STUDENT_EMAIL}>`,
  );

  /* ── Cargar catálogo ── */
  const allCourses = await db.select().from(schema.courses);
  const courseBySlug = new Map(allCourses.map((c) => [c.slug, c]));

  const year1Slugs = YEAR1.map((c) => c.slug);
  const year1Courses = year1Slugs.map((s) => courseBySlug.get(s)).filter((c) => c != null);
  if (year1Courses.length !== YEAR1.length) {
    console.error('❌ Faltan cursos de 1.er año. Ejecuta primero: pnpm db:seed');
    await client.end();
    process.exit(1);
  }
  const year1Ids = year1Courses.map((c) => c!.id);

  const sections = await db.select().from(schema.sections);
  const lessons = await db.select().from(schema.lessons);

  /* ── B · Competencias ── */
  const compRows: (typeof schema.competencies.$inferInsert)[] = [];
  for (const course of YEAR1) {
    const c = courseBySlug.get(course.slug)!;
    for (const comp of course.competencies) {
      compRows.push({
        courseId: c.id,
        code: comp.code,
        name: comp.name,
        description: comp.description,
      });
    }
  }
  const missingTwins: string[] = [];
  for (const course of YEAR2_TWINS) {
    const c = courseBySlug.get(course.slug);
    if (!c) {
      // Un slug equivocado aquí no rompe nada visible: simplemente el curso se
      // queda sin competencia y el recomendador nunca lo empareja, cayendo a
      // "Curso popular". Por eso se reporta en vez de saltarse en silencio.
      missingTwins.push(course.slug);
      continue;
    }
    for (const comp of course.competencies) {
      compRows.push({
        courseId: c.id,
        code: comp.code,
        name: comp.name,
        description: comp.description,
      });
    }
  }
  if (missingTwins.length > 0) {
    console.warn(`  ⚠️  Slugs de 2.º año no encontrados (sin gemela): ${missingTwins.join(', ')}`);
  }
  await db.insert(schema.competencies).values(compRows).onConflictDoNothing();

  const competencies = await db.select().from(schema.competencies);
  const compByCode = new Map(competencies.map((c) => [`${c.courseId}:${c.code}`, c]));
  /** Código de competencia (p. ej. FUN-02) → fila, dentro de 1.er año. */
  const compByShortCode = new Map<string, (typeof competencies)[number]>();
  for (const course of YEAR1) {
    const c = courseBySlug.get(course.slug)!;
    for (const comp of course.competencies) {
      const row = compByCode.get(`${c.id}:${comp.code}`);
      if (row) compByShortCode.set(comp.code, row);
    }
  }
  console.info(`  → Competencias: ${compRows.length} declaradas (${competencies.length} en BD)`);

  /* ── C · lesson_competencies ── */
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const lcRows: (typeof schema.lessonCompetencies.$inferInsert)[] = [];
  for (const course of YEAR1) {
    const c = courseBySlug.get(course.slug)!;
    const bySection = new Map(course.competencies.map((comp) => [comp.section, comp.code]));
    for (const lesson of lessons) {
      if (lesson.courseId !== c.id) continue;
      const section = sectionById.get(lesson.sectionId);
      if (!section) continue;
      const code = bySection.get(section.title);
      if (!code) continue;
      const comp = compByShortCode.get(code);
      if (!comp) continue;
      lcRows.push({ lessonId: lesson.id, competencyId: comp.id });
    }
  }
  if (lcRows.length > 0) {
    await db.insert(schema.lessonCompetencies).values(lcRows).onConflictDoNothing();
  }
  console.info(`  → lesson_competencies: ${lcRows.length} mapeos`);

  /* ── D · Banco de ítems ── */
  const evaluations = await db
    .select()
    .from(schema.evaluations)
    .where(inArray(schema.evaluations.courseId, year1Ids));

  /** Quiz base creado por `seed` para cada curso (título "Quiz: ..."). */
  const quizByCourse = new Map<string, (typeof evaluations)[number]>();
  for (const ev of evaluations) {
    if (!ev.title.startsWith('Quiz:')) continue;
    if (!quizByCourse.has(ev.courseId)) quizByCourse.set(ev.courseId, ev);
  }

  const quizIds = [...quizByCourse.values()].map((e) => e.id);

  // Idempotencia: borra solo los ítems creados por este seed (posición >= 100).
  // Al borrarlos caen en cascada sus evaluation_answers.
  await db
    .delete(schema.evaluationQuestions)
    .where(
      and(
        inArray(schema.evaluationQuestions.evaluationId, quizIds),
        sql`${schema.evaluationQuestions.position} >= ${DEMO_QUESTION_POSITION_BASE}`,
      ),
    );

  let newQuestions = 0;
  for (const course of YEAR1) {
    const c = courseBySlug.get(course.slug)!;
    const quiz = quizByCourse.get(c.id);
    if (!quiz) continue;

    const bank = QUESTION_BANK[course.slug] ?? [];
    // `points: 10` es la convención del seed base para TODO ítem. Debe respetarse:
    // el dominio por competencia es avg(pointsEarned / points), así que mezclar
    // ítems de 1 y de 10 puntos distorsiona el porcentaje (un acierto en un ítem
    // de 10 puntos contaría como 0,1 en lugar de 1).
    const values = bank.map((q, idx) => ({
      evaluationId: quiz.id,
      questionText: q.text,
      questionType: 'multiple_choice',
      options: q.options.map((text, i) => ({
        id: `demo-${idx}-${i}`,
        text,
        isCorrect: i === q.answer,
      })),
      correctAnswer: null,
      explanation: null,
      points: QUESTION_POINTS,
      difficulty: q.difficulty,
      position: DEMO_QUESTION_POSITION_BASE + idx,
    }));

    if (values.length > 0) {
      await db.insert(schema.evaluationQuestions).values(values);
      newQuestions += values.length;
    }
  }
  console.info(`  → Banco de ítems: +${newQuestions} preguntas (3 → 10 por quiz)`);

  /* ── E · question_competencies ── */
  const questions = await db
    .select()
    .from(schema.evaluationQuestions)
    .where(inArray(schema.evaluationQuestions.evaluationId, quizIds));

  const questionsByEval = new Map<string, typeof questions>();
  for (const q of questions) {
    const arr = questionsByEval.get(q.evaluationId) ?? [];
    arr.push(q);
    questionsByEval.set(q.evaluationId, arr);
  }

  /** questionId → código de competencia. */
  const compOfQuestion = new Map<string, string>();
  const qcRows: (typeof schema.questionCompetencies.$inferInsert)[] = [];

  for (const course of YEAR1) {
    const c = courseBySlug.get(course.slug)!;
    const quiz = quizByCourse.get(c.id);
    if (!quiz) continue;
    const qs = (questionsByEval.get(quiz.id) ?? []).sort((a, b) => a.position - b.position);
    const codes = course.competencies.map((x) => x.code);
    const bank = QUESTION_BANK[course.slug] ?? [];

    for (const q of qs) {
      let code: string | undefined;
      if (q.position >= DEMO_QUESTION_POSITION_BASE) {
        // Ítem de este seed: la competencia viene declarada en el banco.
        const idx = q.position - DEMO_QUESTION_POSITION_BASE;
        code = bank[idx]?.comp;
      } else {
        // Ítem heredado de `seed`: se reparte cíclicamente entre las competencias.
        code = codes[(q.position - 1) % codes.length];
      }
      if (!code) continue;
      const comp = compByShortCode.get(code);
      if (!comp) continue;
      compOfQuestion.set(q.id, code);
      qcRows.push({ questionId: q.id, competencyId: comp.id });
    }
  }
  if (qcRows.length > 0) {
    await db.insert(schema.questionCompetencies).values(qcRows).onConflictDoNothing();
  }
  console.info(`  → question_competencies: ${qcRows.length} ítems etiquetados`);

  /* ── F · Pesos de nota + actividades ── */
  for (const id of year1Ids) {
    await db
      .insert(schema.courseGradeWeights)
      .values({ courseId: id, examWeight: '40', practiceWeight: '30', activityWeight: '30' })
      .onConflictDoUpdate({
        target: schema.courseGradeWeights.courseId,
        set: { examWeight: '40', practiceWeight: '30', activityWeight: '30' },
      });
  }

  await db
    .delete(schema.courseActivities)
    .where(inArray(schema.courseActivities.courseId, year1Ids));
  const activityRows: (typeof schema.courseActivities.$inferInsert)[] = [];
  for (const c of year1Courses) {
    for (const a of ACTIVITIES) {
      activityRows.push({
        courseId: c!.id,
        createdBy: c!.instructorId,
        title: a.title,
        description: `${a.title} de ${c!.title}.`,
        category: a.category,
        maxScore: '100',
        weight: '1',
        dueDate: daysAgo(20),
      });
    }
  }
  await db.insert(schema.courseActivities).values(activityRows);
  const activities = await db
    .select()
    .from(schema.courseActivities)
    .where(inArray(schema.courseActivities.courseId, year1Ids));
  console.info(
    `  → Ponderación 40/30/30 en ${year1Ids.length} cursos · ${activities.length} actividades`,
  );

  /* ── G · Progreso del estudiante ── */
  const myEnrollments = await db
    .select()
    .from(schema.enrollments)
    .where(
      and(
        eq(schema.enrollments.userId, student.id),
        inArray(schema.enrollments.courseId, year1Ids),
      ),
    );
  const enrollmentByCourse = new Map(myEnrollments.map((e) => [e.courseId, e]));

  const lessonsByCourse = new Map<string, typeof lessons>();
  for (const l of lessons) {
    const arr = lessonsByCourse.get(l.courseId) ?? [];
    arr.push(l);
    lessonsByCourse.set(l.courseId, arr);
  }

  for (const course of YEAR1) {
    const c = courseBySlug.get(course.slug)!;
    const enrollment = enrollmentByCourse.get(c.id);
    if (!enrollment) continue;
    const courseLessons = (lessonsByCourse.get(c.id) ?? []).sort((a, b) => a.position - b.position);
    const pct = PROGRESS[course.slug] ?? 50;
    const done = Math.round((courseLessons.length * pct) / 100);

    await db
      .delete(schema.lessonProgress)
      .where(
        and(
          eq(schema.lessonProgress.userId, student.id),
          eq(schema.lessonProgress.enrollmentId, enrollment.id),
        ),
      );

    const lpRows = courseLessons.map((l, i) => ({
      enrollmentId: enrollment.id,
      userId: student.id,
      lessonId: l.id,
      isCompleted: i < done,
      completedAt: i < done ? daysAgo(40 - i) : null,
      viewCount: i < done ? 2 : 0,
    }));
    if (lpRows.length > 0) {
      await db.insert(schema.lessonProgress).values(lpRows).onConflictDoNothing();
    }

    await db
      .update(schema.enrollments)
      .set({
        progressPercentage: String(pct),
        lessonsCompleted: done,
        totalLessons: courseLessons.length,
        // La inscripción se mantiene 'active' aunque el avance llegue al 100%:
        // el estudiante está cursando el año en curso, y `courseFinalGrades`
        // solo considera inscripciones activas (drizzle-final-grade.repository.ts).
        // Marcarla 'completed' lo borraría de la vista de calificación del docente.
        status: 'active',
        completedAt: null,
        startedAt: daysAgo(60),
        lastLessonId: courseLessons[Math.max(0, done - 1)]?.id ?? null,
      })
      .where(eq(schema.enrollments.id, enrollment.id));
  }
  console.info('  → Progreso por curso alineado al perfil de desempeño');

  /* ── H · Intentos y respuestas ── */
  const myAttempts = await db
    .select()
    .from(schema.evaluationAttempts)
    .where(eq(schema.evaluationAttempts.studentId, student.id));
  if (myAttempts.length > 0) {
    await db
      .delete(schema.evaluationAttempts)
      .where(eq(schema.evaluationAttempts.studentId, student.id));
  }

  let attemptsN = 0;
  let answersN = 0;
  const examPct: Record<string, number> = {};
  /** Dominio REAL alcanzado por competencia (0..1), no el objetivo declarado. */
  const achieved = new Map<string, number>();

  for (const course of YEAR1) {
    const c = courseBySlug.get(course.slug)!;
    const quiz = quizByCourse.get(c.id);
    const enrollment = enrollmentByCourse.get(c.id);
    if (!quiz || !enrollment) continue;

    const qs = (questionsByEval.get(quiz.id) ?? []).sort((a, b) => a.position - b.position);

    // Cuántos aciertos quedan por repartir en cada competencia.
    const scored = qs.filter((q) => q.questionType !== 'open');

    // Aciertos por competencia, calculados sobre el número REAL de ítems
    // puntuables que la miden en este quiz (no sobre un conteo declarado).
    const remaining = new Map<string, number>();
    for (const comp of course.competencies) {
      const n = scored.filter((q) => compOfQuestion.get(q.id) === comp.code).length;
      const k = correctCountFor(TARGET[comp.code] ?? 0.7, n);
      remaining.set(comp.code, k);
      achieved.set(comp.code, n > 0 ? k / n : 0);
    }

    const answers: (typeof schema.evaluationAnswers.$inferInsert)[] = [];
    let earned = 0;
    let maxPoints = 0;

    // Un intento envía TODAS las preguntas; el acierto se decide por
    // competencia para que el dominio resultante sea exactamente el diseñado.
    const [attempt] = await db
      .insert(schema.evaluationAttempts)
      .values({
        evaluationId: quiz.id,
        studentId: student.id,
        enrollmentId: enrollment.id,
        attemptNumber: 1,
        startedAt: daysAgo(12),
        submittedAt: daysAgo(12),
        timeSpentSeconds: 900,
      })
      .returning();
    if (!attempt) continue;
    attemptsN += 1;

    for (const q of scored) {
      const code = compOfQuestion.get(q.id);
      const left = code ? (remaining.get(code) ?? 0) : 0;
      const isCorrect = left > 0;
      if (isCorrect && code) remaining.set(code, left - 1);

      const points = Number(q.points);
      maxPoints += points;
      if (isCorrect) earned += points;

      const opts = (q.options ?? []) as Array<{ id: string; text: string; isCorrect: boolean }>;
      const right = opts.find((o) => o.isCorrect);
      const wrong = opts.find((o) => !o.isCorrect);
      // `true_false` heredado no trae options: se responde con el literal.
      const fallbackRight = q.correctAnswer ?? 'true';
      const fallbackWrong = q.correctAnswer === 'false' ? 'true' : 'false';
      answers.push({
        attemptId: attempt.id,
        questionId: q.id,
        answer: isCorrect ? (right?.id ?? fallbackRight) : (wrong?.id ?? fallbackWrong),
        isCorrect,
        // pointsEarned debe ser el valor del ítem, no 1: el dominio se calcula
        // como pointsEarned/points y solo así un acierto vale exactamente 1.
        pointsEarned: isCorrect ? String(points) : '0',
      });
    }

    // La pregunta abierta del quiz queda respondida pero SIN calificar
    // (isCorrect null, sin feedback): ese es el estado que habilita la demo de
    // sugerencia de retroalimentación con IA. Al ser null, no entra en el dominio.
    const open = qs.find((q) => q.questionType === 'open');
    if (open) {
      answers.push({
        attemptId: attempt.id,
        questionId: open.id,
        answer: OPEN_ANSWERS[course.slug] ?? 'Respuesta del estudiante pendiente de revisión.',
        isCorrect: null,
        pointsEarned: '0',
        feedback: null,
      });
    }

    await db.insert(schema.evaluationAnswers).values(answers);
    answersN += answers.length;

    const pct = maxPoints > 0 ? Math.round((earned / maxPoints) * 100) : 0;
    examPct[course.slug] = pct;

    await db
      .update(schema.evaluationAttempts)
      .set({
        score: String(earned),
        maxScore: String(maxPoints),
        percentage: String(pct),
        isPassed: pct >= Number(quiz.passingScore),
      })
      .where(eq(schema.evaluationAttempts.id, attempt.id));
  }
  console.info(
    `  → ${attemptsN} intentos enviados, ${answersN} respuestas (2 intentos libres por quiz)`,
  );

  /* ── I · Calificaciones ── */
  await db
    .delete(schema.grades)
    .where(and(eq(schema.grades.studentId, student.id), inArray(schema.grades.courseId, year1Ids)));

  const activityByCourse = new Map<string, typeof activities>();
  for (const a of activities) {
    const arr = activityByCourse.get(a.courseId) ?? [];
    arr.push(a);
    activityByCourse.set(a.courseId, arr);
  }

  const gradeRows: (typeof schema.grades.$inferInsert)[] = [];
  for (const course of YEAR1) {
    const c = courseBySlug.get(course.slug)!;
    const enrollment = enrollmentByCourse.get(c.id);
    if (!enrollment) continue;

    // Nota de examen: la del intento del quiz.
    gradeRows.push({
      studentId: student.id,
      teacherId: c.instructorId,
      courseId: c.id,
      enrollmentId: enrollment.id,
      title: `Quiz: ${c.title}`,
      score: String(examPct[course.slug] ?? 0),
      maxScore: '100',
      weight: '1',
      feedback: null,
      gradedAt: daysAgo(11),
    });

    // Notas de prácticas y actividades.
    const acts = (activityByCourse.get(c.id) ?? []).sort((a, b) => a.title.localeCompare(b.title));
    const scores = ACTIVITY_SCORES[course.slug] ?? [70, 70, 70, 70];
    acts.forEach((a, i) => {
      gradeRows.push({
        studentId: student.id,
        teacherId: c.instructorId,
        courseId: c.id,
        enrollmentId: enrollment.id,
        activityId: a.id,
        title: a.title,
        score: String(scores[i] ?? 70),
        maxScore: '100',
        weight: '1',
        feedback: null,
        gradedAt: daysAgo(18 - i),
      });
    });
  }
  await db.insert(schema.grades).values(gradeRows);
  console.info(`  → ${gradeRows.length} calificaciones (examen + 2 prácticas + 2 actividades)`);

  /* ── J · Reportes y alertas ── */
  await db.delete(schema.reports).where(eq(schema.reports.studentId, student.id));
  await db.delete(schema.alerts).where(eq(schema.alerts.studentId, student.id));

  const reportRows: (typeof schema.reports.$inferInsert)[] = [];
  const alertRows: (typeof schema.alerts.$inferInsert)[] = [];

  for (const course of YEAR1) {
    const c = courseBySlug.get(course.slug)!;
    const enrollment = enrollmentByCourse.get(c.id);
    if (!enrollment) continue;

    const courseGrades = gradeRows.filter((g) => g.courseId === c.id);
    const avg =
      courseGrades.reduce((s, g) => s + Number(g.score), 0) / Math.max(1, courseGrades.length);
    const progress = PROGRESS[course.slug] ?? 50;
    const risk = avg < 40 ? 'critical' : avg < 60 ? 'high' : avg < 75 ? 'medium' : ('low' as const);

    reportRows.push({
      studentId: student.id,
      courseId: c.id,
      periodStart: daysAgo(90),
      periodEnd: now,
      avgScore: String(Math.round(avg * 100) / 100),
      progressPercentage: String(progress),
      lessonsCompleted: enrollment.lessonsCompleted,
      totalLessons: enrollment.totalLessons,
      riskLevel: risk,
      insights: {
        weakCompetencies: course.competencies
          .filter((x) => (achieved.get(x.code) ?? 1) < WEAK_THRESHOLD)
          .map((x) => x.name),
      },
    });

    if (avg < 60) {
      alertRows.push({
        studentId: student.id,
        courseId: c.id,
        alertType: 'low_score',
        severity: avg < 50 ? 'high' : 'medium',
        message: `Promedio de ${Math.round(avg)}% en ${c.title}: por debajo del mínimo de aprobación.`,
        metadata: { avgScore: Math.round(avg), progress },
      });
    }
    if (progress < 50) {
      alertRows.push({
        studentId: student.id,
        courseId: c.id,
        alertType: 'inactivity',
        severity: 'medium',
        message: `Avance de ${progress}% en ${c.title}: por debajo de lo esperado para el periodo.`,
        metadata: { progress },
      });
    }
  }
  await db.insert(schema.reports).values(reportRows);
  if (alertRows.length > 0) await db.insert(schema.alerts).values(alertRows);
  console.info(`  → ${reportRows.length} reportes, ${alertRows.length} alertas de riesgo`);

  /* ── K · Recomendaciones registradas ── */
  await db.delete(schema.recommendationAi).where(eq(schema.recommendationAi.userId, student.id));

  const recRows: (typeof schema.recommendationAi.$inferInsert)[] = [];
  for (const course of YEAR1) {
    const c = courseBySlug.get(course.slug)!;
    const weak = course.competencies.filter((x) => (achieved.get(x.code) ?? 1) < WEAK_THRESHOLD);
    for (const w of weak) {
      const section = sections.find((s) => s.courseId === c.id && s.title === w.section);
      const lesson = section
        ? lessons
            .filter((l) => l.sectionId === section.id)
            .sort((a, b) => a.position - b.position)[0]
        : undefined;
      const mastery = achieved.get(w.code) ?? 0;
      recRows.push({
        userId: student.id,
        courseId: c.id,
        claseId: lesson?.id ?? null,
        recommendationType: 'refuerzo',
        reason: `Refuerza tu competencia «${w.name}» (desempeño actual ${Math.round(
          mastery * 100,
        )}%)`,
        sourceAi: 'openai-compatible',
        status: 'pending',
      });
    }
  }
  if (recRows.length > 0) await db.insert(schema.recommendationAi).values(recRows);
  console.info(`  → ${recRows.length} recomendaciones de refuerzo registradas`);

  /* ── Resumen ── */
  const weakList = [...achieved.entries()]
    .filter(([, m]) => m < WEAK_THRESHOLD)
    .sort((a, b) => a[1] - b[1])
    .map(([code, m]) => {
      const comp = compByShortCode.get(code);
      return `${comp?.name ?? code} (${Math.round(m * 100)}%)`;
    });

  console.info('\n✅ Seed de demo completado');
  console.info(`   👤 ${DEMO_STUDENT_NAME.firstName} ${DEMO_STUDENT_NAME.lastName}`);
  console.info(`      ${DEMO_STUDENT_EMAIL} · Cieba2025! · 1.er año, 6 materias`);
  console.info(`   📚 ${year1Ids.length} materias · ${compRows.length} competencias`);
  console.info(`   📝 ${qcRows.length} ítems etiquetados · ${attemptsN} intentos`);
  console.info(`   💯 ${gradeRows.length} notas · ${alertRows.length} alertas`);
  console.info('\n   🔻 Competencias débiles (disparan el recomendador):');
  for (const w of weakList) console.info(`      · ${w}`);
  console.info('\n   👨‍🏫 Docente demo: j.flores@cieba.edu.bo');
  console.info('      (dicta Fundamentos de Enfermería y Anatomía del mismo estudiante)');

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed de demo falló:', err);
  process.exit(1);
});
