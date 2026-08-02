import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, AlertController } from '@ionic/angular/standalone';
import { FinanceApiService } from '../../core/services/finance-api.service';
import { CATEGORY_ICON_OPTIONS, categoryLucideNodes, suggestCategoryIcon } from '../../core/utils/category-icon.util';
import { LucideSvgComponent } from '../../shared/components/lucide-svg/lucide-svg.component';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';
import { AppSettings, PlanningCustomTab, PlanningItemCategory } from '../../core/models/api.models';
import type { IconNode } from 'lucide';

interface SettingsFormState {
  eurToBrl: number;
  usdToBrl: number;
  cdiMonthlyRate: number;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, LucideSvgComponent, SkeletonComponent],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage implements OnInit {
  private api = inject(FinanceApiService);
  private alertCtrl = inject(AlertController);

  form: SettingsFormState = { eurToBrl: 6, usdToBrl: 5, cdiMonthlyRate: 0.009 };
  loading = signal(true);
  saving = signal(false);
  saved = signal(false);

  customTabs = signal<PlanningCustomTab[]>([]);
  itemCategories = signal<PlanningItemCategory[]>([]);
  categoryIconOptions = CATEGORY_ICON_OPTIONS;

  newTabName = '';
  newCategoryName = '';
  newCategoryIcon = suggestCategoryIcon('');

  lucideFor = (icon: string | null | undefined): IconNode => categoryLucideNodes(icon);

  ngOnInit(): void {
    this.hydrate();
  }

  private hydrate(): void {
    this.loading.set(true);
    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending <= 0) this.loading.set(false);
    };

    this.api.getSettings().subscribe({
      next: (s) => {
        this.applySettings(s);
        done();
      },
      error: () => done(),
    });
    this.api.getPlanningTaxonomy().subscribe({
      next: (t) => {
        this.customTabs.set(t.customTabs);
        this.itemCategories.set(t.itemCategories);
        done();
      },
      error: () => done(),
    });
  }

  private applySettings(s: AppSettings): void {
    this.form = {
      eurToBrl: s.eurToBrlFallback ?? s.eurToBrl,
      usdToBrl: s.usdToBrlFallback ?? s.usdToBrl ?? 5,
      cdiMonthlyRate: s.cdiMonthlyRate,
    };
  }

  private loadTaxonomy(): void {
    this.api.getPlanningTaxonomy().subscribe((t) => {
      this.customTabs.set(t.customTabs);
      this.itemCategories.set(t.itemCategories);
    });
  }

  save(): void {
    this.saving.set(true);
    this.saved.set(false);
    this.api
      .updateSettings({ eurToBrl: this.form.eurToBrl, usdToBrl: this.form.usdToBrl, cdiMonthlyRate: this.form.cdiMonthlyRate })
      .subscribe((s) => {
        this.applySettings(s);
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 2500);
      });
  }

  onNewCategoryNameChange(name: string): void {
    this.newCategoryName = name;
    this.newCategoryIcon = suggestCategoryIcon(name);
  }

  addTab(): void {
    const name = this.newTabName.trim();
    if (!name) return;
    this.api.saveCustomTab({ name }).subscribe(() => {
      this.newTabName = '';
      this.loadTaxonomy();
    });
  }

  async removeTab(tab: PlanningCustomTab): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Remover aba',
      message: `Remover aba "${tab.name}"? Itens ficarão sem aba.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Remover',
          role: 'destructive',
          handler: () => this.api.deleteCustomTab(tab.id).subscribe(() => this.loadTaxonomy()),
        },
      ],
    });
    await alert.present();
  }

  addCategory(): void {
    const name = this.newCategoryName.trim();
    if (!name) return;
    this.api.saveItemCategory({ name, icon: this.newCategoryIcon }).subscribe(() => {
      this.newCategoryName = '';
      this.newCategoryIcon = suggestCategoryIcon('');
      this.loadTaxonomy();
    });
  }

  updateCategoryIcon(cat: PlanningItemCategory, icon: string): void {
    this.api.saveItemCategory({ name: cat.name, icon }, cat.id).subscribe(() => this.loadTaxonomy());
  }

  async removeCategory(cat: PlanningItemCategory): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Remover categoria',
      message: `Remover categoria "${cat.name}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Remover',
          role: 'destructive',
          handler: () => this.api.deleteItemCategory(cat.id).subscribe(() => this.loadTaxonomy()),
        },
      ],
    });
    await alert.present();
  }
}
