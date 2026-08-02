import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';
import { StorageService, STORAGE_KEYS } from './storage.service';

describe('ThemeService', () => {
  let storage: jasmine.SpyObj<StorageService>;

  beforeEach(() => {
    storage = jasmine.createSpyObj('StorageService', ['get', 'set']);
    storage.get.and.returnValue(null);
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({
      providers: [ThemeService, { provide: StorageService, useValue: storage }],
    });
  });

  it('defaults to light and toggles', () => {
    const theme = TestBed.inject(ThemeService);
    TestBed.flushEffects();
    expect(theme.isDark()).toBe(false);
    theme.toggle();
    TestBed.flushEffects();
    expect(theme.isDark()).toBe(true);
    expect(storage.set).toHaveBeenCalledWith(STORAGE_KEYS.theme, 'dark');
  });

  it('restores dark', () => {
    storage.get.and.returnValue('dark');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [ThemeService, { provide: StorageService, useValue: storage }],
    });
    const theme = TestBed.inject(ThemeService);
    TestBed.flushEffects();
    expect(theme.isDark()).toBe(true);
  });
});
