import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { PlanningService } from '../../../core/services/planning.service';
import { Planning } from '../../../core/models/api.models';

type Mode = 'list' | 'create' | 'rename' | 'invite';

@Component({
  selector: 'app-planning-manager',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './planning-manager.component.html',
  styleUrl: './planning-manager.component.scss',
})
export class PlanningManagerComponent {
  planning = inject(PlanningService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  cancelled = output<void>();

  mode = signal<Mode>('list');
  renamingId = signal<number | null>(null);
  nameInput = signal('Novo planejamento');
  inviteEmail = signal('');
  invitePlanningId = signal<number | null>(this.planning.getActiveId());
  error = signal('');
  successMessage = signal('');
  saving = signal(false);

  select(id: number): void {
    if (id === this.planning.getActiveId()) {
      this.cancelled.emit();
      return;
    }
    this.planning.setActive(id);
    this.reload();
  }

  openCreate(): void {
    this.mode.set('create');
    this.nameInput.set('Novo planejamento');
    this.error.set('');
  }

  openRename(p: Planning): void {
    this.mode.set('rename');
    this.renamingId.set(p.id);
    this.nameInput.set(p.name);
    this.error.set('');
  }

  openInvite(): void {
    this.mode.set('invite');
    this.invitePlanningId.set(this.planning.getActiveId());
    this.inviteEmail.set('');
    this.error.set('');
    this.successMessage.set('');
  }

  backToList(): void {
    this.mode.set('list');
    this.error.set('');
  }

  submitCreate(): void {
    const name = this.nameInput().trim();
    if (!name) {
      this.error.set('Informe um nome para o planejamento.');
      return;
    }
    this.saving.set(true);
    this.planning.create(name).subscribe({
      next: () => this.reload(),
      error: (err) => {
        this.saving.set(false);
        this.error.set(err.error?.error ?? 'Não foi possível criar o planejamento.');
      },
    });
  }

  submitRename(): void {
    const id = this.renamingId();
    if (!id) return;
    const name = this.nameInput().trim();
    if (!name) {
      this.error.set('Informe um nome para o planejamento.');
      return;
    }
    this.saving.set(true);
    this.planning.update(id, name).subscribe({
      next: () => {
        this.saving.set(false);
        this.mode.set('list');
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err.error?.error ?? 'Não foi possível renomear o planejamento.');
      },
    });
  }

  async confirmDelete(p: Planning): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Apagar planejamento',
      message: `Tem certeza que quer apagar ${p.name}? Todos os movimentos, contas, metas e fixos deste planejamento serão removidos de forma permanente.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Apagar definitivamente', role: 'destructive', handler: () => this.doDelete(p) },
      ],
    });
    await alert.present();
  }

  private doDelete(p: Planning): void {
    const wasActive = p.id === this.planning.getActiveId();
    this.planning.delete(p.id).subscribe({
      next: (items) => {
        if (!items.length) {
          this.openCreate();
          return;
        }
        if (wasActive) this.reload();
      },
      error: async () => this.toast('Não foi possível apagar o planejamento.'),
    });
  }

  private reload(): void {
    window.location.reload();
  }

  submitInvite(): void {
    const id = this.invitePlanningId();
    const email = this.inviteEmail().trim();
    this.error.set('');
    if (!id) {
      this.error.set('Selecione o planejamento.');
      return;
    }
    if (!email) {
      this.error.set('Informe o e-mail da pessoa.');
      return;
    }
    this.saving.set(true);
    this.planning.sendInvite(id, email).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.successMessage.set(res.message + (res.inviteUrl ? ` Link (dev): ${res.inviteUrl}` : ''));
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err.error?.error ?? 'Não foi possível enviar o convite.');
      },
    });
  }

  private async toast(message: string): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 2500, position: 'bottom' });
    await t.present();
  }
}
