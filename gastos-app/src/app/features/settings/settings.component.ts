import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FinanceApiService } from '../../core/services/finance-api.service';
import {
  AppSettings,
  PlanningCustomTab,
  PlanningItemCategory,
} from '../../core/models/api.models';
import {
  CATEGORY_ICON_OPTIONS,
  suggestCategoryIcon,
} from '../../core/utils/category-icon.util';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  private api = inject(FinanceApiService);

  form: AppSettings = {
    eurToBrl: 6,
    eurToBrlFallback: 6,
    cdiMonthlyRate: 0.0095,
    leisureMonthlyBrl: 0,
    montanteInicialBrl: 0,
  };
  saved = signal(false);

  customTabs = signal<PlanningCustomTab[]>([]);
  itemCategories = signal<PlanningItemCategory[]>([]);
  newTabName = '';
  newCategoryName = '';
  newCategoryIcon = suggestCategoryIcon('');
  categoryIconOptions = CATEGORY_ICON_OPTIONS;

  ngOnInit(): void {
    this.api.getSettings().subscribe((s) => {
      this.form = {
        ...s,
        eurToBrlFallback: s.eurToBrlFallback ?? s.eurToBrl,
        eurToBrl: s.eurToBrlFallback ?? s.eurToBrl,
      };
    });
    this.loadTaxonomy();
  }

  loadTaxonomy(): void {
    this.api.getPlanningTaxonomy().subscribe((t) => {
      this.customTabs.set(t.customTabs);
      this.itemCategories.set(t.itemCategories);
    });
  }

  save(): void {
    this.api.updateSettings({
      eurToBrl: this.form.eurToBrl,
      cdiMonthlyRate: this.form.cdiMonthlyRate,
    }).subscribe((s) => {
      this.form = s;
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 2500);
    });
  }

  addTab(): void {
    const name = this.newTabName.trim();
    if (!name) return;
    this.api.saveCustomTab({ name }).subscribe({
      next: () => {
        this.newTabName = '';
        this.loadTaxonomy();
      },
    });
  }

  removeTab(tab: PlanningCustomTab): void {
    if (!confirm(`Remover aba "${tab.name}"? Itens ficarão sem aba.`)) return;
    this.api.deleteCustomTab(tab.id).subscribe(() => this.loadTaxonomy());
  }

  onNewCategoryNameChange(name: string): void {
    this.newCategoryName = name;
    this.newCategoryIcon = suggestCategoryIcon(name);
  }

  addCategory(): void {
    const name = this.newCategoryName.trim();
    if (!name) return;
    this.api.saveItemCategory({ name, icon: this.newCategoryIcon }).subscribe({
      next: () => {
        this.newCategoryName = '';
        this.newCategoryIcon = suggestCategoryIcon('');
        this.loadTaxonomy();
      },
    });
  }

  updateCategoryIcon(cat: PlanningItemCategory, icon: string): void {
    this.api.saveItemCategory({ name: cat.name, icon }, cat.id).subscribe({
      next: () => this.loadTaxonomy(),
    });
  }

  removeCategory(cat: PlanningItemCategory): void {
    if (!confirm(`Remover categoria "${cat.name}"?`)) return;
    this.api.deleteItemCategory(cat.id).subscribe(() => this.loadTaxonomy());
  }
}
