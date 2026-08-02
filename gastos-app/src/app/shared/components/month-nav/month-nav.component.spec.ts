import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MonthNavComponent } from './month-nav.component';

describe('MonthNavComponent', () => {
  let fixture: ComponentFixture<MonthNavComponent>;
  let component: MonthNavComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonthNavComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(MonthNavComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('year', 2026);
    fixture.componentRef.setInput('month', 5);
    fixture.detectChanges();
  });

  it('prevMonth decrements within year', () => {
    const months: number[] = [];
    const years: number[] = [];
    component.monthChange.subscribe((m) => months.push(m));
    component.yearChange.subscribe((y) => years.push(y));
    component.prevMonth();
    expect(months).toEqual([4]);
    expect(years).toEqual([2026]);
  });

  it('prevMonth rolls to previous year', () => {
    fixture.componentRef.setInput('month', 0);
    fixture.detectChanges();
    const months: number[] = [];
    const years: number[] = [];
    component.monthChange.subscribe((m) => months.push(m));
    component.yearChange.subscribe((y) => years.push(y));
    component.prevMonth();
    expect(months).toEqual([11]);
    expect(years).toEqual([2025]);
  });

  it('nextMonth increments and rolls year', () => {
    const months: number[] = [];
    const years: number[] = [];
    component.monthChange.subscribe((m) => months.push(m));
    component.yearChange.subscribe((y) => years.push(y));
    component.nextMonth();
    expect(months).toEqual([6]);
    expect(years).toEqual([2026]);

    fixture.componentRef.setInput('month', 11);
    fixture.detectChanges();
    component.nextMonth();
    expect(months[1]).toBe(0);
    expect(years[1]).toBe(2027);
  });
});
