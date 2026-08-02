import { Component, inject, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { App, URLOpenListenerEvent } from '@capacitor/app';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `,
})
export class AppComponent implements OnInit {
  private router = inject(Router);

  ngOnInit(): void {
    // Deep links (redefinir-senha?token=..., convite/:token),  universal
    // link ou custom scheme caem aqui e viram navegação normal do Router.
    App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
      try {
        const url = new URL(event.url);
        this.router.navigateByUrl(url.pathname + url.search);
      } catch {
        /* URL malformada,  ignora */
      }
    });
  }
}
