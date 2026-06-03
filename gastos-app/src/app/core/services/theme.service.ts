import { Injectable, signal, effect } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly KEY = 'tostoes-theme';

  isDark = signal(false);

  constructor() {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(this.KEY);
    } catch {
      stored = null;
    }
    const dark = stored === 'dark';
    this.isDark.set(dark);
    this.apply(dark);

    effect(() => {
      const d = this.isDark();
      this.apply(d);
      try {
        localStorage.setItem(this.KEY, d ? 'dark' : 'light');
      } catch {
        /* ignore quota / private mode */
      }
    });
  }

  toggle(): void {
    this.isDark.update(d => !d);
  }

  private apply(dark: boolean): void {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
}
