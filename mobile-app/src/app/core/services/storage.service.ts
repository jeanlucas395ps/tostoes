import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export const STORAGE_KEYS = {
  token: 'tostoes-token',
  planningId: 'tostoes-planning-id',
  theme: 'tostoes-theme',
  biometricEnabled: 'tostoes-biometric-enabled',
  biometricAsked: 'tostoes-biometric-asked',
} as const;

const ALL_KEYS = Object.values(STORAGE_KEYS);

/** Cache síncrono em memória sobre o Preferences (async) do Capacitor,  mesma
 * ergonomia do localStorage usado no gastos-app web, mas persistindo em disco
 * nativo. Chame `hydrate()` uma vez no bootstrap antes de ler qualquer chave. */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private cache = new Map<string, string | null>();
  private hydrated = false;

  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    const entries = await Promise.all(
      ALL_KEYS.map(async (key) => [key, (await Preferences.get({ key })).value] as const)
    );
    for (const [key, value] of entries) this.cache.set(key, value);
    this.hydrated = true;
  }

  get(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.cache.set(key, value);
    void Preferences.set({ key, value });
  }

  remove(key: string): void {
    this.cache.set(key, null);
    void Preferences.remove({ key });
  }
}
