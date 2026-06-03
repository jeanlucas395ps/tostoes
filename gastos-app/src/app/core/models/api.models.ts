export type EntryKind = 'income' | 'expense' | 'investment' | 'leisure';
export type Currency = 'BRL' | 'EUR';
export type Region = 'BR' | 'PT' | 'geral';
export type AccountType = 'bank' | 'investment';

export type UserGender = 'male' | 'female';

export interface User {
  id: number;
  username: string;
  email?: string | null;
  name: string;
  gender: UserGender;
  avatarUrl?: string | null;
}

export interface PlanningInvitePreview {
  token: string;
  email: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
  planningId: number;
  planningName: string;
  inviterName: string;
  expired: boolean;
}

export interface Planning {
  id: number;
  name: string;
  role: 'owner' | 'member';
  memberCount: number;
  createdAt?: string;
}

export interface UserRef {
  id: number;
  username: string;
  name: string;
  gender: UserGender;
  avatarUrl?: string | null;
}

export interface AppSettings {
  /** Mesmo valor que eurToBrlFallback (compatibilidade). */
  eurToBrl: number;
  /** Cotação manual quando a API de câmbio não estiver disponível. */
  eurToBrlFallback: number;
  leisureMonthlyBrl: number;
  montanteInicialBrl: number;
  cdiMonthlyRate: number;
}

export interface FxRateQuote {
  date: string;
  eurToBrl: number;
  source: 'api' | 'fallback';
  fallback: boolean;
}

export interface PlanningCustomTab {
  id: number;
  name: string;
  sortOrder: number;
}

export interface PlanningItemCategory {
  id: number;
  name: string;
  icon: string;
  sortOrder: number;
}

export interface CategoryIconOption {
  icon: string;
  label: string;
}

export interface PlanningTaxonomy {
  customTabs: PlanningCustomTab[];
  itemCategories: PlanningItemCategory[];
  categoryIconOptions?: CategoryIconOption[];
}

export interface FinancialAccount {
  id: number;
  name: string;
  type: AccountType;
  currency: Currency;
  initialBalance: number;
  initialBalanceBrl?: number;
  initialBalanceDate: string;
  color?: string | null;
  sortOrder: number;
  balance: number;
  balanceBrl: number;
  eurToBrl?: number;
  statement?: AccountStatementLine[];
}

export interface AccountStatementLine {
  id?: number;
  date: string;
  kind: EntryKind | 'opening';
  description: string;
  category?: string;
  amount: number;
  amountBrl?: number;
  signedAmount: number;
  signedAmountBrl?: number;
  balanceAfter: number;
  balanceAfterBrl?: number;
  currency: Currency;
  eurToBrl?: number | null;
}

export interface AccountsSummary {
  accounts: FinancialAccount[];
  totals: {
    bank: number;
    investment: number;
    all: number;
  };
}

export interface Transaction {
  id: number;
  transactionDate: string;
  kind: EntryKind;
  description: string;
  amount: number;
  currency: Currency;
  amountBrl: number;
  /** Cotação EUR→BRL usada neste lançamento (quando currency = EUR). */
  eurToBrl?: number | null;
  category: string;
  region: Region;
  accountId?: number | null;
  accountName?: string | null;
  accountType?: AccountType | null;
  responsible?: string | null;
  responsibleUserId?: number | null;
  responsibleUser?: UserRef | null;
  notes?: string | null;
  investmentTypeId?: number | null;
  investmentTypeName?: string | null;
  investmentTypeColor?: string | null;
  registeredBy?: UserRef | null;
  /** Lançamento confirmado a partir de item variável do plano do mês */
  isVariablePlan?: boolean;
  monthPlanEntryId?: number | null;
  canUnconfirm?: boolean;
}

export interface InvestmentType {
  id: number;
  name: string;
  slug: string;
  color: string;
  targetMonthlyBrl: number;
  currentBalanceBrl?: number;
  sortOrder: number;
}

export interface FinancialGoal {
  id: number;
  name: string;
  description?: string | null;
  color: string;
  targetAmountBrl: number;
  currentAmountBrl: number;
  confirmedContributionsBrl: number;
  plannedAmountBrl: number;
  monthlyAmountBrl: number;
  /** Quanto falta para a meta (alvo − saldo atual da conta). */
  remainingAmountBrl?: number;
  monthCount: number;
  projectedMonthBrl: number;
  startDate?: string | null;
  endDate?: string | null;
  deadlineDate?: string | null;
  dueDay: number;
  sourceFinancialAccountId?: number | null;
  sourceFinancialAccountName?: string | null;
  targetFinancialAccountId?: number | null;
  targetFinancialAccountName?: string | null;
  sortOrder: number;
  pct: number;
  plannedPct: number;
  confirmedBarPct: number;
  timelinePct: number;
  overTarget: boolean;
  tracksInvestment: boolean;
  /** Progresso lê saldo da conta de destino em tempo real. */
  tracksAccountBalance?: boolean;
}

export interface InvestmentPortfolioItem {
  id: number;
  name: string;
  slug: string;
  color: string;
  currentBalanceBrl: number;
  monthlyContributionBrl: number;
  cdiPercent: number;
  cdiYieldBrl: number;
  projectedGainBrl: number;
  projectedBalanceBrl: number;
  yieldsCdi: boolean;
}

export interface InvestmentPortfolio {
  refYear: number;
  refMonth: number;
  nextYear: number;
  nextMonth: number;
  cdiMonthlyRate: number;
  items: InvestmentPortfolioItem[];
  totals: {
    currentBalanceBrl: number;
    projectedGainBrl: number;
    cdiYieldBrl: number;
    monthlyContributionBrl: number;
  };
}

export type AccountFlowGraphMode = 'planned' | 'confirmed' | 'current';

export interface AccountFlowGraphNode {
  id: string;
  type: 'bank' | 'investment' | 'expense' | 'income' | 'goal' | string;
  label: string;
  color: string;
  x: number;
  y: number;
  column?: string;
  accountId?: number;
  unassigned?: boolean;
}

export interface AccountFlowGraphEdge {
  from: string;
  to: string;
  amountBrl: number;
  kind: EntryKind;
  /** Nome do lançamento (rótulo na aresta). */
  label: string;
  subKind: string;
  color: string;
  refId: number;
  dashed?: boolean;
  itemCategoryId?: number | null;
  itemCategoryName?: string;
  customTabId?: number | null;
  customTabName?: string | null;
}

export interface AccountFlowGraphFilterAccount {
  id: number;
  name: string;
  type: AccountType;
  color: string;
  nodeId: string;
}

export interface AccountFlowGraphFilterOptions {
  accounts: AccountFlowGraphFilterAccount[];
  categories: Array<{ id: number; name: string; icon: string }>;
  customTabs: Array<{ id: number; name: string }>;
}

export interface AccountFlowGraph {
  year: number;
  month: number;
  mode: AccountFlowGraphMode;
  nodes: AccountFlowGraphNode[];
  edges: AccountFlowGraphEdge[];
  filterOptions?: AccountFlowGraphFilterOptions;
  unassigned: Array<{
    entryId: number;
    label: string;
    amountBrl: number;
    kind: string;
    subKind: string;
    color: string;
    targetId?: string;
  }>;
  width: number;
  height: number;
  totals: { outflowBrl: number; inflowBrl: number };
}

export interface PlanningUsageStart {
  year: number;
  month: number;
  date: string;
}

export type PlanEntryStatus = 'pending' | 'confirmed' | 'skipped';

export interface LedgerSummary {
  incomeTotal: number;
  expenseTotal: number;
  balance: number;
  pendingCount: number;
  confirmedCount: number;
  projected: {
    income: number;
    expense: number;
    balance: number;
  };
}

export interface LedgerView {
  year: number;
  month: number;
  pending: MonthPlanEntry[];
  confirmed: Transaction[];
  summary: LedgerSummary;
}

export interface RecurringItem {
  id: number;
  kind: EntryKind;
  name: string;
  category: string;
  region: Region;
  customTabId?: number | null;
  customTabName?: string | null;
  itemCategoryId?: number | null;
  itemCategoryName?: string | null;
  itemCategoryIcon?: string | null;
  responsible?: string | null;
  responsibleUserId?: number | null;
  responsibleUser?: UserRef | null;
  dueDay?: number | null;
  investmentTypeId?: number | null;
  investmentTypeName?: string | null;
  investmentTypeColor?: string | null;
  financialAccountId?: number | null;
  financialAccountName?: string | null;
  sourceFinancialAccountId?: number | null;
  sourceFinancialAccountName?: string | null;
  currency?: Currency;
  amount?: number;
  defaultAmountBrl: number;
  isFixed: boolean;
  monthAmounts?: Record<number, number>;
}

export interface MonthPlanForecastItem {
  recurringItemId: number;
  kind: EntryKind;
  name: string;
  category: string;
  dueDay: number;
  suggestedAmountBrl: number;
}

export interface MonthPlanSections {
  today: MonthPlanEntry[];
  overdue: MonthPlanEntry[];
  upcoming: MonthPlanEntry[];
  variable: MonthPlanEntry[];
  completed: MonthPlanEntry[];
}

export interface MonthPlanEntry {
  id: number;
  recurringItemId?: number | null;
  financialGoalId?: number | null;
  financialGoalColor?: string | null;
  isGoal?: boolean;
  isVariable?: boolean;
  kind: EntryKind;
  name: string;
  category: string;
  region: Region;
  customTabId?: number | null;
  customTabName?: string | null;
  itemCategoryId?: number | null;
  itemCategoryName?: string | null;
  itemCategoryIcon?: string | null;
  responsible?: string | null;
  responsibleUserId?: number | null;
  responsibleUser?: UserRef | null;
  dueDay?: number | null;
  investmentTypeId?: number | null;
  investmentTypeName?: string | null;
  investmentTypeColor?: string | null;
  financialAccountId?: number | null;
  financialAccountName?: string | null;
  sourceFinancialAccountId?: number | null;
  sourceFinancialAccountName?: string | null;
  currency?: Currency;
  suggestedAmount?: number;
  suggestedAmountBrl: number;
  confirmedAmountBrl?: number | null;
  status: PlanEntryStatus;
  transactionId?: number | null;
  notes?: string | null;
}

export interface MonthPlanSummary {
  projected: Record<EntryKind, number>;
  confirmed: Record<EntryKind, number>;
  pendingCount: number;
  pendingFixedCount: number;
  pendingVariableCount: number;
  confirmedCount: number;
  skippedCount: number;
  totalEntries: number;
  forecastCount: number;
  progressPercent: number;
  balanceProjected: number;
  balanceConfirmed: number;
  balanceAfterLeisure: number;
}

export interface MonthPlanInsights {
  topExpenseCategories: { category: string; amountBrl: number }[];
  message: string;
}

export interface MonthPlan {
  year: number;
  month: number;
  todayDay?: number | null;
  sections: MonthPlanSections;
  forecast: MonthPlanForecastItem[];
  summary: MonthPlanSummary;
  insights: MonthPlanInsights;
  /** @deprecated use sections */
  entries?: MonthPlanEntry[];
}

export interface Projection {
  id: number;
  year: number;
  month: number;
  kind: EntryKind;
  name: string;
  category: string;
  region: Region;
  amountBrl: number;
  investmentTypeId?: number | null;
  investmentTypeName?: string | null;
  investmentTypeColor?: string | null;
  dueDay?: number | null;
  responsible?: string | null;
  responsibleUserId?: number | null;
  responsibleUser?: UserRef | null;
}

export interface MonthFlowTotals {
  income: number;
  expense: number;
  /** Aportes fixos / investimentos (sem metas). */
  investment: number;
  /** Aportes previstos/confirmados de metas financeiras. */
  goals: number;
  leisure: number;
}

export interface MonthSummary {
  month: number;
  label: string;
  real: MonthFlowTotals;
  projected: MonthFlowTotals;
  balanceReal: number;
  balanceProjected: number;
  /** Mês anterior à criação do planejamento — sem dados. */
  beforePlanningStart?: boolean;
}

export interface DashboardSummary {
  year: number;
  planningUsageStart?: PlanningUsageStart;
  months: MonthSummary[];
  yearTotals: {
    real: MonthFlowTotals;
    projected: MonthFlowTotals;
    balanceReal: number;
  };
  investmentTypes: {
    id: number;
    name: string;
    color: string;
    targetMonthlyBrl: number;
    totalRealYear: number;
    targetYear: number;
  }[];
}

export const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const;
