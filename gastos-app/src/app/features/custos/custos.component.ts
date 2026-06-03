import { Component } from '@angular/core';
import { LedgerComponent } from '../ledger/ledger.component';

@Component({
  selector: 'app-custos',
  standalone: true,
  imports: [LedgerComponent],
  template: `
    <app-ledger
      kind="expense"
      title="Custos"
      subtitle="Gastos reais do dia a dia , Brasil, Portugal e outros"
      accent="#EF4444"
    />
  `,
})
export class CustosComponent {}
