import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiCacheService, stableHash } from './ai-cache.service';

/** Espera a que se resuelvan los microtasks pendientes (regeneración fire-and-forget). */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('stableHash', () => {
  it('es determinista: la misma entrada produce la misma salida', () => {
    expect(stableHash('curso-1|80|4|5')).toBe(stableHash('curso-1|80|4|5'));
  });

  it('cambia cuando cambian los datos', () => {
    expect(stableHash('curso-1|80')).not.toBe(stableHash('curso-1|90'));
  });
});

describe('AiCacheService', () => {
  let cache: AiCacheService;

  beforeEach(() => {
    cache = new AiCacheService();
  });

  afterEach(() => vi.restoreAllMocks());

  it('primer acceso: devuelve null y marca pending mientras regenera en segundo plano', async () => {
    const generate = vi.fn().mockResolvedValue('informe generado');

    const first = cache.getOrRefresh('k', 'h1', generate);

    // La petición responde AL INSTANTE, sin esperar a la IA.
    expect(first.value).toBeNull();
    expect(first.pending).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('tras la regeneración, sirve el valor fresco sin pending y sin volver a generar', async () => {
    const generate = vi.fn().mockResolvedValue('informe generado');

    cache.getOrRefresh('k', 'h1', generate);
    await flush();

    const second = cache.getOrRefresh('k', 'h1', generate);
    expect(second.value).toBe('informe generado');
    expect(second.pending).toBe(false);
    // HIT fresco: no se dispara una segunda generación.
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('dedupe: no lanza dos regeneraciones simultáneas para la misma clave/hash', async () => {
    let resolve!: (v: string) => void;
    const generate = vi.fn().mockImplementation(() => new Promise<string>((r) => (resolve = r)));

    cache.getOrRefresh('k', 'h1', generate);
    cache.getOrRefresh('k', 'h1', generate); // en vuelo → no debe relanzar

    expect(generate).toHaveBeenCalledTimes(1);

    resolve('ok');
    await flush();
  });

  it('cuando cambian los datos (nuevo hash) regenera y actualiza el valor', async () => {
    const generate = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');

    cache.getOrRefresh('k', 'h1', generate);
    await flush();
    expect(cache.getOrRefresh('k', 'h1', generate).value).toBe('v1');

    // Nuevo hash → sirve lo viejo (stale) y regenera en segundo plano.
    const stale = cache.getOrRefresh('k', 'h2', generate);
    expect(stale.value).toBe('v1');
    await flush();

    expect(cache.getOrRefresh('k', 'h2', generate).value).toBe('v2');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('cooldown: si la generación devuelve null, no reintenta de inmediato', async () => {
    const generate = vi.fn().mockResolvedValue(null); // IA apagada/fallo

    cache.getOrRefresh('k', 'h1', generate);
    await flush();
    expect(generate).toHaveBeenCalledTimes(1);

    // Segundo intento inmediato: en cooldown → no vuelve a llamar.
    const again = cache.getOrRefresh('k', 'h1', generate);
    expect(again.value).toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('NUNCA propaga excepciones de generate: entra en cooldown y no rompe la petición', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('timeout IA'));

    // No debe lanzar de forma síncrona.
    expect(() => cache.getOrRefresh('k', 'h1', generate)).not.toThrow();
    await flush();

    // Reintento inmediato en cooldown: no relanza.
    cache.getOrRefresh('k', 'h1', generate);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('claves distintas se regeneran de forma independiente', async () => {
    const genA = vi.fn().mockResolvedValue('A');
    const genB = vi.fn().mockResolvedValue('B');

    cache.getOrRefresh('a', 'h', genA);
    cache.getOrRefresh('b', 'h', genB);
    await flush();

    expect(cache.getOrRefresh('a', 'h', genA).value).toBe('A');
    expect(cache.getOrRefresh('b', 'h', genB).value).toBe('B');
  });
});
