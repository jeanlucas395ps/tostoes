import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AccountsSummary,
  AppSettings,
  Currency,
  DashboardSummary,
  EntryKind,
  FxRateQuote,
  FinancialAccount,
  InvestmentPortfolio,
  AccountFlowGraph,
  AccountFlowGraphMode,
  FinancialGoal,
  InvestmentType,
  LedgerView,
  MonthPlan,
  PlanningCustomTab,
  PlanningItemCategory,
  PlanningTaxonomy,
  Projection,
  RecurringItem,
  Transaction,
  User,
} from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class FinanceApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  getSettings(): Observable<AppSettings> {
    return this.http.get<AppSettings>(`${this.base}/settings`);
  }

  updateSettings(body: Partial<AppSettings>): Observable<AppSettings> {
    return this.http.put<AppSettings>(`${this.base}/settings`, body);
  }

  getFxRate(date: string): Observable<FxRateQuote> {
    return this.http.get<FxRateQuote>(`${this.base}/fx/eur-brl`, {
      params: { date },
    });
  }

  getDashboard(year: number): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${this.base}/dashboard/summary`, {
      params: { year: String(year) },
    });
  }

  getAccountsSummary(): Observable<AccountsSummary> {
    return this.http.get<AccountsSummary>(`${this.base}/accounts/summary`);
  }

  getAccounts(type?: 'bank' | 'investment'): Observable<{ items: FinancialAccount[] }> {
    let params = new HttpParams();
    if (type) params = params.set('type', type);
    return this.http.get<{ items: FinancialAccount[] }>(`${this.base}/accounts`, { params });
  }

  getAccount(
    id: number,
    year?: number,
    month?: number,
    filters?: { kind?: EntryKind; search?: string }
  ): Observable<{ item: FinancialAccount }> {
    let params = new HttpParams();
    if (year != null) params = params.set('year', String(year));
    if (month != null) params = params.set('month', String(month));
    if (filters?.kind) params = params.set('kind', filters.kind);
    if (filters?.search?.trim()) params = params.set('search', filters.search.trim());
    return this.http.get<{ item: FinancialAccount }>(`${this.base}/accounts/${id}`, { params });
  }

  saveAccount(body: Partial<FinancialAccount>, id?: number): Observable<{ item: FinancialAccount }> {
    if (id) {
      return this.http.put<{ item: FinancialAccount }>(`${this.base}/accounts/${id}`, body);
    }
    return this.http.post<{ item: FinancialAccount }>(`${this.base}/accounts`, body);
  }

  deleteAccount(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/accounts/${id}`);
  }

  getTransactions(
    year: number,
    month: number,
    kind?: EntryKind
  ): Observable<{ items: Transaction[] }> {
    let params = new HttpParams()
      .set('year', String(year))
      .set('month', String(month));
    if (kind) params = params.set('kind', kind);
    return this.http.get<{ items: Transaction[] }>(`${this.base}/transactions`, {
      params,
    });
  }

  saveTransaction(body: Partial<Transaction>, id?: number): Observable<{ item: Transaction }> {
    if (id) {
      return this.http.put<{ item: Transaction }>(
        `${this.base}/transactions/${id}`,
        body
      );
    }
    return this.http.post<{ item: Transaction }>(`${this.base}/transactions`, body);
  }

  deleteTransaction(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/transactions/${id}`);
  }

  getInvestmentTypes(): Observable<{ items: InvestmentType[] }> {
    return this.http.get<{ items: InvestmentType[] }>(
      `${this.base}/investment-types`
    );
  }

  getGoals(
    year: number,
    month?: number
  ): Observable<{ items: FinancialGoal[]; year: number; month: number }> {
    let params = new HttpParams().set('year', String(year));
    if (month != null) {
      params = params.set('month', String(month));
    }
    return this.http.get<{ items: FinancialGoal[]; year: number; month: number }>(
      `${this.base}/goals`,
      { params }
    );
  }

  saveGoal(
    body: {
      name: string;
      description?: string;
      color?: string;
      targetAmountBrl: number;
      startDate: string;
      endDate: string;
      dueDay?: number;
      deadlineDate?: string | null;
      sourceFinancialAccountId?: number | null;
      targetFinancialAccountId?: number | null;
      sortOrder?: number;
    },
    id?: number
  ): Observable<{ item: FinancialGoal }> {
    if (id) {
      return this.http.put<{ item: FinancialGoal }>(`${this.base}/goals/${id}`, body);
    }
    return this.http.post<{ item: FinancialGoal }>(`${this.base}/goals`, body);
  }

  deleteGoal(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/goals/${id}`);
  }

  getInvestmentPortfolio(year: number, month: number): Observable<InvestmentPortfolio> {
    return this.http.get<InvestmentPortfolio>(`${this.base}/investment-types/portfolio`, {
      params: { year: String(year), month: String(month) },
    });
  }

  getAccountFlowGraph(
    year: number,
    month: number,
    mode: AccountFlowGraphMode
  ): Observable<AccountFlowGraph> {
    return this.http.get<AccountFlowGraph>(`${this.base}/accounts/flow-graph`, {
      params: { year: String(year), month: String(month), mode },
    });
  }

  getProjections(
    year: number,
    kind?: EntryKind
  ): Observable<{ items: Projection[] }> {
    let params = new HttpParams().set('year', String(year));
    if (kind) params = params.set('kind', kind);
    return this.http.get<{ items: Projection[] }>(`${this.base}/projections`, {
      params,
    });
  }

  saveProjection(body: Partial<Projection>): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/projections`, body);
  }

  deleteProjection(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/projections/${id}`);
  }

  getHouseholdUsers(): Observable<{ items: User[] }> {
    return this.http.get<{ items: User[] }>(`${this.base}/auth/users`);
  }

  getLedger(year: number, month: number, kinds?: string): Observable<LedgerView> {
    let params = new HttpParams()
      .set('year', String(year))
      .set('month', String(month));
    if (kinds) params = params.set('kinds', kinds);
    return this.http.get<LedgerView>(`${this.base}/ledger`, { params });
  }

  getMonthPlan(year: number, month: number): Observable<MonthPlan> {
    return this.http.get<MonthPlan>(`${this.base}/month-plan`, {
      params: { year: String(year), month: String(month) },
    });
  }

  regenerateMonthPlan(year: number, month: number): Observable<MonthPlan> {
    return this.http.post<MonthPlan>(`${this.base}/month-plan/regenerate`, null, {
      params: { year: String(year), month: String(month) },
    });
  }

  addMonthPlanEntry(body: {
    year: number;
    month: number;
    kind: EntryKind;
    name: string;
    amount?: number;
    suggestedAmountBrl?: number;
    currency?: Currency;
    category?: string;
    region?: string;
    customTabId?: number | null;
    itemCategoryId?: number | null;
    newCategoryName?: string;
    newCategoryIcon?: string;
    responsibleUserId?: number | null;
    investmentTypeId?: number | null;
    financialAccountId?: number | null;
  }): Observable<MonthPlan> {
    return this.http.post<MonthPlan>(`${this.base}/month-plan`, body);
  }

  updateMonthPlanEntry(
    id: number,
    body: {
      suggestedAmount?: number;
      suggestedAmountBrl?: number;
      currency?: Currency;
      kind?: EntryKind;
      name?: string;
      category?: string;
      region?: string;
      customTabId?: number | null;
      itemCategoryId?: number | null;
      newCategoryName?: string;
      newCategoryIcon?: string;
      responsibleUserId?: number | null;
      investmentTypeId?: number | null;
      financialAccountId?: number | null;
    }
  ): Observable<MonthPlan> {
    return this.http.put<MonthPlan>(`${this.base}/month-plan/${id}`, body);
  }

  confirmMonthPlanEntry(
    id: number,
    body?: {
      amount?: number;
      amountBrl?: number;
      currency?: Currency;
      transactionDate?: string;
      accountId?: number;
      targetAccountId?: number;
    }
  ): Observable<MonthPlan> {
    return this.http.post<MonthPlan>(`${this.base}/month-plan/${id}/confirm`, body ?? {});
  }

  skipMonthPlanEntry(id: number): Observable<MonthPlan> {
    return this.http.post<MonthPlan>(`${this.base}/month-plan/${id}/skip`, {});
  }

  unconfirmMonthPlanEntry(id: number): Observable<MonthPlan> {
    return this.http.post<MonthPlan>(`${this.base}/month-plan/${id}/unconfirm`, {});
  }

  deleteMonthPlanEntry(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/month-plan/${id}`);
  }

  unconfirmTransaction(id: number): Observable<{ ok: boolean; monthPlanEntryId?: number }> {
    return this.http.post<{ ok: boolean; monthPlanEntryId?: number }>(
      `${this.base}/transactions/${id}/unconfirm`,
      {}
    );
  }

  spawnMonthPlanEntry(body: {
    year: number;
    month: number;
    recurringItemId: number;
    amountBrl?: number;
  }): Observable<MonthPlan> {
    return this.http.post<MonthPlan>(`${this.base}/month-plan/spawn`, body);
  }

  getPlanningTaxonomy(): Observable<PlanningTaxonomy> {
    return this.http.get<PlanningTaxonomy>(`${this.base}/planning-taxonomy`);
  }

  saveCustomTab(
    body: { name: string; sortOrder?: number },
    id?: number
  ): Observable<{ item: PlanningCustomTab }> {
    if (id) {
      return this.http.put<{ item: PlanningCustomTab }>(
        `${this.base}/planning-custom-tabs/${id}`,
        body
      );
    }
    return this.http.post<{ item: PlanningCustomTab }>(
      `${this.base}/planning-custom-tabs`,
      body
    );
  }

  deleteCustomTab(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/planning-custom-tabs/${id}`);
  }

  saveItemCategory(
    body: { name: string; icon?: string; sortOrder?: number },
    id?: number
  ): Observable<{ item: PlanningItemCategory }> {
    if (id) {
      return this.http.put<{ item: PlanningItemCategory }>(
        `${this.base}/planning-item-categories/${id}`,
        body
      );
    }
    return this.http.post<{ item: PlanningItemCategory }>(
      `${this.base}/planning-item-categories`,
      body
    );
  }

  deleteItemCategory(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/planning-item-categories/${id}`);
  }

  getRecurringItems(kind?: EntryKind): Observable<{ items: RecurringItem[] }> {
    let params = new HttpParams();
    if (kind) params = params.set('kind', kind);
    return this.http.get<{ items: RecurringItem[] }>(`${this.base}/recurring-items`, {
      params,
    });
  }

  saveRecurringItem(
    body: Partial<RecurringItem>,
    id?: number
  ): Observable<{ item: RecurringItem }> {
    const payload = {
      kind: body.kind,
      name: body.name,
      category: body.category,
      region: body.region,
      customTabId: body.customTabId ?? null,
      itemCategoryId: body.itemCategoryId ?? null,
      newCategoryName: (body as { newCategoryName?: string }).newCategoryName,
      newCategoryIcon: (body as { newCategoryIcon?: string }).newCategoryIcon,
      responsibleUserId: body.responsibleUserId ?? null,
      currency: body.currency ?? 'BRL',
      amount: body.amount ?? body.defaultAmountBrl ?? 0,
      dueDay: body.dueDay,
      investmentTypeId: body.investmentTypeId,
      financialAccountId: body.financialAccountId ?? null,
      sourceFinancialAccountId: body.sourceFinancialAccountId ?? null,
    };
    if (id) {
      return this.http.put<{ item: RecurringItem }>(
        `${this.base}/recurring-items/${id}`,
        payload
      );
    }
    return this.http.post<{ item: RecurringItem }>(
      `${this.base}/recurring-items`,
      payload
    );
  }

  deleteRecurringItem(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/recurring-items/${id}`);
  }
}
