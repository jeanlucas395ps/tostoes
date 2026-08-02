<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Auth;
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

final class CoverageFinal90Test extends TestCase
{
    private function stubStmt(?callable $configure = null): PDOStatement
    {
        $stmt = $this->createMock(PDOStatement::class);
        $stmt->method('execute')->willReturn(true);
        if ($configure !== null) {
            $configure($stmt);
        }

        return $stmt;
    }

    public function testSyncDueSuggestionsInsertsRow(): void
    {
        $row = [
            'id' => 11,
            'kind' => 'expense',
            'name' => 'Internet',
            'category' => 'Casa',
            'region' => 'geral',
            'responsible' => 'Conjunto',
            'responsible_user_id' => null,
            'due_day' => 5,
            'investment_type_id' => null,
            'financial_account_id' => 2,
            'source_financial_account_id' => null,
            'custom_tab_id' => null,
            'item_category_id' => null,
            'currency' => 'BRL',
            'amount_brl' => 99.9,
            'amount_original' => 99.9,
            'is_installment' => 0,
            'default_amount_brl' => 99.9,
        ];

        $list = $this->stubStmt(function (PDOStatement $s) use ($row): void {
            $s->method('fetch')->willReturnOnConsecutiveCalls($row, false);
        });
        $owner = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('3');
        });
        $insert = $this->stubStmt();
        $insert->expects($this->once())->method('execute');
        $check = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn(false);
        });

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

            return $this->stubStmt();
        });

        MonthPlanService::syncDueSuggestions($pdo, 1, 2026, 8, 15);
        $this->assertTrue(true);
    }

    public function testFindEntryForTransactionViaNotes(): void
    {
        $entryStmt = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturnOnConsecutiveCalls(
                false,
                ['id' => 7, 'planning_id' => 1, 'transaction_id' => 10]
            );
        });
        $txStmt = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn([
                'id' => 99,
                'notes' => 'Espelho (#10)',
            ]);
        });

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($entryStmt, $txStmt);

        $entry = MonthPlanService::findEntryForTransaction($pdo, 1, 99);
        $this->assertNotNull($entry);
        $this->assertSame(7, $entry['id']);
    }

    public function testDeleteLinkedTransactionsPrimaryMissing(): void
    {
        $primary = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn(false);
        });

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($primary);

        $this->assertSame([], MonthPlanService::deleteLinkedTransactions($pdo, 1, 999));
    }

    public function testSyncPlanEntriesTwoMonthsInserts(): void
    {
        $goal = [
            'id' => 12,
            'name' => 'Reserva',
            'start_date' => '2099-03-01',
            'end_date' => '2099-04-30',
            'due_day' => 10,
            'target_amount_brl' => 2000,
            'target_financial_account_id' => null,
            'source_financial_account_id' => null,
            'is_active' => 1,
        ];

        $goalStmt = $this->stubStmt(function (PDOStatement $s) use ($goal): void {
            $s->method('fetch')->willReturn($goal);
        });
        $owner = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('1');
        });
        $insert = $this->stubStmt();
        $insert->expects($this->exactly(2))->method('execute');
        $updatePending = $this->stubStmt();
        $contrib = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('0');
        });
        $check = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn(false);
        });
        $orphans = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchAll')->willReturn([]);
        });
        $pending = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchAll')->willReturn([]);
        });
        $updateAmounts = $this->stubStmt();
        $updateGoal = $this->stubStmt();

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use (
            $goalStmt,
            $owner,
            $insert,
            $updatePending,
            $contrib,
            $check,
            $orphans,
            $pending,
            $updateAmounts,
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
            if (str_contains($sql, 'SELECT id, year, month FROM month_plan_entries')
                && str_contains($sql, 'financial_goal_id')) {
                static $n = 0;
                $n++;

                return $n === 1 ? $orphans : $pending;
            }
            if (str_contains($sql, 'SET suggested_amount_brl')) {
                return $updateAmounts;
            }
            if (str_contains($sql, 'UPDATE financial_goals SET current_amount_brl')) {
                return $updateGoal;
            }

            return $this->stubStmt(function (PDOStatement $s): void {
                $s->method('fetch')->willReturn(false);
                $s->method('fetchAll')->willReturn([]);
                $s->method('fetchColumn')->willReturn('0');
            });
        });

        GoalPlanService::syncPlanEntries($pdo, 1, 12);
        $this->assertTrue(true);
    }

    public function testRecalculatePendingAmountsWithOnePending(): void
    {
        $goal = [
            'id' => 4,
            'start_date' => '2026-01-01',
            'end_date' => '2026-12-31',
            'target_amount_brl' => 1200,
            'target_financial_account_id' => null,
        ];
        $goalStmt = $this->stubStmt(function (PDOStatement $s) use ($goal): void {
            $s->method('fetch')->willReturn($goal);
        });
        $pending = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchAll')->willReturn([
                ['id' => 40, 'year' => 2026, 'month' => 8],
            ]);
        });
        $update = $this->stubStmt();
        $update->expects($this->once())->method('execute');
        $contrib = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('100');
        });
        $updateGoal = $this->stubStmt();
        $updateGoal->expects($this->once())->method('execute');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use (
            $goalStmt,
            $pending,
            $update,
            $contrib,
            $updateGoal
        ) {
            if (str_contains($sql, 'FROM financial_goals WHERE id = ?')) {
                return $goalStmt;
            }
            if (str_contains($sql, 'SELECT id, year, month FROM month_plan_entries')) {
                return $pending;
            }
            if (str_contains($sql, 'SET suggested_amount_brl')) {
                return $update;
            }
            if (str_contains($sql, 'COALESCE(SUM')) {
                return $contrib;
            }
            if (str_contains($sql, 'UPDATE financial_goals SET current_amount_brl')) {
                return $updateGoal;
            }

            return $this->stubStmt(function (PDOStatement $s): void {
                $s->method('fetchColumn')->willReturn('0');
                $s->method('fetchAll')->willReturn([]);
            });
        });

        GoalPlanService::recalculatePendingAmounts($pdo, 1, 4);
        $this->assertTrue(true);
    }

    public function testPlannedAmountAtDateMidRange(): void
    {
        $contrib = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('200');
        });
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($contrib);

        $amount = GoalPlanService::plannedAmountAtDate($pdo, 1, [
            'id' => 1,
            'target_amount_brl' => 1400,
            'start_date' => '2026-01-01',
            'end_date' => '2026-07-31',
            'target_financial_account_id' => null,
        ], '2026-04-15');

        $this->assertGreaterThan(200.0, $amount);
        $this->assertLessThan(1400.0, $amount);
    }

    public function testCurrentAmountForGoalWithAccount(): void
    {
        $account = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn([
                'id' => 5,
                'planning_id' => 1,
                'currency' => 'BRL',
                'type' => 'bank',
                'initial_balance' => 750,
                'initial_balance_date' => '2026-01-01',
            ]);
        });
        $fx = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('6.0');
        });

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($account, $fx) {
            if (str_contains($sql, 'FROM financial_accounts')) {
                return $account;
            }
            if (str_contains($sql, 'eur_to_brl') || str_contains($sql, 'usd_to_brl')) {
                return $fx;
            }

            return $this->stubStmt(function (PDOStatement $s): void {
                $s->method('fetch')->willReturn(false);
                $s->method('fetchColumn')->willReturn('6.0');
            });
        });

        $amount = GoalPlanService::currentAmountForGoal($pdo, 1, [
            'id' => 2,
            'target_financial_account_id' => 5,
        ], '2026-01-01');

        $this->assertSame(750.0, $amount);
    }

    public function testFlatGoalsTotalForMonthWithGoalInRange(): void
    {
        $goals = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchAll')->willReturn([
                [
                    'id' => 9,
                    'start_date' => '2026-01-01',
                    'end_date' => '2026-12-31',
                    'target_amount_brl' => 1200,
                    'target_financial_account_id' => null,
                ],
            ]);
        });
        $contrib = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('0');
        });

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($goals, $contrib) {
            if (str_contains($sql, 'FROM financial_goals WHERE planning_id')) {
                return $goals;
            }
            if (str_contains($sql, 'COALESCE(SUM')) {
                return $contrib;
            }

            return $this->stubStmt(function (PDOStatement $s): void {
                $s->method('fetchColumn')->willReturn('0');
                $s->method('fetchAll')->willReturn([]);
            });
        });

        $total = ProjectionService::flatGoalsTotalForMonth($pdo, 1, 2026, 8);
        $this->assertGreaterThan(0.0, $total);
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testAmountInBrlForMonthEurUsesCachedFx(): void
    {
        $info = $this->createMock(PDOStatement::class);
        $info->method('fetchColumn')->willReturn(1);

        $cache = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn([
                'rate' => '6.5',
                'source' => 'api',
            ]);
        });

        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturn($cache);

        $brl = ProjectionService::amountInBrlForMonth($pdo, 1, 2026, 8, 'EUR', 10.0, null);
        $this->assertSame(65.0, $brl);
    }

    public function testPortfolioWithLinkedBankAccount(): void
    {
        $settings = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('0.01');
        });
        $types = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchAll')->willReturn([
                [
                    'id' => 1,
                    'name' => 'Reserva',
                    'slug' => 'reserva',
                    'color' => '#0f0',
                    'target_monthly_brl' => 100,
                    'current_balance_brl' => 50,
                ],
            ]);
        });
        $linked = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturnOnConsecutiveCalls('7', false);
        });
        $account = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn([
                'id' => 7,
                'planning_id' => 1,
                'currency' => 'BRL',
                'type' => 'bank',
                'initial_balance' => 1500,
                'initial_balance_date' => '2026-01-01',
            ]);
        });
        $txs = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn(false);
        });
        $fx = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('6.0');
        });
        $contrib = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchAll')->willReturn([]);
        });
        $target = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('100');
        });

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use (
            $settings,
            $types,
            $linked,
            $account,
            $txs,
            $fx,
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
                return $account;
            }
            if (str_contains($sql, 'FROM transactions') && str_contains($sql, 'transaction_date >=')) {
                return $txs;
            }
            if (str_contains($sql, 'eur_to_brl') || str_contains($sql, 'usd_to_brl')) {
                return $fx;
            }
            if (str_contains($sql, 'kind = "investment"')) {
                return $contrib;
            }
            if (str_contains($sql, 'target_monthly_brl')) {
                return $target;
            }

            return $this->stubStmt(function (PDOStatement $s): void {
                $s->method('fetch')->willReturn(false);
                $s->method('fetchAll')->willReturn([]);
                $s->method('fetchColumn')->willReturn(false);
            });
        });

        $p = InvestmentPortfolioService::portfolio($pdo, 1, 2026, 8);
        $this->assertCount(1, $p['items']);
        $this->assertSame(1500.0, $p['items'][0]['currentBalanceBrl']);
    }

    public function testFutureInstallmentsCommittedWithRows(): void
    {
        $y = (int) date('Y');
        $m = (int) date('n');
        $start = sprintf('%04d-%02d-01', $y, $m);
        $endM = $m === 12 ? 1 : $m + 1;
        $endY = $m === 12 ? $y + 1 : $y;
        $end = sprintf('%04d-%02d-01', $endY, $endM);

        $items = $this->stubStmt(function (PDOStatement $s) use ($start, $end): void {
            $s->method('fetchAll')->willReturn([
                [
                    'id' => 3,
                    'currency' => 'BRL',
                    'amount_original' => 200,
                    'default_amount_brl' => 200,
                    'start_date' => $start,
                    'end_date' => $end,
                ],
            ]);
        });
        $confirmed = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn(false);
        });
        $amount = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn(false);
        });

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($items, $confirmed, $amount) {
            if (str_contains($sql, 'is_installment = 1')) {
                return $items;
            }
            if (str_contains($sql, "status = 'confirmed'")) {
                return $confirmed;
            }
            if (str_contains($sql, 'FROM recurring_item_amounts')) {
                return $amount;
            }

            return $this->stubStmt();
        });

        $total = AccountService::futureInstallmentsCommitted($pdo, 1, 5, 'BRL', 6.0);
        $this->assertSame(400.0, $total);
    }

    public function testCreditMonthForecastWithPendingRows(): void
    {
        $pending = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturnOnConsecutiveCalls(
                [
                    'currency' => 'BRL',
                    'suggested_amount' => 80,
                    'suggested_amount_brl' => 80,
                ],
                false
            );
        });
        $confirmed = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturnOnConsecutiveCalls('20', false);
        });

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($pending, $confirmed) {
            if (str_contains($sql, "status = 'pending'")
                && str_contains($sql, 'source_financial_account_id')) {
                return $pending;
            }
            if (str_contains($sql, 'FROM transactions') && str_contains($sql, 'amount_brl')) {
                return $confirmed;
            }

            return $this->stubStmt(function (PDOStatement $s): void {
                $s->method('fetch')->willReturn(false);
                $s->method('fetchAll')->willReturn([]);
                $s->method('fetchColumn')->willReturn(false);
            });
        });

        $forecast = AccountService::creditMonthForecast($pdo, 1, 5, 2020, 5, 6.0);
        $this->assertSame(80.0, $forecast['pendingBrl']);
        $this->assertSame(20.0, $forecast['confirmedBrl']);
        $this->assertSame(100.0, $forecast['totalBrl']);
    }

    public function testMapAccountBankWithStatement(): void
    {
        $fx = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('6.0');
        });
        $txsBalance = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn(false);
        });
        $account = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn([
                'id' => 2,
                'planning_id' => 1,
                'currency' => 'BRL',
                'type' => 'bank',
                'initial_balance' => 100,
                'initial_balance_date' => '2026-01-01',
            ]);
        });
        $txsStatement = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn(false);
        });
        $info = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn(false);
        });

        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use (
            $fx,
            $txsBalance,
            $account,
            $txsStatement
        ) {
            if (str_contains($sql, 'eur_to_brl FROM planning_settings')
                || str_contains($sql, 'usd_to_brl FROM planning_settings')) {
                return $fx;
            }
            if (str_contains($sql, 'FROM financial_accounts')) {
                return $account;
            }
            if (str_contains($sql, 'FROM transactions t')) {
                return $txsStatement;
            }
            if (str_contains($sql, 'FROM transactions')
                && str_contains($sql, 'transaction_date >=')) {
                return $txsBalance;
            }

            return $this->stubStmt(function (PDOStatement $s): void {
                $s->method('fetch')->willReturn(false);
                $s->method('fetchAll')->willReturn([]);
                $s->method('fetchColumn')->willReturn('6.0');
            });
        });

        $mapped = AccountService::mapAccount($pdo, [
            'id' => 2,
            'planning_id' => 1,
            'name' => 'Banco',
            'type' => 'bank',
            'currency' => 'BRL',
            'color' => '#000',
            'initial_balance' => 100,
            'initial_balance_date' => '2026-01-01',
            'sort_order' => 0,
            'active' => 1,
            'credit_limit' => null,
            'due_day' => null,
            'closing_day' => null,
            'created_at' => '2026-01-01',
        ], true, 2026, 1);

        $this->assertArrayHasKey('statement', $mapped);
        $this->assertNotEmpty($mapped['statement']);
        $this->assertSame('opening', $mapped['statement'][0]['kind']);
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testMoneyHelperParseInputEur(): void
    {
        $info = $this->createMock(PDOStatement::class);
        $info->method('fetchColumn')->willReturn(1);

        $cache = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn([
                'rate' => '6.0',
                'source' => 'api',
            ]);
        });

        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturn($cache);

        $result = MoneyHelper::parseInput($pdo, 1, [
            'currency' => 'EUR',
            'amount' => 25,
            'transactionDate' => '2026-06-15',
        ]);

        $this->assertSame('EUR', $result['currency']);
        $this->assertSame(25.0, $result['amount']);
        $this->assertSame(150.0, $result['amountBrl']);
        $this->assertSame(6.0, $result['eurToBrl']);
        $this->assertSame('api', $result['fxSource']);
        $this->assertSame('2026-06-15', $result['fxDate']);
    }

    public function testPlanningIdHeaderNegativeAndEmptyQuery(): void
    {
        unset($_SERVER['HTTP_X_PLANNING_ID'], $_GET['planningId']);
        $_GET['planningId'] = '-3';
        $this->assertNull(Auth::planningIdHeader());

        $_GET['planningId'] = '';
        $this->assertNull(Auth::planningIdHeader());

        $_SERVER['HTTP_X_PLANNING_ID'] = 'abc';
        unset($_GET['planningId']);
        $this->assertNull(Auth::planningIdHeader());
    }

    public function testMigrateTextToUserIdsWhenColumnsMissing(): void
    {
        $col = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn(false);
        });

        $pdo = $this->createMock(PDO::class);
        $pdo->expects($this->exactly(4))->method('prepare')->willReturn($col);
        $pdo->expects($this->never())->method('exec');

        ResponsibleUser::migrateTextToUserIds($pdo);
        $this->assertTrue(true);
    }
}
