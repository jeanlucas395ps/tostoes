import { ComponentFixture, TestBed } from '@angular/core/testing';
import { YearCalendarComponent } from './year-calendar.component';
import { MonthSummary } from '../../../core/models/api.models';

describe('YearCalendarComponent', () => {
  let fixture: ComponentFixture<YearCalendarComponent>;
  let component: YearCalendarComponent;

  function month(n: number, over: Partial<MonthSummary> = {}): MonthSummary {
    const zero = { income: 0, expense: 0, investment: 0, goals: 0, leisure: 0 };
    return {
      month: n,
      label: `Mês ${n}`,
      real: { ...zero },
      projected: { ...zero },
      balanceReal: 0,
      balanceProjected: 0,
      ...over,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [YearCalendarComponent] })
      .overrideComponent(YearCalendarComponent, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(YearCalendarComponent);
    component = fixture.componentInstance;
    const today = new Date();
    fixture.componentRef.setInput('year', today.getFullYear());
    fixture.componentRef.setInput('selectedMonth', today.getMonth());
    fixture.componentRef.setInput('months', [
      month(1, { beforePlanningStart: true }),
      (() => {
        const row = month(2, {
          real: { income: 10, expense: 0, investment: 0, goals: 1, leisure: 0 },
          projected: { income: 12, expense: 1, investment: 0, goals: 0, leisure: 0 },
        });
        delete (row as { balanceProjected?: number }).balanceProjected;
        delete (row as { balanceReal?: number }).balanceReal;
        return row;
      })(),
      month(3, {
        projected: { income: 0, expense: 0, investment: 5, goals: 1, leisure: 1 },
      }),
    ]);
    fixture.componentRef.setInput('planningUsageStart', {
      year: today.getFullYear(),
      month: 2,
      date: `${today.getFullYear()}-02-01`,
    });
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();
  });

  it('builds empty, real and projected cells', () => {
    const cells = component.cells();
    expect(cells.length).toBe(12);
    expect(cells[0].isEmpty).toBeTrue();
    expect(cells[1].hasReal).toBeTrue();
    expect(cells[1].balanceProjected).toBe(11);
    expect(cells[2].hasProjected).toBeTrue();
    expect(cells[2].showPreview).toBeTrue();
    expect(cells[11].isEmpty).toBeTrue();
    expect(component.isSelected(component.today.getMonth())).toBeTrue();
    expect(component.isCurrentMonth(component.today.getMonth())).toBeTrue();
    if (component.today.getMonth() > 0) {
      expect(component.isPastMonth(0)).toBeTrue();
      expect(component.isPastMonth(component.today.getMonth())).toBeFalse();
    } else {
      expect(component.isPastMonth(0)).toBeFalse();
    }
  });

  it('blocks months before planning start and emits navigation', () => {
    const months: number[] = [];
    const years: number[] = [];
    component.monthChange.subscribe((m) => months.push(m));
    component.yearChange.subscribe((y) => years.push(y));
    component.selectMonth(0);
    expect(months).toEqual([]);
    component.selectMonth(5);
    expect(months).toEqual([5]);
    component.prevYear();
    component.nextYear();
    component.goToToday();
    expect(years[0]).toBe(component.today.getFullYear() - 1);
    expect(years[1]).toBe(component.today.getFullYear() + 1);
    expect(years[2]).toBe(component.today.getFullYear());
    expect(months[months.length - 1]).toBe(component.today.getMonth());

    fixture.componentRef.setInput('year', component.today.getFullYear() - 1);
    fixture.detectChanges();
    expect(component.isPastMonth(0)).toBeTrue();
    expect(component.isCurrentMonth(component.today.getMonth())).toBeFalse();
    fixture.componentRef.setInput('year', component.today.getFullYear() + 1);
    fixture.detectChanges();
    expect(component.isPastMonth(0)).toBeFalse();
  });
});
