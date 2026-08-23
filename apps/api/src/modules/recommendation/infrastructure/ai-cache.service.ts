import { Injectable, Logger } from '@nestjs/common';

/**
 * Caché en memoria para las salidas de IA (informe de aprendizaje y
 * justificaciones de recomendaciones). Su objetivo es DESACOPLAR la latencia
 * del modelo (Ollama local puede tardar decenas de segundos, más aún en frío)
 * de la carga de la página: el handler responde AL INSTANTE con lo cacheado y
 * la regeneración ocurre en SEGUNDO PLANO, sin bloquear la petición.
 *
 * Estrategia: "stale-while-revalidate".
 *  - Si hay un valor cuyo `hash` coincide con los datos actuales → HIT fresco.
 *  - Si el hash cambió (o no hay valor) → se devuelve lo que haya (posible
 *    valor viejo, o null) y se dispara una regeneración en segundo plano.
 *  - Dedupe: no se lanzan dos regeneraciones simultáneas para la misma clave.
 *  - Cooldown: si la generación devuelve `null` (IA apagada/fallo/timeout), se
 *    espera un tiempo antes de reintentar, para no martillar al proveedor ni
 *    dejar la UI en "generando…" de forma indefinida.
 *
 * No usa Redis ni BD (fuera del alcance del proyecto): es un `Map` por proceso.
 * Tras reiniciar la API el caché se repuebla solo, en segundo plano, en la
 * primera visita — sin bloquear.
 */

const COOLDOWN_MS = 60_000;

interface CacheEntry<T> {
  /** Hash de los datos que produjeron `payload`. null si nunca se generó. */
  hash: string | null;
  payload: T | null;
  updatedAt: number;
  /** Hash actualmente en regeneración (dedupe). null si no hay ninguna en curso. */
  inflightHash: string | null;
  /** Hasta cuándo NO reintentar tras un fallo/null. */
  cooldownUntil: number;
}

export interface CacheLookup<T> {
  /** Último valor útil disponible (puede ser viejo) o null si aún no hay. */
  value: T | null;
  /** true si hay una regeneración en curso y aún no existe un valor fresco. */
  pending: boolean;
}

@Injectable()
export class AiCacheService {
  private readonly logger = new Logger(AiCacheService.name);
  private readonly store = new Map<string, CacheEntry<unknown>>();

  /**
   * Devuelve el valor cacheado para `key`. Si no coincide con `hash`, dispara
   * `generate()` en segundo plano (una sola vez por clave) y responde de
   * inmediato con el valor previo (o null) marcando `pending`.
   */
  getOrRefresh<T>(key: string, hash: string, generate: () => Promise<T | null>): CacheLookup<T> {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;

    // HIT fresco: el valor corresponde a los datos actuales.
    if (entry && entry.hash === hash && entry.payload !== null) {
      return { value: entry.payload, pending: false };
    }

    const now = Date.now();
    const alreadyGenerating = entry?.inflightHash === hash;
    const inCooldown = entry !== undefined && now < entry.cooldownUntil;

    if (!alreadyGenerating && !inCooldown) {
      const base: CacheEntry<T> = entry ?? {
        hash: null,
        payload: null,
        updatedAt: 0,
        inflightHash: null,
        cooldownUntil: 0,
      };
      base.inflightHash = hash;
      this.store.set(key, base);
      // Fire-and-forget: NO se espera; la petición responde ya.
      void this.refresh(key, hash, generate);
    }

    return { value: entry?.payload ?? null, pending: entry?.payload == null };
  }

  private async refresh<T>(
    key: string,
    hash: string,
    generate: () => Promise<T | null>,
  ): Promise<void> {
    try {
      const value = await generate();
      const entry = (this.store.get(key) as CacheEntry<T>) ?? {
        hash: null,
        payload: null,
        updatedAt: 0,
        inflightHash: null,
        cooldownUntil: 0,
      };
      entry.inflightHash = null;
      if (value !== null) {
        entry.hash = hash;
        entry.payload = value;
        entry.updatedAt = Date.now();
        entry.cooldownUntil = 0;
      } else {
        // IA apagada/fallo: no reintentar durante un rato.
        entry.cooldownUntil = Date.now() + COOLDOWN_MS;
      }
      this.store.set(key, entry);
    } catch (err) {
      const entry = this.store.get(key) as CacheEntry<T> | undefined;
      if (entry) {
        entry.inflightHash = null;
        entry.cooldownUntil = Date.now() + COOLDOWN_MS;
      }
      this.logger.warn(
        `Regeneración IA falló para '${key}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/** Hash corto y estable (djb2) de una cadena; para comparar snapshots de datos. */
export function stableHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}
