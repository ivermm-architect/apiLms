import { spawn } from 'node:child_process';

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Prepara la IA local (Ollama) al arrancar la API para que NUNCA falle por
 * arranque en frío durante una demo/defensa:
 *
 *   1. Si el servidor de Ollama no responde, intenta lanzarlo (`ollama serve`).
 *   2. Precarga el modelo configurado en `AI_MODEL` y lo mantiene en memoria
 *      (`keep_alive: -1`), de modo que la primera petición del docente sea rápida.
 *
 * Es 100% best-effort y no bloquea el arranque: ante cualquier fallo solo
 * registra un aviso y la IA sigue degradando a vacío (comportamiento actual).
 * Con un proveedor remoto (p. ej. OpenAI) el warm-up se omite automáticamente.
 */
@Injectable()
export class AiWarmupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiWarmupService.name);
  private static readonly AI_FLAGS = [
    'AI_RECOMMENDATION_ENABLED',
    'AI_QUESTION_GEN_ENABLED',
    'AI_FEEDBACK_ENABLED',
    'AI_LEARNING_REPORT_ENABLED',
  ] as const;

  constructor(private readonly config: ConfigService) {}

  onApplicationBootstrap(): void {
    // En segundo plano: no retrasar el listen() de la API.
    void this.warmUp();
  }

  private anyAiEnabled(): boolean {
    return AiWarmupService.AI_FLAGS.some((flag) => this.config.get<boolean>(flag) === true);
  }

  private async warmUp(): Promise<void> {
    if (!this.anyAiEnabled()) return;

    const baseUrl = this.config.get<string>('AI_BASE_URL') ?? 'http://localhost:11434/v1';
    const model = this.config.get<string>('AI_MODEL') ?? 'llama3.2:3b';

    // El warm-up solo aplica a Ollama local; con IA remota (cloud) se omite.
    const isLocalOllama = /localhost|127\.0\.0\.1|11434/.test(baseUrl);
    if (!isLocalOllama) {
      this.logger.log('IA remota configurada; se omite el warm-up de Ollama.');
      return;
    }

    // API nativa de Ollama (sin el sufijo /v1 de la capa compatible con OpenAI).
    const nativeBase = baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');

    // 1) Asegurar que el servidor de Ollama esté en pie.
    if (!(await this.isUp(nativeBase))) {
      this.logger.log('Ollama no responde; intentando lanzarlo…');
      this.tryLaunchOllama();
      await this.waitUntilUp(nativeBase, 30_000);
    }
    if (!(await this.isUp(nativeBase))) {
      this.logger.warn('No se pudo contactar ni lanzar Ollama; la IA degradará a vacío.');
      return;
    }

    // 2) Precargar el modelo y mantenerlo en memoria de forma indefinida.
    try {
      const res = await fetch(`${nativeBase}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Sin `prompt`: Ollama solo carga el modelo. keep_alive: -1 = no descargar.
        body: JSON.stringify({ model, keep_alive: -1 }),
        signal: AbortSignal.timeout(180_000),
      });
      if (res.ok) {
        this.logger.log(`IA lista: modelo "${model}" precargado y fijado en memoria.`);
      } else {
        this.logger.warn(
          `No se pudo precargar "${model}" (HTTP ${res.status}). ¿Está descargado? (ollama pull ${model})`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Fallo al precargar "${model}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async isUp(nativeBase: string): Promise<boolean> {
    try {
      const res = await fetch(`${nativeBase}/api/tags`, { signal: AbortSignal.timeout(3_000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  private tryLaunchOllama(): void {
    try {
      const child = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' });
      child.on('error', (err) => {
        this.logger.warn(`No se pudo ejecutar "ollama serve": ${err.message}`);
      });
      child.unref();
    } catch (err) {
      this.logger.warn(
        `No se pudo lanzar Ollama automáticamente: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async waitUntilUp(nativeBase: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await this.isUp(nativeBase)) return;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}
