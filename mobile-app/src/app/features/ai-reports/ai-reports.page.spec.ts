import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { AlertController } from '@ionic/angular/standalone';
import { TimeoutError } from 'rxjs';
import { AiReportsPage } from './ai-reports.page';
import { environment } from '../../../environments/environment';
import { AiReport, AiReportListItem, DashboardSummary, MonthSummary } from '../../core/models/api.models';

describe('AiReportsPage', () => {
  let fixture: ComponentFixture<AiReportsPage>;
  let component: AiReportsPage;
  let http: HttpTestingController;
  let alertCreate: jasmine.Spy;
  const base = environment.apiUrl;

  const listItem: AiReportListItem = {
    id: 1,
    periodStart: '2026-03',
    periodEnd: '2026-03',
    monthsCount: 1,
    title: 'Relatório de Março',
    status: 'ready',
    summary: 'Resumo',
    financialHealth: { score: 7, label: 'Bom' },
    createdAt: '2026-03-31 10:00:00',
  };

  const monthSummary = (month: number): MonthSummary => ({
    month,
    label: 'x',
    real: { income: 1000, expense: 500, investment: 0, goals: 0, leisure: 0 },
    projected: { income: 1200, expense: 600, investment: 0, goals: 0, leisure: 0 },
    balanceReal: 500,
    balanceProjected: 600,
  });

  const dashboard: DashboardSummary = {
    year: 2026,
    months: Array.from({ length: 12 }, (_, i) => monthSummary(i + 1)),
    yearTotals: {
      real: { income: 0, expense: 0, investment: 0, goals: 0, leisure: 0 },
      projected: { income: 0, expense: 0, investment: 0, goals: 0, leisure: 0 },
      balanceReal: 0,
    },
    investmentTypes: [],
  } as unknown as DashboardSummary;

  function buildComponent(): void {
    fixture = TestBed.createComponent(AiReportsPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${base}/ai-reports`).flush({ items: [listItem], dailyLimit: 2, remainingToday: 2 });
  }

  beforeEach(async () => {
    const alertSpy = jasmine.createSpyObj('AlertController', ['create']);
    alertSpy.create.and.resolveTo({ present: async () => {} });
    alertCreate = alertSpy.create;

    await TestBed.configureTestingModule({
      imports: [AiReportsPage, HttpClientTestingModule],
      providers: [{ provide: AlertController, useValue: alertSpy }],
    })
      .overrideComponent(AiReportsPage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();

    buildComponent();
  });

  afterEach(() => http.verify());

  it('loads reports on init', () => {
    expect(component.items()).toEqual([listItem]);
    expect(component.dailyLimit()).toBe(2);
    expect(component.remainingToday()).toBe(2);
    expect(component.loading()).toBeFalse();
  });

  it('surfaces an error message when loading fails', () => {
    component.load();
    http.expectOne((r) => r.url === `${base}/ai-reports`).flush(
      { error: 'Falha ao listar.' },
      { status: 500, statusText: 'Server Error' }
    );
    expect(component.error()).toBe('Falha ao listar.');
    expect(component.loading()).toBeFalse();
  });

  it('falls back to a default error message when the server sends none', () => {
    component.load();
    http.expectOne((r) => r.url === `${base}/ai-reports`).flush(
      {},
      { status: 500, statusText: 'Server Error' }
    );
    expect(component.error()).toBe('Não foi possível carregar os relatórios.');
  });

  it('blocks opening the picker when the daily limit was reached', () => {
    component.remainingToday.set(0);
    component.openPicker();
    expect(component.showPicker()).toBeFalse();
    expect(component.error()).toContain('Limite diário atingido');
  });

  it('opens the picker and loads the calendar for the current year', () => {
    component.openPicker();
    expect(component.showPicker()).toBeTrue();
    const req = http.expectOne((r) => r.url === `${base}/dashboard/summary`);
    expect(req.request.params.get('year')).toBe(String(component.pickerYear()));
    req.flush(dashboard);
    expect(component.monthsData().length).toBe(12);
    expect(component.pickerLoading()).toBeFalse();
  });

  it('surfaces a calendar error when the picker year fails to load', () => {
    component.loadPickerYear(2026);
    http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush(
      {},
      { status: 500, statusText: 'Server Error' }
    );
    expect(component.pickerError()).toBe('Não foi possível carregar o calendário.');
    expect(component.pickerLoading()).toBeFalse();
  });

  it('shifts the picker year relative to the current one', () => {
    component.pickerYear.set(2026);
    component.shiftPickerYear(-1);
    const req = http.expectOne((r) => r.url === `${base}/dashboard/summary`);
    expect(req.request.params.get('year')).toBe('2025');
    req.flush(dashboard);
    expect(component.pickerYear()).toBe(2025);
  });

  it('closes the picker and aborts any in-flight generation', () => {
    component.openPicker();
    http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush(dashboard);
    component.generating.set(true);
    component.closePicker();
    expect(component.showPicker()).toBeFalse();
    expect(component.generating()).toBeFalse();
  });

  describe('month selection', () => {
    beforeEach(() => {
      component.pickerYear.set(2026);
    });

    it('selects and deselects a month', () => {
      component.toggleMonth(3);
      expect(component.isSelected(3)).toBeTrue();
      component.toggleMonth(3);
      expect(component.isSelected(3)).toBeFalse();
    });

    it('ignores toggles for months before the planning start or while generating', () => {
      component.toggleMonth(3, true);
      expect(component.isSelected(3)).toBeFalse();
      component.generating.set(true);
      component.toggleMonth(3);
      expect(component.isSelected(3)).toBeFalse();
    });

    it('rejects non-consecutive month selections', () => {
      component.toggleMonth(1);
      component.toggleMonth(3);
      expect(component.isSelected(3)).toBeFalse();
      expect(component.pickerError()).toContain('consecutivos');
    });

    it('rejects selecting more than three months', () => {
      component.toggleMonth(1);
      component.toggleMonth(2);
      component.toggleMonth(3);
      component.toggleMonth(4);
      expect(component.isSelected(4)).toBeFalse();
      expect(component.pickerError()).toContain('no máximo 3 meses');
    });
  });

  describe('generate', () => {
    it('requires at least one selected month', () => {
      component.generate();
      expect(component.pickerError()).toBe('Escolha pelo menos 1 mês.');
    });

    it('generates a report and opens the detail view', () => {
      component.selectedKeys.set(['2026-03']);
      component.generate();
      expect(component.generating()).toBeTrue();
      const req = http.expectOne((r) => r.url === `${base}/ai-reports` && r.method === 'POST');
      const report: AiReport = { ...listItem, id: 2, content: { title: '', summary: '', financialHealth: { score: 5, label: 'Ok' }, highlights: [] } as unknown as AiReport['content'] };
      req.flush({ item: report, remainingToday: 1 });
      expect(component.generating()).toBeFalse();
      expect(component.showPicker()).toBeFalse();
      expect(component.remainingToday()).toBe(1);
      expect(component.detail()).toEqual(report);
      expect(component.showDetail()).toBeTrue();
      expect(component.items()[0].id).toBe(2);
    });

    it('surfaces the server error message and zeroes the quota on 429 limit errors', () => {
      component.selectedKeys.set(['2026-03']);
      component.generate();
      const req = http.expectOne((r) => r.url === `${base}/ai-reports` && r.method === 'POST');
      req.flush({ error: 'Limite diário atingido.' }, { status: 429, statusText: 'Too Many Requests' });
      expect(component.generating()).toBeFalse();
      expect(component.pickerError()).toBe('Limite diário atingido.');
      expect(component.remainingToday()).toBe(0);
    });

    it('does not zero the quota on unrelated errors', () => {
      component.remainingToday.set(2);
      component.selectedKeys.set(['2026-03']);
      component.generate();
      const req = http.expectOne((r) => r.url === `${base}/ai-reports` && r.method === 'POST');
      req.flush({ error: 'Falha genérica.' }, { status: 500, statusText: 'Server Error' });
      expect(component.pickerError()).toBe('Falha genérica.');
      expect(component.remainingToday()).toBe(2);
    });

    it('aborts a previous in-flight generation before starting a new one', () => {
      component.selectedKeys.set(['2026-03']);
      component.generate();
      http.expectOne((r) => r.url === `${base}/ai-reports` && r.method === 'POST');
      component.selectedKeys.set(['2026-04']);
      component.generate();
      const second = http.expectOne((r) => r.url === `${base}/ai-reports` && r.method === 'POST');
      second.flush({ item: listItem, remainingToday: 1 });
      expect(component.generating()).toBeFalse();
    });
  });

  it('maps a generic error message via generateErrorMessage for non-HTTP errors', () => {
    expect((component as unknown as { generateErrorMessage(e: unknown): string }).generateErrorMessage(new TimeoutError())).toContain(
      'demorou demais'
    );
    expect((component as unknown as { generateErrorMessage(e: unknown): string }).generateErrorMessage('boom')).toBe(
      'Falha ao gerar o relatório. Tente novamente.'
    );
    const httpErr = new HttpErrorResponse({ error: { error: 'Custom' }, status: 400 });
    expect((component as unknown as { generateErrorMessage(e: unknown): string }).generateErrorMessage(httpErr)).toBe('Custom');
  });

  describe('detail', () => {
    it('opens and loads a report detail', () => {
      component.openDetail(listItem);
      expect(component.showDetail()).toBeTrue();
      expect(component.detailLoading()).toBeTrue();
      const full: AiReport = { ...listItem, content: { title: '', summary: '', financialHealth: { score: 7, label: 'Bom' }, highlights: [] } as unknown as AiReport['content'] };
      http.expectOne(`${base}/ai-reports/1`).flush({ item: full });
      expect(component.detail()).toEqual(full);
      expect(component.detailLoading()).toBeFalse();
    });

    it('closes the detail view and surfaces an error when loading fails', () => {
      component.openDetail(listItem);
      http.expectOne(`${base}/ai-reports/1`).flush({}, { status: 500, statusText: 'Server Error' });
      expect(component.showDetail()).toBeFalse();
      expect(component.detailLoading()).toBeFalse();
      expect(component.error()).toBe('Não foi possível abrir o relatório.');
    });

    it('closes the detail view directly', () => {
      component.showDetail.set(true);
      component.detail.set({ ...listItem } as AiReport);
      component.closeDetail();
      expect(component.showDetail()).toBeFalse();
      expect(component.detail()).toBeNull();
    });
  });

  describe('remove', () => {
    it('removes a report from the list after confirming', async () => {
      await component.remove(listItem);
      const config = alertCreate.calls.mostRecent().args[0];
      const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
      destructive.handler();
      const req = http.expectOne(`${base}/ai-reports/1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ ok: true });
      expect(component.items()).toEqual([]);
    });

    it('closes the detail view when the removed report is currently open', async () => {
      component.detail.set({ ...listItem } as AiReport);
      component.showDetail.set(true);
      await component.remove(listItem);
      const config = alertCreate.calls.mostRecent().args[0];
      const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
      destructive.handler();
      http.expectOne(`${base}/ai-reports/1`).flush({ ok: true });
      expect(component.showDetail()).toBeFalse();
      expect(component.detail()).toBeNull();
    });

    it('surfaces an error when deletion fails', async () => {
      await component.remove(listItem);
      const config = alertCreate.calls.mostRecent().args[0];
      const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
      destructive.handler();
      http.expectOne(`${base}/ai-reports/1`).flush({}, { status: 500, statusText: 'Server Error' });
      expect(component.error()).toBe('Não foi possível remover o relatório.');
    });
  });

  describe('formatting helpers', () => {
    it('formats a single-month period', () => {
      expect(component.formatPeriod(listItem)).toBe('Março de 2026');
    });

    it('formats a multi-month period range', () => {
      const range = { ...listItem, periodStart: '2026-01', periodEnd: '2026-03' };
      expect(component.formatPeriod(range)).toBe('Janeiro/2026 — Março/2026');
    });

    it('formats a valid createdAt timestamp', () => {
      const out = component.formatCreatedAt('2026-03-31 10:00:00');
      expect(out).not.toBe('2026-03-31 10:00:00');
      expect(out.length).toBeGreaterThan(0);
    });

    it('falls back to the raw string for an invalid createdAt', () => {
      expect(component.formatCreatedAt('not-a-date')).toBe('not-a-date');
    });

    it('maps health scores to tones', () => {
      expect(component.healthTone(9)).toBe('great');
      expect(component.healthTone(7)).toBe('good');
      expect(component.healthTone(5)).toBe('warn');
      expect(component.healthTone(1)).toBe('bad');
      expect(component.healthTone(undefined)).toBe('bad');
    });
  });

  describe('month preview', () => {
    beforeEach(() => {
      component.openPicker();
      http.expectOne((r) => r.url === `${base}/dashboard/summary`).flush(dashboard);
    });

    it('returns real totals for a past month', () => {
      const now = new Date();
      component.pickerYear.set(now.getFullYear());
      const pastMonth = now.getMonth() + 1 > 1 ? now.getMonth() : 12;
      const preview = component.monthPreview(pastMonth);
      expect(preview.forecast).toBeFalse();
    });

    it('returns projected totals for a future month', () => {
      component.pickerYear.set(new Date().getFullYear() + 1);
      const preview = component.monthPreview(1);
      expect(preview.forecast).toBeTrue();
      expect(preview.income).toBe(1200);
    });

    it('returns zeros when there is no data for the month', () => {
      component.monthsData.set([]);
      const preview = component.monthPreview(1);
      expect(preview.income).toBe(0);
      expect(preview.expense).toBe(0);
      expect(preview.balance).toBe(0);
    });
  });

  describe('periodLabel', () => {
    it('is empty when nothing is selected', () => {
      expect(component.periodLabel()).toBe('');
    });

    it('shows a single month label', () => {
      component.selectedKeys.set(['2026-03']);
      expect(component.periodLabel()).toBe('Março de 2026');
    });

    it('shows a range label', () => {
      component.selectedKeys.set(['2026-01', '2026-02', '2026-03']);
      expect(component.periodLabel()).toBe('Janeiro/2026 — Março/2026');
    });
  });

  it('unsubscribes from an in-flight generation on destroy', () => {
    component.selectedKeys.set(['2026-03']);
    component.generate();
    http.expectOne((r) => r.url === `${base}/ai-reports` && r.method === 'POST');
    expect(() => fixture.destroy()).not.toThrow();
  });
});
