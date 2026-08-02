import { Component, inject, signal, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonSpinner, AlertController } from '@ionic/angular/standalone';
import gsap from 'gsap';
import { AuthService } from '../../core/services/auth.service';
import { BiometricService } from '../../core/services/biometric.service';
import { AmbientHero } from '../../shared/three/ambient-hero';
import { BrandMarkComponent } from '../../shared/components/brand-mark/brand-mark.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, IonContent, IonSpinner, BrandMarkComponent],
  templateUrl: './login.page.html',
  styleUrls: ['../auth-shared.scss', './login.page.scss'],
})
export class LoginPage implements OnInit, AfterViewInit, OnDestroy {
  private auth = inject(AuthService);
  private biometric = inject(BiometricService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private alertCtrl = inject(AlertController);

  @ViewChild('heroCanvas') heroCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('heroContent') heroContentRef?: ElementRef<HTMLElement>;
  @ViewChild('sheet') sheetRef?: ElementRef<HTMLElement>;

  private hero?: AmbientHero;

  redirect = '';
  user = '';
  password = '';
  error = signal('');
  loading = signal(false);

  ngOnInit(): void {
    this.auth.clearSession();
    this.route.queryParamMap.subscribe((params) => {
      this.redirect = params.get('redirect') ?? '';
    });
  }

  ngAfterViewInit(): void {
    if (this.heroCanvasRef) {
      this.hero = new AmbientHero(this.heroCanvasRef.nativeElement);
    }
    const sheet = this.sheetRef?.nativeElement;
    const fields = sheet?.querySelectorAll('.field, .auth-links') ?? [];
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.set(this.heroCanvasRef?.nativeElement ?? [], { opacity: 0 })
      .to(this.heroCanvasRef?.nativeElement ?? [], { opacity: 1, duration: 0.8 })
      .from(
        this.heroContentRef?.nativeElement ?? [],
        { y: 16, opacity: 0, duration: 0.6 },
        '-=0.6'
      )
      .from(
        sheet ?? [],
        { y: 48, opacity: 0, duration: 0.7 },
        '-=0.5'
      )
      .from(fields, { y: 14, opacity: 0, duration: 0.45, stagger: 0.06 }, '-=0.35');
    // Botão Entrar fica sempre visível (não anima opacity,  sumia no emulador).
  }

  ngOnDestroy(): void {
    this.hero?.destroy();
  }

  async submit(): Promise<void> {
    this.error.set('');
    const username = this.user.trim();
    if (!username || !this.password) {
      this.error.set('Informe usuário e senha.');
      return;
    }
    this.loading.set(true);
    const result = await this.auth.loginAsync(username, this.password);
    this.loading.set(false);
    if (result.ok) {
      await this.maybeOfferBiometric();
      this.router.navigateByUrl(this.redirect || '/home');
      return;
    }
    this.error.set(result.message ?? 'Usuário ou senha incorretos.');
  }

  private async maybeOfferBiometric(): Promise<void> {
    if (this.biometric.isEnabled()) return;
    const available = await this.biometric.isAvailable();
    if (!available) return;

    const label = this.biometric.labelFor(this.biometric.biometryType());
    const alert = await this.alertCtrl.create({
      header: 'Entrar com biometria',
      message: `Use ${label} para abrir o Tostoes sem digitar a senha da próxima vez.`,
      buttons: [
        { text: 'Agora não', role: 'cancel' },
        {
          text: 'Ativar',
          handler: () => this.biometric.setEnabled(true),
        },
      ],
    });
    await alert.present();
    await alert.onDidDismiss();
  }
}
