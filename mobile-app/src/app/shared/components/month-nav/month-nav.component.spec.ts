import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MonthNavComponent } from './month-nav.component';

describe('MonthNavComponent', () => {
  let fixture: ComponentFixture<MonthNavComponent>;
  let component: MonthNavComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonthNavComponent],
    })
      .overrideComponent(MonthNavComponent, {
        set: { template: '<div></div>', imports: [] },
      })
      .compileComponents();
    fixture = TestBed.createComponent(MonthNavComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('year', 2026);
    fixture.componentRef.setInput('month', 5);
    fixture.detectChanges();
  });

  it('prev and next month', () => {
    const months: number[] = [];
    const years: number[] = [];
    component.monthChange.subscribe((m) => months.push(m));
    component.yearChange.subscribe((y) => years.push(y));
    component.prevMonth();
    expect(months[0]).toBe(4);
    component.nextMonth();
    expect(months[1]).toBe(6);

    fixture.componentRef.setInput('month', 0);
    fixture.detectChanges();
    component.prevMonth();
    expect(months[2]).toBe(11);
    expect(years[2]).toBe(2025);

    fixture.componentRef.setInput('month', 11);
    fixture.componentRef.setInput('year', 2026);
    fixture.detectChanges();
    component.nextMonth();
    expect(months[3]).toBe(0);
    expect(years[3]).toBe(2027);
  });
});
