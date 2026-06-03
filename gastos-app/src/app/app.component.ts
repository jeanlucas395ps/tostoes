import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: `:host { display: block; min-height: 100vh; }`,
})
export class AppComponent {
  /** Garante tema do localStorage em qualquer rota (login, layout, etc.). */
  constructor() {
    inject(ThemeService);
  }
}
