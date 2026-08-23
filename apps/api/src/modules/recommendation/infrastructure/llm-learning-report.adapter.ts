import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  LearningReportInput,
  LearningReportNarration,
  LearningReportNarratorPort,
} from '../domain/ports/learning-report-narrator.port';

// Mismo timeout por defecto que el resto de la capa IA: la inferencia local
// (Ollama) puede tardar decenas de segundos en la 1.ª llamada.
const DEFAULT_TIMEOUT_MS = 30000;
// Límites defensivos de longitud.
const MAX_SUMMARY_LEN = 600;
const MAX_ITEM_LEN = 240;
const MAX_ITEMS = 5;

/**
 * Adaptador del INFORME DE APRENDIZAJE asistido por IA (tesis §2.9), contra una
 * API compatible con OpenAI (`/chat/completions`). Reutiliza las mismas variables
 * AI_BASE_URL / AI_API_KEY / AI_MODEL / AI_TIMEOUT_MS que el resto de la capa IA;
 * el flag propio `AI_LEARNING_REPORT_ENABLED` la activa de forma independiente.
 *
 * Garantía de seguridad: NUNCA lanza. Devuelve `null` ante IA deshabilitada,
 * error de red, timeout o JSON inválido. Con `null`, el informe no se genera y
 * la UI lo oculta. La IA solo REDACTA a partir de hechos reales; no inventa
 * cifras ni calcula dominio psicométrico.
 */
@Injectable()
export class LlmLearningReportAdapter implements LearningReportNarratorPort {
  private readonly logger = new Logger(LlmLearningReportAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async narrate(input: LearningReportInput): Promise<LearningReportNarration | null> {
    const enabled = this.config.get<boolean>('AI_LEARNING_REPORT_ENABLED') ?? false;
    if (!enabled || input.courses.length === 0) return null;

    const baseUrl = this.config.get<string>('AI_BASE_URL') ?? 'http://localhost:11434/v1';
    const apiKey = this.config.get<string>('AI_API_KEY') ?? 'ollama';
    const model = this.config.get<string>('AI_MODEL') ?? 'llama3.2:3b';
    const timeoutMs = this.config.get<number>('AI_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS;

    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Eres un tutor académico. A partir de los datos REALES de un ' +
                'estudiante (avance y promedios por curso), redacta en español un ' +
                'informe breve, claro y motivador de sus fortalezas y debilidades, ' +
                'con recomendaciones de estudio. NO inventes cursos ni cifras que no ' +
                'te den. NO uses jerga psicométrica (nada de θ, error estándar ni ' +
                'porcentajes de "dominio" calculados). Responde SOLO un objeto JSON ' +
                'con la forma {"summary":"...","strengths":["..."],' +
                '"weaknesses":["..."],"recommendations":["..."]}.',
            },
            {
              role: 'user',
              content: this.buildUserPrompt(input),
            },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        this.logger.warn(`IA informe: HTTP ${response.status}; se ignora (null).`);
        return null;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) return null;

      return this.parse(content);
    } catch (err) {
      this.logger.warn(
        `IA informe deshabilitado por error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private buildUserPrompt(input: LearningReportInput): string {
    const lines = input.courses.map((c) => {
      const avg = c.averageScore === null ? 'sin calificaciones' : `promedio ${c.averageScore}%`;
      return `- curso="${c.title}" | avance=${c.progress}% (${c.lessonsCompleted}/${c.totalLessons} lecciones) | ${avg} (${c.gradeCount} nota(s))`;
    });
    return (
      'Datos del estudiante por curso:\n' +
      lines.join('\n') +
      '\n\nRedacta el informe. Devuelve SOLO el JSON con las claves ' +
      '{"summary","strengths","weaknesses","recommendations"}.'
    );
  }

  /** Parsea y sanea la respuesta del modelo. Devuelve null si es inservible. */
  private parse(content: string): LearningReportNarration | null {
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      return null;
    }
    if (typeof raw !== 'object' || raw === null) return null;
    const obj = raw as Record<string, unknown>;

    const summary =
      typeof obj.summary === 'string' ? obj.summary.trim().slice(0, MAX_SUMMARY_LEN) : '';
    const strengths = this.toStringList(obj.strengths);
    const weaknesses = this.toStringList(obj.weaknesses);
    const recommendations = this.toStringList(obj.recommendations);

    // Necesitamos al menos un resumen o alguna lista con contenido útil.
    if (
      !summary &&
      strengths.length === 0 &&
      weaknesses.length === 0 &&
      recommendations.length === 0
    ) {
      return null;
    }
    return { summary, strengths, weaknesses, recommendations };
  }

  private toStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const item of value) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (trimmed.length === 0) continue;
      out.push(trimmed.slice(0, MAX_ITEM_LEN));
      if (out.length >= MAX_ITEMS) break;
    }
    return out;
  }
}
