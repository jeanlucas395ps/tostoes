import {
  Component,
  input,
  computed,
  inject,
  signal,
  effect,
  OnDestroy,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { User, UserRef } from '../../../core/models/api.models';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-user-avatar',
  standalone: true,
  template: `
    @if (photoUrl()) {
      <img
        class="avatar avatar-img"
        [class.sm]="size() === 'sm'"
        [src]="photoUrl()"
        [alt]="label()"
        [title]="label()"
      />
    } @else {
      <span
        class="avatar"
        [class.sm]="size() === 'sm'"
        [title]="label()"
      >{{ initials() }}</span>
    }
  `,
  styles: `
    .avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: var(--radius-lg);
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      flex-shrink: 0;
      background: var(--primary-lighter);
      color: var(--primary-dark);
      border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
    }
    .avatar.sm {
      width: 28px;
      height: 28px;
      font-size: 0.625rem;
      border-radius: var(--radius);
    }
    .avatar-img {
      object-fit: cover;
      padding: 0;
      background: var(--surface-elevated);
    }
  `,
})
export class UserAvatarComponent implements OnDestroy {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  user = input<User | UserRef | null>(null);
  name = input<string>('');
  size = input<'sm' | 'md'>('md');

  photoUrl = signal<string | null>(null);

  label = computed(() => this.user()?.name ?? this.name() ?? '');

  initials = computed(() => {
    const raw = this.label().trim();
    if (!raw) return '?';
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return raw.slice(0, 2).toUpperCase();
  });

  constructor() {
    effect((onCleanup) => {
      const u = this.user();
      const path = u && 'avatarUrl' in u ? u.avatarUrl : null;

      // Não ler photoUrl() aqui, senão cada set re-dispara o effect em loop.
      let objectUrl: string | null = null;
      this.photoUrl.set(null);

      if (!path) {
        return;
      }

      const token = this.auth.getToken();
      if (!token) {
        return;
      }

      const sub = this.http
        .get(`${environment.apiUrl}${path}`, {
          responseType: 'blob',
          headers: { Authorization: `Bearer ${token}` },
        })
        .subscribe({
          next: (blob) => {
            objectUrl = URL.createObjectURL(blob);
            this.photoUrl.set(objectUrl);
          },
          error: () => this.photoUrl.set(null),
        });

      onCleanup(() => {
        sub.unsubscribe();
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      });
    });
  }

  ngOnDestroy(): void {
    const url = this.photoUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
