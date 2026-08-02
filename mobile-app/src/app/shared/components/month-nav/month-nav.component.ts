import { Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { MONTH_LABELS } from '../../../core/models/api.models';

@Component({
  selector: 'app-month-nav',
  standalone: true,
  imports: [IonIcon],
  templateUrl: './month-nav.component.html',
  styleUrl: './month-nav.component.scss',
})
export class MonthNavComponent {
  readonly MONTH_LABELS = MONTH_LABELS;

  year = input.required<number>();
  month = input.required<number>();
  yearChange = output<number>();
  monthChange = output<number>();

  prevMonth(): void {
    let m = this.month() - 1;
    let y = this.year();
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    this.monthChange.emit(m);
    this.yearChange.emit(y);
  }

  nextMonth(): void {
    let m = this.month() + 1;
    let y = this.year();
    if (m > 11) {
      m = 0;
      y += 1;
    }
    this.monthChange.emit(m);
    this.yearChange.emit(y);
  }
}
