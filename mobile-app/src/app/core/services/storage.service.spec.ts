import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { StorageService, STORAGE_KEYS } from './storage.service';

describe('StorageService', () => {
  let storage: StorageService;

  beforeEach(async () => {
    await Preferences.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [StorageService] });
    storage = TestBed.inject(StorageService);
  });

  it('hydrate loads keys once', async () => {
    await Preferences.set({ key: STORAGE_KEYS.token, value: 'tok' });
    await storage.hydrate();
    await storage.hydrate();
    expect(storage.get(STORAGE_KEYS.token)).toBe('tok');
  });

  it('set and remove update cache', async () => {
    await storage.hydrate();
    storage.set(STORAGE_KEYS.theme, 'dark');
    expect(storage.get(STORAGE_KEYS.theme)).toBe('dark');
    // Preferences.set is fire-and-forget; give the microtask a tick
    await Promise.resolve();
    const stored = await Preferences.get({ key: STORAGE_KEYS.theme });
    expect(stored.value).toBe('dark');

    storage.remove(STORAGE_KEYS.theme);
    expect(storage.get(STORAGE_KEYS.theme)).toBeNull();
    await Promise.resolve();
    const removed = await Preferences.get({ key: STORAGE_KEYS.theme });
    expect(removed.value).toBeNull();
  });

  it('get returns null for missing keys', async () => {
    await storage.hydrate();
    expect(storage.get(STORAGE_KEYS.planningId)).toBeNull();
  });
});
