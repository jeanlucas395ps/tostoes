import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';
import { PlanningService } from '../../core/services/planning.service';
import { AuthService } from '../../core/services/auth.service';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';
import { PlanningInvitePreview } from '../../core/models/api.models';

@Component({
  selector: 'app-invite-accept',
  standalone: true,
  imports: [RouterLink, IonContent, IonSpinner, SkeletonComponent],
  templateUrl: './invite-accept.page.html',
  styleUrls: ['../auth-shared.scss', './invite-accept.page.scss'],
})
export class InviteAcceptPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private planning = inject(PlanningService);
  auth = inject(AuthService);

  token = '';
  invite = signal<PlanningInvitePreview | null>(null);
  loading = signal(true);
  error = signal('');
  accepting = signal(false);
  done = signal(false);
  doneMessage = signal('');

  readonly isPending = computed(
    () => this.invite()?.status === 'pending' && !this.invite()?.expired
  );

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    if (!this.token) {
      this.error.set('Convite inválido.');
      this.loading.set(false);
      return;
    }

    this.planning.getInvite(this.token).subscribe({
      next: (invite) => {
        this.invite.set(invite);
        this.loading.set(false);
        if (invite.status === 'accepted') {
          this.done.set(true);
          this.doneMessage.set('Este convite já foi aceito.');
        } else if (invite.expired || invite.status !== 'pending') {
          this.error.set('Este convite expirou ou não está mais disponível.');
        } else if (this.auth.isAuthenticated()) {
          this.tryAccept();
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.error ?? 'Convite não encontrado.');
      },
    });
  }

  tryAccept(): void {
    if (!this.isPending()) return;
    this.accepting.set(true);
    this.error.set('');
    this.planning.acceptInvite(this.token).subscribe({
      next: (res) => {
        this.accepting.set(false);
        this.done.set(true);
        this.doneMessage.set(res.message);
        setTimeout(() => this.router.navigate(['/home']), 1200);
      },
      error: (err) => {
        this.accepting.set(false);
        const msg = err.error?.error ?? 'Não foi possível aceitar o convite.';
        if (err.status === 401) {
          this.router.navigate(['/login'], { queryParams: { redirect: `/convite/${this.token}` } });
          return;
        }
        this.error.set(msg);
      },
    });
  }

  loginQueryParams(): Record<string, string> {
    return { redirect: `/convite/${this.token}` };
  }

  registerQueryParams(): Record<string, string> {
    const invite = this.invite();
    return {
      redirect: `/convite/${this.token}`,
      inviteToken: this.token,
      email: invite?.email ?? '',
    };
  }
}
