import { Component } from '@angular/core';
import { LedgerComponent } from '../ledger/ledger.component';

@Component({
  selector: 'app-ganhos',
  standalone: true,
  imports: [LedgerComponent],
  template: `
    <app-ledger
      kind="income"
      title="Ganhos"
      subtitle="Tudo que entrou de dinheiro , salários, extras, reembolsos"
      accent="#10B981"
    />
  `,
})
export class GanhosComponent {}
