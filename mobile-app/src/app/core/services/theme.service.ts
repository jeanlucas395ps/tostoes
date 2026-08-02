import { Injectable, signal, effect } from '@angular/core';
import { StorageService, STORAGE_KEYS } from './storage.service';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  isDark = signal(false);

  constructor(private storage: StorageService) {
    const dark = this.storage.get(STORAGE_KEYS.theme) === 'dark';
    this.isDark.set(dark);
    this.apply(dark);

    effect(() => {
      const d = this.isDark();
      this.apply(d);
      this.storage.set(STORAGE_KEYS.theme, d ? 'dark' : 'light');
    });
  }

  toggle(): void {
    this.isDark.update((d) => !d);
  }

  private apply(dark: boolean): void {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
}
