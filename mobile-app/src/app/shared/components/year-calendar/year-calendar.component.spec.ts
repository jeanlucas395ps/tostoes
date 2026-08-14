import { ComponentFixture, TestBed } from '@angular/core/testing';
import { YearCalendarComponent } from './year-calendar.component';
import { MonthSummary } from '../../../core/models/api.models';

describe('YearCalendarComponent', () => {
  let fixture: ComponentFixture<YearCalendarComponent>;
  let component: YearCalendarComponent;

  const zeroTotals = { income: 0, expense: 0, investment: 0, goals: 0, leisure: 0 };

  function monthRow(month: number, overrides: Partial<MonthSummary> = {}): MonthSummary {
    const base = {
      month,
      label: 'x',
      real: { ...zeroTotals },
      projected: { ...zeroTotals },
      balanceReal: 0,
      balanceProjected: 0,
    };
    return { ...base, ...overrides } as MonthSummary;
  }

  function monthRowWithoutBalanceProjected(month: number, overrides: Partial<MonthSummary> = {}): MonthSummary {
    const row = monthRow(month, overrides) as unknown as Record<string, unknown>;
    delete row['balanceProjected'];
    return row as unknown as MonthSummary;
  }

  function build(
    year = 2026,
    selectedMonth = 0,
    months: MonthSummary[] = [],
    planningUsageStart: { year: number; month: number; date: string } | null = null
  ): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [YearCalendarComponent] }).compileComponents();
    fixture = TestBed.createComponent(YearCalendarComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('year', year);
    fixture.componentRef.setInput('selectedMonth', selectedMonth);
    fixture.componentRef.setInput('months', months);
    fixture.componentRef.setInput('planningUsageStart', planningUsageStart);
    fixture.detectChanges();
  }

  it('builds 12 empty cells when there is no month data', () => {
    build();
    const cells = component.cells();
    expect(cells.length).toBe(12);
    expect(cells.every((c) => c.isEmpty)).toBeTrue();
  });

  it('marks a month before the planning start as empty regardless of totals', () => {
    build(2026, 0, [monthRow(1, { beforePlanningStart: true, real: { ...zeroTotals, income: 500 } })]);
    const jan = component.cells()[0];
    expect(jan.isEmpty).toBeTrue();
    expect(jan.balanceReal).toBe(0);
  });

  it('derives balanceProjected from the components when the server omits it', () => {
    build(2026, 0, [
      monthRowWithoutBalanceProjected(1, {
        projected: { income: 1000, expense: 200, investment: 100, goals: 50, leisure: 20 },
      }),
    ]);
    const jan = component.cells()[0];
    expect(jan.balanceProjected).toBe(1000 - 200 - 100 - 50 - 20);
    expect(jan.hasProjected).toBeTrue();
    expect(jan.showPreview).toBeTrue();
    expect(jan.isEmpty).toBeFalse();
  });

  it('flags hasReal when any real totals are non-zero', () => {
    build(2026, 0, [monthRow(1, { real: { ...zeroTotals, expense: 50 } })]);
    expect(component.cells()[0].hasReal).toBeTrue();
  });

  it('flags hasReal from a non-zero real balance alone', () => {
    build(2026, 0, [monthRow(1, { balanceReal: 42 })]);
    expect(component.cells()[0].hasReal).toBeTrue();
  });

  it('produces short labels from the full month label', () => {
    const cells = (() => {
      build();
      return component.cells();
    })();
    expect(cells[0].shortLabel).toBe(cells[0].label.slice(0, 3));
  });

  it('isSelected reflects the selectedMonth input', () => {
    build(2026, 3);
    expect(component.isSelected(3)).toBeTrue();
    expect(component.isSelected(4)).toBeFalse();
  });

  it('isCurrentMonth only matches today\'s year and month', () => {
    build(component['today'].getFullYear(), 0);
    expect(component.isCurrentMonth(component['today'].getMonth())).toBeTrue();
    expect(component.isCurrentMonth((component['today'].getMonth() + 1) % 12)).toBeFalse();
    build(component['today'].getFullYear() - 1, 0);
    expect(component.isCurrentMonth(component['today'].getMonth())).toBeFalse();
  });

  describe('isPastMonth', () => {
    it('treats every month of a past year as past', () => {
      build(component['today'].getFullYear() - 1, 0);
      expect(component.isPastMonth(11)).toBeTrue();
    });

    it('treats every month of a future year as not past', () => {
      build(component['today'].getFullYear() + 1, 0);
      expect(component.isPastMonth(0)).toBeFalse();
    });

    it('compares month index within the current year', () => {
      build(component['today'].getFullYear(), 0);
      const nowMonth = component['today'].getMonth();
      if (nowMonth > 0) {
        expect(component.isPastMonth(nowMonth - 1)).toBeTrue();
      }
      expect(component.isPastMonth(nowMonth)).toBeFalse();
    });
  });

  describe('selectMonth', () => {
    it('emits monthChange when the month is usable', () => {
      build(2026, 0);
      const spy = jasmine.createSpy('monthChange');
      component.monthChange.subscribe(spy);
      component.selectMonth(3);
      expect(spy).toHaveBeenCalledWith(3);
    });

    it('blocks selecting a month before the planning usage start', () => {
      build(2026, 0, [], { year: 2026, month: 6, date: '2026-06-01' });
      const spy = jasmine.createSpy('monthChange');
      component.monthChange.subscribe(spy);
      component.selectMonth(2);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('prevYear / nextYear emit relative years', () => {
    build(2026, 0);
    const spy = jasmine.createSpy('yearChange');
    component.yearChange.subscribe(spy);
    component.prevYear();
    expect(spy).toHaveBeenCalledWith(2025);
    component.nextYear();
    expect(spy).toHaveBeenCalledWith(2027);
  });

  it('goToToday emits the current year and month', () => {
    build(2020, 0);
    const yearSpy = jasmine.createSpy('yearChange');
    const monthSpy = jasmine.createSpy('monthChange');
    component.yearChange.subscribe(yearSpy);
    component.monthChange.subscribe(monthSpy);
    component.goToToday();
    expect(yearSpy).toHaveBeenCalledWith(component['today'].getFullYear());
    expect(monthSpy).toHaveBeenCalledWith(component['today'].getMonth());
  });
});
