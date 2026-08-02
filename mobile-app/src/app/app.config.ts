import { ApplicationConfig, provideZoneChangeDetection, provideAppInitializer, inject } from '@angular/core';
import { provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { StorageService } from './core/services/storage.service';
import { AuthService } from './core/services/auth.service';
import { AppLockService } from './core/services/app-lock.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideIonicAngular({ mode: 'ios' }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAppInitializer(() => {
      const storage = inject(StorageService);
      const auth = inject(AuthService);
      const lock = inject(AppLockService);
      return storage
        .hydrate()
        .then(() => auth.bootstrap())
        .then(() => lock.evaluate());
    }),
  ],
};
