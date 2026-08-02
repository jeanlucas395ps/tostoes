import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon } from '@ionic/angular/standalone';

@Component({
  selector: 'app-coming-soon',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonIcon],
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/mais" text=""></ion-back-button>
        </ion-buttons>
        <ion-title>{{ title }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="page-content">
      <div class="coming-soon">
        <ion-icon name="ellipse-outline"></ion-icon>
        <h2>{{ title }}</h2>
        <p>Essa área chega em uma próxima atualização do app.</p>
      </div>
    </ion-content>
  `,
  styles: [
    `
      .coming-soon {
        min-height: 60vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: var(--sp-3);
        color: var(--text-muted);

        ion-icon { font-size: 2.5rem; color: var(--primary-light); }
        h2 { color: var(--text); }
        p { font-size: 0.9375rem; max-width: 260px; }
      }
    `,
  ],
})
export class ComingSoonPage {
  private route = inject(ActivatedRoute);
  title = this.route.snapshot.data['title'] ?? 'Em breve';
}
