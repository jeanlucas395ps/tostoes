<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\MoneyHelper;
use Gastos\Api\ResponsibleUser;
use Gastos\Api\Services\AccountService;
use Gastos\Api\Services\FxRateService;
use Gastos\Api\Services\GoalPlanService;
use Gastos\Api\Services\InvestmentPortfolioService;
use Gastos\Api\Services\MonthPlanService;
use Gastos\Api\Services\ProjectionService;
use PDO;
use PDOStatement;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;

final class CoverageBoostMaxTest extends TestCase
{
    private function stmt(?callable $cfg = null): PDOStatement
    {
        $s = $this->createMock(PDOStatement::class);
        $s->method('execute')->willReturn(true);
        if ($cfg) {
            $cfg($s);
        }

        return $s;
    }

    /** @return array<string, mixed> */
    private function planEntryRow(array $over = []): array
    {
        return array_merge([
            'id' => 1,
            'year' => 2026,
            'month' => 7,
            'kind' => 'expense',
            'name' => 'Item',
            'category' => 'Casa',
            'region' => 'geral',
            'status' => 'pending',
            'suggested_amount_brl' => 100,
            'suggested_amount' => 100,
            'currency' => 'BRL',
            'due_day' => 5,
            'recurring_item_id' => 3,
            'financial_goal_id' => null,
            'responsible' => null,
            'responsible_user_id' => null,
            'investment_type_id' => null,
            'financial_account_id' => null,
            'source_financial_account_id' => null,
            'custom_tab_id' => null,
            'item_category_id' => null,
            'confirmed_amount_brl' => null,
            'transaction_id' => null,
            'is_installment' => 0,
            'notes' => null,
        ], $over);
    }

    public function testSyncDueSuggestionsInsertsWhenDue(): void
    {
        $row = [
            'id' => 4,
            'kind' => 'expense',
            'name' => 'Net',
            'category' => 'Casa',
            'region' => 'geral',
            'responsible' => 'Conjunto',
            'responsible_user_id' => null,
            'due_day' => 5,
            'investment_type_id' => null,
            'financial_account_id' => null,
            'source_financial_account_id' => null,
            'custom_tab_id' => null,
            'item_category_id' => null,
            'currency' => 'BRL',
            'amount_brl' => 80,
            'amount_original' => null,
            'is_installment' => 0,
            'default_amount_brl' => 80,
        ];

        $list = $this->stmt(fn ($s) => $s->method('fetch')->willReturnOnConsecutiveCalls($row, false));
        $owner = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('2'));
        $insert = $this->stmt();
        $insert->expects($this->once())->method('execute');
        $check = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($list, $owner, $insert, $check) {
            if (str_contains($sql, 'FROM recurring_items r')) {
                return $list;
            }
            if (str_contains($sql, 'created_by_user_id')) {
                return $owner;
            }
            if (str_starts_with(ltrim($sql), 'INSERT INTO month_plan_entries')) {
                return $insert;
            }
            if (str_contains($sql, 'SELECT id FROM month_plan_entries')) {
                return $check;
            }

            return $this->stmt();
        });

        MonthPlanService::syncDueSuggestions($pdo, 1, 2026, 7, 15);
        $this->assertTrue(true);
    }

    public function testGetPlanGroupsAndForecastAndInsights(): void
    {
        $y = (int) date('Y');
        $m = (int) date('n');
        $today = (int) date('j');

        $dueList = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $owner = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('1'));
        $insert = $this->stmt();

        $entries = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([
            $this->planEntryRow([
                'id' => 1,
                'status' => 'confirmed',
                'kind' => 'expense',
                'category' => 'Mercado',
                'suggested_amount_brl' => 40,
                'confirmed_amount_brl' => 40,
                'recurring_item_id' => 1,
                'due_day' => $today,
            ]),
            $this->planEntryRow([
                'id' => 2,
                'status' => 'pending',
                'kind' => 'expense',
                'category' => 'Casa',
                'suggested_amount_brl' => 90,
                'recurring_item_id' => null,
                'due_day' => $today,
                'custom_tab_id' => 2,
                'custom_tab_name' => 'Tab',
                'item_category_id' => 3,
                'item_category_name' => 'Cat',
                'item_category_icon' => 'home',
            ]),
            $this->planEntryRow([
                'id' => 3,
                'status' => 'pending',
                'kind' => 'expense',
                'category' => 'Casa',
                'suggested_amount_brl' => 20,
                'recurring_item_id' => 8,
                'due_day' => $today,
            ]),
            $this->planEntryRow([
                'id' => 4,
                'status' => 'pending',
                'kind' => 'expense',
                'category' => 'Transporte',
                'suggested_amount_brl' => 30,
                'recurring_item_id' => 9,
                'due_day' => max(1, $today - 1),
            ]),
            $this->planEntryRow([
                'id' => 5,
                'status' => 'pending',
                'kind' => 'expense',
                'category' => 'Lazer',
                'suggested_amount_brl' => 15,
                'recurring_item_id' => 10,
                'due_day' => min(28, $today + 1),
            ]),
        ]));

        $forecastList = $this->stmt(fn ($s) => $s->method('fetch')->willReturnOnConsecutiveCalls(
            [
                'id' => 99,
                'kind' => 'expense',
                'name' => 'Futuro',
                'category' => 'Casa',
                'due_day' => min(28, $today + 5),
                'currency' => 'BRL',
                'amount_original' => 55,
                'default_amount_brl' => 55,
                'is_installment' => 0,
                'start_date' => null,
                'end_date' => null,
                'amount_brl' => 55,
            ],
            false
        ));
        $existing = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use (
            $dueList,
            $owner,
            $insert,
            $entries,
            $forecastList,
            $existing
        ) {
            if (str_contains($sql, 'FROM recurring_items r')
                && str_contains($sql, 'LEFT JOIN recurring_item_amounts')
                && str_contains($sql, 'r.is_fixed = 1')
                && !str_contains($sql, 'SELECT r.id, r.kind')) {
                return $dueList;
            }
            if (str_contains($sql, 'created_by_user_id')) {
                return $owner;
            }
            if (str_starts_with(ltrim($sql), 'INSERT INTO month_plan_entries')) {
                return $insert;
            }
            if (str_contains($sql, 'FROM month_plan_entries e')) {
                return $entries;
            }
            if (str_contains($sql, 'SELECT r.id, r.kind, r.name')) {
                return $forecastList;
            }
            if (str_contains($sql, 'SELECT recurring_item_id FROM month_plan_entries')) {
                return $existing;
            }

            return $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        });

        $plan = MonthPlanService::getPlan($pdo, 1, $y, $m);
        $this->assertNotEmpty($plan['sections']['completed']);
        $this->assertNotEmpty($plan['sections']['variable']);
        $this->assertArrayHasKey('forecast', $plan);
        $this->assertNotEmpty($plan['insights']['topExpenseCategories']);
        $this->assertNotSame('', $plan['insights']['message']);
    }

    public function testFindEntryForTransactionViaNotesMirror(): void
    {
        $direct = $this->stmt(fn ($s) => $s->method('fetch')->willReturnOnConsecutiveCalls(
            false,
            [
                'id' => 44,
                'transaction_id' => 88,
            ]
        ));
        $tx = $this->stmt(fn ($s) => $s->method('fetch')->willReturn([
            'id' => 99,
            'notes' => 'Espelho (#88)',
        ]));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($direct, $tx);

        $entry = MonthPlanService::findEntryForTransaction($pdo, 1, 99);
        $this->assertNotNull($entry);
        $this->assertSame(44, $entry['id']);
    }

    public function testRecurringTotalsWithOverrideAndMonthlyFromRecurringItems(): void
    {
        $items = [
            [
                'id' => 1,
                'kind' => 'expense',
                'currency' => 'BRL',
                'amount_original' => 40,
                'default_amount_brl' => 40,
                'is_installment' => 0,
                'start_date' => null,
                'end_date' => null,
            ],
            [
                'id' => 2,
                'kind' => 'income',
                'currency' => 'BRL',
                'amount_original' => null,
                'default_amount_brl' => 900,
                'is_installment' => 0,
                'start_date' => null,
                'end_date' => null,
            ],
            [
                'id' => 3,
                'kind' => 'transfer',
                'currency' => 'BRL',
                'amount_original' => 10,
                'default_amount_brl' => 10,
                'is_installment' => 0,
                'start_date' => null,
                'end_date' => null,
            ],
        ];

        $list = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn($items));
        $amt = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturnOnConsecutiveCalls('70', false));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($list, $amt) {
            if (str_contains($sql, 'FROM recurring_items') && !str_contains($sql, 'amounts')) {
                return $list;
            }

            return $amt;
        });

        $t = ProjectionService::recurringTotalsForMonth($pdo, 1, 2099, 3);
        $this->assertSame(70.0, $t['expense']);
        $this->assertSame(900.0, $t['income']);

        $amtMonth = $this->stmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturnOnConsecutiveCalls(
                ['month' => 3, 'amount_brl' => 25],
                false,
                false,
                false
            );
        });
        $pdo2 = $this->createMock(PDO::class);
        $pdo2->method('prepare')->willReturnCallback(function (string $sql) use ($list, $amtMonth) {
            if (str_contains($sql, 'FROM recurring_items')) {
                return $list;
            }

            return $amtMonth;
        });

        $byMonth = ProjectionService::monthlyTotalsFromRecurring($pdo2, 1, 2099);
        $this->assertGreaterThan(0, $byMonth[3]['expense']);
        $this->assertGreaterThan(0, $byMonth[1]['income']);
    }

    public function testFlatGoalsTotalForMonthWithActiveGoal(): void
    {
        $goals = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([
            [
                'id' => 1,
                'target_amount_brl' => 1200,
                'start_date' => '2099-01-01',
                'end_date' => '2099-12-31',
                'target_financial_account_id' => null,
            ],
            [
                'id' => 2,
                'target_amount_brl' => 100,
                'start_date' => '',
                'end_date' => '',
            ],
            [
                'id' => 3,
                'target_amount_brl' => 100,
                'start_date' => '2098-01-01',
                'end_date' => '2098-06-01',
            ],
        ]));
        $contrib = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('0'));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($goals, $contrib) {
            if (str_contains($sql, 'FROM financial_goals')) {
                return $goals;
            }

            return $contrib;
        });

        $total = ProjectionService::flatGoalsTotalForMonth($pdo, 1, 2099, 6);
        $this->assertGreaterThan(0, $total);
    }

    public function testMonthlyProjectedTotalsWithPlanRows(): void
    {
        $usage = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('2099-01-01 00:00:00'));
        $syncList = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $owner = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('1'));
        $insert = $this->stmt();
        $planRows = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([
            [
                'kind' => 'expense',
                'currency' => 'BRL',
                'suggested_amount' => 20,
                'suggested_amount_brl' => 20,
                'status' => 'pending',
                'financial_goal_id' => null,
            ],
        ]));
        $recurring = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([]));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use (
            $usage,
            $syncList,
            $owner,
            $insert,
            $planRows,
            $recurring
        ) {
            if (str_contains($sql, 'created_at') || str_contains($sql, 'usage')) {
                return $usage;
            }
            if (str_contains($sql, 'FROM recurring_items r')) {
                return $syncList;
            }
            if (str_contains($sql, 'created_by_user_id')) {
                return $owner;
            }
            if (str_starts_with(ltrim($sql), 'INSERT INTO month_plan_entries')) {
                return $insert;
            }
            if (str_contains($sql, 'FROM month_plan_entries')
                && str_contains($sql, 'suggested_amount')) {
                return $planRows;
            }
            if (str_contains($sql, 'FROM recurring_items')) {
                return $recurring;
            }

            return $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([]));
        });

        $byMonth = ProjectionService::monthlyProjectedTotals($pdo, 1, 2099);
        $this->assertSame(20.0, $byMonth[1]['expense']);
    }

    public function testPortfolioWithLinkedAccountAndContributionItems(): void
    {
        $settings = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('0.01'));
        $types = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([
            [
                'id' => 1,
                'name' => 'Reserva',
                'slug' => 'reserva',
                'color' => '#0f0',
                'target_monthly_brl' => 100,
                'current_balance_brl' => 50,
            ],
        ]));
        $linked = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturnOnConsecutiveCalls('7', false));
        $account = $this->stmt(fn ($s) => $s->method('fetch')->willReturn([
            'id' => 7,
            'planning_id' => 1,
            'currency' => 'BRL',
            'type' => 'investment',
            'initial_balance' => 200,
            'initial_balance_date' => '2026-01-01',
        ]));
        $fx = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('6.0'));
        $txs = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $contribItems = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([
            [
                'id' => 3,
                'currency' => 'BRL',
                'amount_original' => 100,
                'default_amount_brl' => 100,
            ],
        ]));
        $amt = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('120'));
        $info = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use (
            $settings,
            $types,
            $linked,
            $account,
            $fx,
            $txs,
            $contribItems,
            $amt
        ) {
            if (str_contains($sql, 'cdi_monthly_rate')) {
                return $settings;
            }
            if (str_contains($sql, 'FROM investment_types') && str_contains($sql, 'is_active')) {
                return $types;
            }
            if (str_contains($sql, 'DISTINCT financial_account_id')) {
                return $linked;
            }
            if (str_contains($sql, 'FROM financial_accounts')) {
                return $account;
            }
            if (str_contains($sql, 'planning_settings')) {
                return $fx;
            }
            if (str_contains($sql, 'FROM transactions')) {
                return $txs;
            }
            if (str_contains($sql, 'kind = "investment"')) {
                return $contribItems;
            }
            if (str_contains($sql, 'recurring_item_amounts')) {
                return $amt;
            }

            return $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        });

        $p = InvestmentPortfolioService::portfolio($pdo, 1, 2026, 6);
        $this->assertSame(200.0, $p['items'][0]['currentBalanceBrl']);
        $this->assertSame(120.0, $p['items'][0]['monthlyContributionBrl']);
    }

    public function testGoalCurrentAmountWithAccountAndRefreshGoals(): void
    {
        $account = $this->stmt(fn ($s) => $s->method('fetch')->willReturn([
            'id' => 4,
            'planning_id' => 1,
            'currency' => 'BRL',
            'type' => 'investment',
            'initial_balance' => 300,
            'initial_balance_date' => '2026-01-01',
        ]));
        $fx = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('6.0'));
        $txs = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $info = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($account, $fx, $txs) {
            if (str_contains($sql, 'FROM financial_accounts')) {
                return $account;
            }
            if (str_contains($sql, 'planning_settings')) {
                return $fx;
            }
            if (str_contains($sql, 'FROM transactions')) {
                return $txs;
            }

            return $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('0'));
        });

        $amount = GoalPlanService::currentAmountForGoal($pdo, 1, [
            'id' => 1,
            'target_financial_account_id' => 4,
        ], '2026-06-01');
        $this->assertSame(300.0, $amount);

        $ids = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([9]));
        $goalMissing = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $pdo2 = $this->createMock(PDO::class);
        $pdo2->method('prepare')->willReturnCallback(function (string $sql) use ($ids, $goalMissing) {
            if (str_contains($sql, 'target_financial_account_id')) {
                return $ids;
            }

            return $goalMissing;
        });
        GoalPlanService::refreshGoalsForAccount($pdo2, 1, 4);
        $this->assertTrue(true);
    }

    public function testSyncPlanEntriesUpdatesExistingPending(): void
    {
        $goal = [
            'id' => 5,
            'name' => 'Casa',
            'start_date' => '2099-02-01',
            'end_date' => '2099-02-28',
            'due_day' => 10,
            'target_amount_brl' => 600,
            'target_financial_account_id' => 2,
            'source_financial_account_id' => 1,
            'is_active' => 1,
        ];
        $goalStmt = $this->stmt(fn ($s) => $s->method('fetch')->willReturn($goal));
        $owner = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('1'));
        $insert = $this->stmt();
        $updatePending = $this->stmt();
        $updatePending->expects($this->atLeastOnce())->method('execute');
        $contrib = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('0'));
        $check = $this->stmt(fn ($s) => $s->method('fetch')->willReturn([
            'id' => 77,
            'status' => 'pending',
        ]));
        $orphans = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([
            ['id' => 88, 'year' => 2098, 'month' => 1],
        ]));
        $deleteOrphan = $this->stmt();
        $pending = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([
            ['id' => 77, 'year' => 2099, 'month' => 2],
        ]));
        $updateAmt = $this->stmt();
        $updateGoal = $this->stmt();

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use (
            $goalStmt,
            $owner,
            $insert,
            $updatePending,
            $contrib,
            $check,
            $orphans,
            $deleteOrphan,
            $pending,
            $updateAmt,
            $updateGoal
        ) {
            if (str_contains($sql, 'FROM financial_goals WHERE id = ?')) {
                return $goalStmt;
            }
            if (str_contains($sql, 'created_by_user_id')) {
                return $owner;
            }
            if (str_starts_with(ltrim($sql), 'INSERT INTO month_plan_entries')) {
                return $insert;
            }
            if (str_contains($sql, 'UPDATE month_plan_entries SET')
                && str_contains($sql, 'name = ?')) {
                return $updatePending;
            }
            if (str_contains($sql, 'COALESCE(SUM')) {
                return $contrib;
            }
            if (str_contains($sql, 'SELECT id, status FROM month_plan_entries')) {
                return $check;
            }
            if (str_contains($sql, 'SELECT id, year, month FROM month_plan_entries')) {
                static $n = 0;
                $n++;

                return $n === 1 ? $orphans : $pending;
            }
            if (str_starts_with(ltrim($sql), 'DELETE FROM month_plan_entries')) {
                return $deleteOrphan;
            }
            if (str_contains($sql, 'SET suggested_amount_brl')) {
                return $updateAmt;
            }
            if (str_contains($sql, 'UPDATE financial_goals SET current_amount_brl')) {
                return $updateGoal;
            }

            return $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('0'));
        });

        GoalPlanService::syncPlanEntries($pdo, 1, 5);
        $this->assertTrue(true);
    }

    public function testPlannedAmountAtDateMidRange(): void
    {
        $contrib = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('100'));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($contrib);

        $amount = GoalPlanService::plannedAmountAtDate($pdo, 1, [
            'id' => 1,
            'target_amount_brl' => 1300,
            'start_date' => '2026-01-01',
            'end_date' => '2026-12-31',
        ], '2026-06-15');
        $this->assertGreaterThan(100, $amount);
        $this->assertLessThan(1300, $amount);
    }

    public function testFutureInstallmentsCommittedWithItem(): void
    {
        $y = (int) date('Y');
        $m = (int) date('n');
        $endM = $m === 12 ? 1 : $m + 1;
        $endY = $m === 12 ? $y + 1 : $y;
        $start = sprintf('%04d-%02d-01', $y, $m);
        $end = sprintf('%04d-%02d-01', $endY, $endM);

        $list = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([
            [
                'id' => 3,
                'currency' => 'BRL',
                'amount_original' => 100,
                'default_amount_brl' => 100,
                'start_date' => $start,
                'end_date' => $end,
            ],
        ]));
        $confirmed = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        $amt = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($list, $confirmed, $amt) {
            if (str_contains($sql, 'is_installment = 1')) {
                return $list;
            }
            if (str_contains($sql, "status = 'confirmed'")) {
                return $confirmed;
            }

            return $amt;
        });

        $total = AccountService::futureInstallmentsCommitted($pdo, 1, 5, 'BRL', 6.0);
        $this->assertGreaterThan(0, $total);
    }

    public function testStatementCreditWithTransactionsAndFilters(): void
    {
        $account = $this->stmt(fn ($s) => $s->method('fetch')->willReturn([
            'id' => 5,
            'planning_id' => 1,
            'currency' => 'BRL',
            'type' => 'credit',
            'initial_balance' => 0,
            'initial_balance_date' => '2026-01-01',
        ]));
        $balance = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $txs = $this->stmt(fn ($s) => $s->method('fetch')->willReturnOnConsecutiveCalls(
            [
                'id' => 1,
                'kind' => 'expense',
                'amount' => 50,
                'currency' => 'BRL',
                'amount_brl' => 50,
                'eur_to_brl' => null,
                'notes' => null,
                'transaction_date' => '2026-07-02',
                'description' => 'Compra',
                'category' => 'Mercado',
                'item_category_name' => 'Mercado',
            ],
            [
                'id' => 2,
                'kind' => 'income',
                'amount' => 20,
                'currency' => 'EUR',
                'amount_brl' => 120,
                'eur_to_brl' => 6.0,
                'notes' => null,
                'transaction_date' => '2026-07-03',
                'description' => 'Pagamento',
                'category' => 'Pagamento',
                'item_category_name' => null,
            ],
            [
                'id' => 3,
                'kind' => 'expense',
                'amount' => 10,
                'currency' => 'USD',
                'amount_brl' => 50,
                'eur_to_brl' => 5.0,
                'notes' => null,
                'transaction_date' => '2026-07-04',
                'description' => 'USD',
                'category' => 'X',
                'item_category_name' => null,
            ],
            false
        ));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($account, $balance, $txs);

        $lines = AccountService::statement(
            $pdo,
            5,
            1,
            2026,
            7,
            6.0,
            'expense',
            'Compra'
        );
        $this->assertGreaterThan(1, count($lines));
        $this->assertSame('opening', $lines[0]['kind']);
    }

    public function testMapAccountWithStatement(): void
    {
        $fx = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('6.0'));
        $txs = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $account = $this->stmt(fn ($s) => $s->method('fetch')->willReturn([
            'id' => 1,
            'planning_id' => 1,
            'currency' => 'BRL',
            'type' => 'bank',
            'initial_balance' => 10,
            'initial_balance_date' => '2026-01-01',
        ]));
        $info = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($fx, $txs, $account) {
            if (str_contains($sql, 'planning_settings')) {
                return $fx;
            }
            if (str_contains($sql, 'FROM financial_accounts')) {
                return $account;
            }
            if (str_contains($sql, 'FROM transactions')) {
                return $txs;
            }

            return $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        });

        $mapped = AccountService::mapAccount($pdo, [
            'id' => 1,
            'planning_id' => 1,
            'name' => 'Banco',
            'type' => 'bank',
            'currency' => 'BRL',
            'color' => '#000',
            'initial_balance' => 10,
            'initial_balance_date' => '2026-01-01',
            'sort_order' => 0,
            'active' => 1,
            'credit_limit' => null,
            'due_day' => null,
            'closing_day' => null,
            'created_at' => '2026-01-01',
        ], true, 2026, 7);

        $this->assertArrayHasKey('statement', $mapped);
        $this->assertNotEmpty($mapped['statement']);
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testFxRateCacheHitAndUsdResolve(): void
    {
        $info = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn(1));
        $cache = $this->stmt(fn ($s) => $s->method('fetch')->willReturn([
            'rate' => '5.1',
            'source' => 'api',
        ]));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturn($cache);

        $eur = FxRateService::resolveEurToBrl($pdo, 1, '2026-01-15');
        $this->assertSame(5.1, $eur['rate']);
        $this->assertSame('api', $eur['source']);

        $usd = FxRateService::resolveUsdToBrl($pdo, 1, '2026-01-15');
        $this->assertSame(5.1, $usd['rate']);
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testMoneyHelperParseInputForeignCurrencies(): void
    {
        require __DIR__ . '/fixtures/fx_curl_stub.php';

        $info = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        $settings = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturnOnConsecutiveCalls('6.2', '5.0'));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturn($settings);

        $eur = MoneyHelper::parseInput($pdo, 1, [
            'currency' => 'EUR',
            'amount' => 10,
            'transactionDate' => '2020-01-01',
        ]);
        $this->assertSame('EUR', $eur['currency']);
        $this->assertSame(62.0, $eur['amountBrl']);
        $this->assertSame('fallback', $eur['fxSource']);

        $usd = MoneyHelper::parseInput($pdo, 1, [
            'currency' => 'USD',
            'suggestedAmount' => 8,
            'date' => '2020-01-01',
        ]);
        $this->assertSame('USD', $usd['currency']);
        $this->assertSame(40.0, $usd['amountBrl']);

        $brl = MoneyHelper::parseInput($pdo, 1, [
            'currency' => 'BRL',
            'defaultAmountBrl' => 12.5,
        ]);
        $this->assertSame(12.5, $brl['amount']);
    }

    public function testResponsibleUserMigrateTextToUserIds(): void
    {
        $col = $this->stmt(fn ($s) => $s->method('fetch')->willReturnOnConsecutiveCalls([1], [1], false, [1]));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($col);
        $pdo->expects($this->exactly(3))->method('exec');

        ResponsibleUser::migrateTextToUserIds($pdo);
        $this->assertTrue(true);
    }

    public function testApplyTxToBalanceCreditIncomeBranch(): void
    {
        $this->assertSame(
            30.0,
            AccountService::applyTxToBalance(50.0, ['kind' => 'income'], 20.0, true)
        );
        $this->assertSame(
            50.0,
            AccountService::applyTxToBalance(50.0, ['kind' => 'other'], 20.0, true)
        );
    }

    public function testRevertConfirmationWithGoalRecalc(): void
    {
        $primary = $this->stmt(fn ($s) => $s->method('fetch')->willReturn([
            'id' => 50,
            'account_id' => 3,
            'notes' => null,
        ]));
        $mirrors = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([]));
        $delete = $this->stmt();
        $update = $this->stmt();
        $goal = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($primary, $mirrors, $delete, $update, $goal);

        $accounts = MonthPlanService::revertConfirmation($pdo, 1, [
            'id' => 8,
            'status' => 'confirmed',
            'transaction_id' => 50,
            'financial_goal_id' => 9,
        ]);
        $this->assertContains(3, $accounts);
    }

    public function testSyncAllFixedSkipsInstallmentOutsideWindow(): void
    {
        $row = [
            'id' => 1,
            'kind' => 'expense',
            'name' => 'Parcelado',
            'category' => 'Casa',
            'region' => 'geral',
            'responsible' => 'Conjunto',
            'responsible_user_id' => null,
            'due_day' => 1,
            'investment_type_id' => null,
            'financial_account_id' => null,
            'source_financial_account_id' => null,
            'custom_tab_id' => null,
            'item_category_id' => null,
            'currency' => 'BRL',
            'amount_brl' => 50,
            'amount_original' => 50,
            'is_installment' => 1,
            'start_date' => '2020-01-01',
            'end_date' => '2020-06-01',
            'default_amount_brl' => 50,
        ];
        $list = $this->stmt(fn ($s) => $s->method('fetch')->willReturnOnConsecutiveCalls($row, false));
        $owner = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('1'));
        $insert = $this->stmt();
        $insert->expects($this->never())->method('execute');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($list, $owner, $insert);

        MonthPlanService::syncAllFixedForMonth($pdo, 1, 2099, 1);
        $this->assertTrue(true);
    }

    public function testGetPlanFutureMonthPutsPendingInUpcoming(): void
    {
        $entries = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([
            $this->planEntryRow([
                'id' => 1,
                'status' => 'pending',
                'recurring_item_id' => 5,
                'due_day' => 10,
                'suggested_amount_brl' => 25,
            ]),
        ]));
        $forecast = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $existing = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($entries, $forecast, $existing);

        $plan = MonthPlanService::getPlan($pdo, 1, 2099, 5);
        $this->assertNotEmpty($plan['sections']['upcoming']);
        $this->assertNull($plan['todayDay']);
    }

    public function testPortfolioLinkedAccountMissingFallsBackToStored(): void
    {
        $settings = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('0.01'));
        $types = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([
            [
                'id' => 1,
                'name' => 'Reserva',
                'slug' => 'reserva',
                'color' => '#0f0',
                'target_monthly_brl' => 10,
                'current_balance_brl' => 75,
            ],
        ]));
        $linked = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturnOnConsecutiveCalls('9', false));
        $missing = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $contrib = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([]));
        $target = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('10'));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use (
            $settings,
            $types,
            $linked,
            $missing,
            $contrib,
            $target
        ) {
            if (str_contains($sql, 'cdi_monthly_rate')) {
                return $settings;
            }
            if (str_contains($sql, 'FROM investment_types') && str_contains($sql, 'is_active')) {
                return $types;
            }
            if (str_contains($sql, 'DISTINCT financial_account_id')) {
                return $linked;
            }
            if (str_contains($sql, 'FROM financial_accounts')) {
                return $missing;
            }
            if (str_contains($sql, 'kind = "investment"')) {
                return $contrib;
            }
            if (str_contains($sql, 'target_monthly_brl')) {
                return $target;
            }

            return $this->stmt();
        });

        $p = InvestmentPortfolioService::portfolio($pdo, 1, 2026, 6);
        $this->assertSame(75.0, $p['items'][0]['currentBalanceBrl']);
    }

    public function testFutureInstallmentsSkipsEmptyDates(): void
    {
        $list = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([
            [
                'id' => 1,
                'currency' => 'BRL',
                'amount_original' => 10,
                'default_amount_brl' => 10,
                'start_date' => '',
                'end_date' => '',
            ],
        ]));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($list);

        $this->assertSame(0.0, AccountService::futureInstallmentsCommitted($pdo, 1, 5, 'BRL', 6.0));
    }

    public function testMonthlyProjectedTotalsSkipsBeforeUsage(): void
    {
        $usage = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('2099-06-01 00:00:00'));
        $empty = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([]));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($usage, $empty) {
            if (str_contains($sql, 'created_at')) {
                return $usage;
            }

            return $empty;
        });

        $byMonth = ProjectionService::monthlyProjectedTotals($pdo, 1, 2099);
        $this->assertSame(0.0, $byMonth[1]['expense']);
        $this->assertSame(0.0, $byMonth[5]['income']);
    }

    public function testContributionWithoutOverrideUsesDefault(): void
    {
        $settings = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('0.01'));
        $types = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([
            [
                'id' => 1,
                'name' => 'Reserva',
                'slug' => 'reserva',
                'color' => '#0f0',
                'target_monthly_brl' => 100,
                'current_balance_brl' => 0,
            ],
        ]));
        $linked = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        $contribItems = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([
            [
                'id' => 3,
                'currency' => 'BRL',
                'amount_original' => null,
                'default_amount_brl' => 45,
            ],
        ]));
        $amt = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use (
            $settings,
            $types,
            $linked,
            $contribItems,
            $amt
        ) {
            if (str_contains($sql, 'cdi_monthly_rate')) {
                return $settings;
            }
            if (str_contains($sql, 'FROM investment_types') && str_contains($sql, 'is_active')) {
                return $types;
            }
            if (str_contains($sql, 'DISTINCT financial_account_id')) {
                return $linked;
            }
            if (str_contains($sql, 'kind = "investment"')) {
                return $contribItems;
            }
            if (str_contains($sql, 'recurring_item_amounts')) {
                return $amt;
            }

            return $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        });

        $p = InvestmentPortfolioService::portfolio($pdo, 1, 2026, 6);
        $this->assertSame(45.0, $p['items'][0]['monthlyContributionBrl']);
    }
}
