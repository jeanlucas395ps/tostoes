import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.removeItem('tostoes-theme');
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({ providers: [ThemeService] });
  });

  it('defaults to light', () => {
    const theme = TestBed.inject(ThemeService);
    TestBed.flushEffects();
    expect(theme.isDark()).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('restores dark from localStorage', () => {
    localStorage.setItem('tostoes-theme', 'dark');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ThemeService] });
    const theme = TestBed.inject(ThemeService);
    TestBed.flushEffects();
    expect(theme.isDark()).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('toggles theme and persists', () => {
    const theme = TestBed.inject(ThemeService);
    TestBed.flushEffects();
    theme.toggle();
    TestBed.flushEffects();
    expect(theme.isDark()).toBe(true);
    expect(localStorage.getItem('tostoes-theme')).toBe('dark');
    theme.toggle();
    TestBed.flushEffects();
    expect(theme.isDark()).toBe(false);
    expect(localStorage.getItem('tostoes-theme')).toBe('light');
  });
});
