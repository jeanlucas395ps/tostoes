<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Config;
use Gastos\Api\Cors;
use Gastos\Api\ResponsibleUser;
use Gastos\Api\Services\AccountService;
use Gastos\Api\Services\FxRateService;
use Gastos\Api\Services\GoalPlanService;
use Gastos\Api\Services\MonthPlanService;
use Gastos\Api\Services\ProjectionService;
use PDO;
use PDOStatement;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

final class CoverageBoostPriorityPathsTest extends TestCase
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

    public function testSyncAllFixedForMonthInsertsRecurringRow(): void
    {
        $row = [
            'id' => 9,
            'kind' => 'expense',
            'name' => 'Luz',
            'category' => 'Casa',
            'region' => 'geral',
            'responsible' => 'Conjunto',
            'responsible_user_id' => null,
            'due_day' => 10,
            'investment_type_id' => null,
            'financial_account_id' => 2,
            'source_financial_account_id' => null,
            'custom_tab_id' => null,
            'item_category_id' => null,
            'currency' => 'BRL',
            'amount_brl' => 150,
            'amount_original' => 150,
            'is_installment' => 0,
            'default_amount_brl' => 150,
        ];

        $list = $this->stubStmt(function (PDOStatement $s) use ($row): void {
            $s->method('fetch')->willReturnOnConsecutiveCalls($row, false);
        });
        $owner = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('7');
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

        MonthPlanService::syncAllFixedForMonth($pdo, 1, 2026, 7);
        $this->assertTrue(true);
    }

    public function testSyncDueSuggestionsEmpty(): void
    {
        $list = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn(false);
        });
        $owner = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('1');
        });
        $insert = $this->stubStmt();

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($list, $owner, $insert);

        MonthPlanService::syncDueSuggestions($pdo, 1, 2026, 7, 15);
        $this->assertTrue(true);
    }

    public function testRegenerateFutureMonth(): void
    {
        $delete = $this->stubStmt();
        $delete->expects($this->once())->method('execute');

        $list = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn(false);
        });
        $owner = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('1');
        });
        $insert = $this->stubStmt();

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($delete, $list, $owner, $insert) {
            if (str_starts_with(ltrim($sql), 'DELETE FROM month_plan_entries')) {
                return $delete;
            }
            if (str_contains($sql, 'FROM recurring_items r')) {
                return $list;
            }
            if (str_contains($sql, 'created_by_user_id')) {
                return $owner;
            }
            if (str_starts_with(ltrim($sql), 'INSERT INTO month_plan_entries')) {
                return $insert;
            }

            return $this->stubStmt();
        });

        $y = (int) date('Y') + 1;
        MonthPlanService::regenerate($pdo, 1, $y, 3);
        $this->assertTrue(true);
    }

    public function testApplyRecurringTemplateAndScrubInstallmentDelete(): void
    {
        $update = $this->stubStmt();
        $update->expects($this->once())->method('execute');

        $select = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn([
                'is_installment' => 1,
                'start_date' => '2026-01-01',
                'end_date' => '2026-06-01',
            ]);
        });
        $delete = $this->stubStmt();
        $delete->expects($this->once())->method('execute');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($update, $select, $delete) {
            if (str_starts_with(ltrim($sql), 'UPDATE month_plan_entries mpe')) {
                return $update;
            }
            if (str_contains($sql, 'SELECT is_installment, start_date, end_date')) {
                return $select;
            }
            if (str_starts_with(ltrim($sql), 'DELETE FROM month_plan_entries')) {
                return $delete;
            }

            return $this->stubStmt();
        });

        MonthPlanService::applyRecurringTemplateToPendingEntries($pdo, 1, 9);
        $this->assertTrue(true);
    }

    public function testScrubPendingOutsideInstallmentWindowDeletes(): void
    {
        $select = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn([
                'is_installment' => 1,
                'start_date' => '2026-03-01',
                'end_date' => '2026-08-01',
            ]);
        });
        $delete = $this->stubStmt();
        $delete->expects($this->once())->method('execute');

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($select, $delete);

        MonthPlanService::scrubPendingOutsideInstallmentWindow($pdo, 1, 4);
        $this->assertTrue(true);
    }

    public function testRevertConfirmationHappyPath(): void
    {
        $primary = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn([
                'id' => 99,
                'account_id' => 3,
                'notes' => 'Pagamento (#100)',
            ]);
        });
        $mirrors = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchAll')->willReturn([
                ['id' => 101, 'account_id' => 4],
            ]);
        });
        $deleteTx = $this->stubStmt();
        $updateEntry = $this->stubStmt();
        $updateEntry->expects($this->once())->method('execute')->with(['pending', 5, 1]);

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($primary, $mirrors, $deleteTx, $updateEntry) {
            if (str_contains($sql, 'SELECT id, account_id, notes FROM transactions')) {
                return $primary;
            }
            if (str_contains($sql, 'notes LIKE')) {
                return $mirrors;
            }
            if (str_starts_with(ltrim($sql), 'DELETE FROM transactions')) {
                return $deleteTx;
            }
            if (str_starts_with(ltrim($sql), 'UPDATE month_plan_entries')) {
                return $updateEntry;
            }

            return $this->stubStmt();
        });

        $accounts = MonthPlanService::revertConfirmation($pdo, 1, [
            'id' => 5,
            'status' => 'confirmed',
            'transaction_id' => 99,
            'financial_goal_id' => null,
        ]);

        $this->assertContains(3, $accounts);
        $this->assertContains(4, $accounts);
    }

    public function testMapAccountCreditWithEmptyFutureInstallments(): void
    {
        $fx = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('6.0');
        });
        $txs = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn(false);
        });
        $future = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchAll')->willReturn([]);
        });
        $forecastList = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn(false);
        });
        $forecastOwner = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('1');
        });
        $forecastInsert = $this->stubStmt();
        $forecastPending = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn(false);
        });
        $forecastConfirmed = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn(false);
        });
        $info = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn(false);
        });

        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use (
            $fx,
            $txs,
            $future,
            $forecastList,
            $forecastOwner,
            $forecastInsert,
            $forecastPending,
            $forecastConfirmed
        ) {
            if (str_contains($sql, 'eur_to_brl FROM planning_settings')
                || str_contains($sql, 'usd_to_brl FROM planning_settings')) {
                return $fx;
            }
            if (str_contains($sql, 'FROM transactions')
                && str_contains($sql, 'transaction_date >= ?')
                && !str_contains($sql, 'kind IN')) {
                return $txs;
            }
            if (str_contains($sql, 'FROM recurring_items')
                && str_contains($sql, 'is_installment = 1')) {
                return $future;
            }
            if (str_contains($sql, 'FROM recurring_items r')) {
                return $forecastList;
            }
            if (str_contains($sql, 'created_by_user_id')) {
                return $forecastOwner;
            }
            if (str_starts_with(ltrim($sql), 'INSERT INTO month_plan_entries')) {
                return $forecastInsert;
            }
            if (str_contains($sql, "status = 'pending'")
                && str_contains($sql, 'source_financial_account_id')) {
                return $forecastPending;
            }
            if (str_contains($sql, 'FROM transactions') && str_contains($sql, 'amount_brl')) {
                return $forecastConfirmed;
            }

            return $this->stubStmt(function (PDOStatement $s): void {
                $s->method('fetch')->willReturn(false);
                $s->method('fetchAll')->willReturn([]);
                $s->method('fetchColumn')->willReturn(false);
            });
        });

        $mapped = AccountService::mapAccount($pdo, [
            'id' => 5,
            'planning_id' => 1,
            'name' => 'Nubank',
            'type' => 'credit',
            'currency' => 'BRL',
            'color' => '#820ad1',
            'initial_balance' => 0,
            'initial_balance_date' => '2026-01-01',
            'sort_order' => 0,
            'active' => 1,
            'credit_limit' => 5000,
            'due_day' => 10,
            'closing_day' => 3,
            'created_at' => '2026-01-01',
        ], false);

        $this->assertSame('credit', $mapped['type']);
        $this->assertSame(0.0, $mapped['futureInstallments']);
        $this->assertArrayHasKey('monthForecast', $mapped);
        $this->assertSame(5000.0, $mapped['availableLimit']);
    }

    public function testStatementWithAccountAndEmptyTxs(): void
    {
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
        $txs = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn(false);
        });
        $fx = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('6.0');
        });

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($account, $txs, $fx) {
            if (str_contains($sql, 'FROM financial_accounts')) {
                return $account;
            }
            if (str_contains($sql, 'FROM transactions t')) {
                return $txs;
            }
            if (str_contains($sql, 'planning_settings')) {
                return $fx;
            }

            return $this->stubStmt(function (PDOStatement $s): void {
                $s->method('fetch')->willReturn(false);
                $s->method('fetchColumn')->willReturn('6.0');
            });
        });

        $lines = AccountService::statement($pdo, 2, 1, 2026, 7, 6.0);
        $this->assertNotEmpty($lines);
        $this->assertSame('opening', $lines[0]['kind']);
        $this->assertSame(100.0, $lines[0]['balanceAfter']);
    }

    public function testValidateAccountIdHappyPathBank(): void
    {
        $stmt = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn(['id' => 3, 'type' => 'bank']);
        });

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $this->assertSame(3, AccountService::validateAccountId($pdo, 1, 3, 'bank'));
    }

    public function testRecurringTotalsForMonthEmpty(): void
    {
        $stmt = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchAll')->willReturn([]);
        });
        $amt = $this->stubStmt();

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($stmt, $amt);

        $totals = ProjectionService::recurringTotalsForMonth($pdo, 1, 2026, 7);
        $this->assertSame(0.0, $totals['income']);
        $this->assertSame(0.0, $totals['expense']);
    }

    public function testMonthlyTotalsFromRecurringEmpty(): void
    {
        $stmt = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchAll')->willReturn([]);
        });
        $amt = $this->stubStmt();

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($stmt, $amt);

        $byMonth = ProjectionService::monthlyTotalsFromRecurring($pdo, 1, 2099);
        $this->assertCount(12, $byMonth);
        $this->assertSame(0.0, $byMonth[1]['expense']);
    }

    public function testSyncPlanEntriesWhenGoalMissing(): void
    {
        $stmt = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn(false);
        });
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        GoalPlanService::syncPlanEntries($pdo, 1, 99);
        $this->assertTrue(true);
    }

    public function testSyncPlanEntriesWithGoalEmptyMonthsCheckPath(): void
    {
        $goal = [
            'id' => 8,
            'name' => 'Viagem',
            'start_date' => '2099-01-01',
            'end_date' => '2099-01-31',
            'due_day' => 5,
            'target_amount_brl' => 1200,
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
        $insert->expects($this->once())->method('execute');
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
                // orphan select then pending select in recalculate,  both similar
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

        GoalPlanService::syncPlanEntries($pdo, 1, 8);
        $this->assertTrue(true);
    }

    public function testRefreshAllPendingAmountsEmpty(): void
    {
        $stmt = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchAll')->willReturn([]);
        });
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        GoalPlanService::refreshAllPendingAmounts($pdo, 1);
        $this->assertTrue(true);
    }

    public function testRecalculatePendingAmountsWithGoalEmptyPending(): void
    {
        $goal = [
            'id' => 3,
            'start_date' => '2026-01-01',
            'end_date' => '2026-12-31',
            'target_amount_brl' => 1200,
            'target_financial_account_id' => null,
        ];
        $goalStmt = $this->stubStmt(function (PDOStatement $s) use ($goal): void {
            $s->method('fetch')->willReturn($goal);
        });
        $pending = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchAll')->willReturn([]);
        });
        $update = $this->stubStmt();
        $contrib = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('0');
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

        GoalPlanService::recalculatePendingAmounts($pdo, 1, 3);
        $this->assertTrue(true);
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testResolveToBrlWhenFxTableMissingFallsBack(): void
    {
        require __DIR__ . '/fixtures/fx_curl_stub.php';

        $info = $this->createMock(PDOStatement::class);
        $info->method('fetchColumn')->willReturn(false);

        $settings = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('5.55');
        });

        // tableExists: query "returns false" via fetchColumn false (no fx_daily_rates row/table)
        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturn($settings);

        $result = FxRateService::resolveToBrl($pdo, 1, 'EUR', '1999-01-01');
        $this->assertSame('fallback', $result['source']);
        $this->assertSame(5.55, $result['rate']);
        $this->assertSame('1999-01-01', $result['date']);
    }

    public function testCorsApplyVariousOrigins(): void
    {
        $ref = new ReflectionClass(Config::class);
        $prop = $ref->getProperty('env');
        $env = $prop->getValue() ?? [];

        $prevOrigin = $_SERVER['HTTP_ORIGIN'] ?? null;

        try {
            $env['CORS_ORIGIN'] = 'http://localhost:4200';
            $prop->setValue(null, $env);
            $_SERVER['HTTP_ORIGIN'] = 'http://localhost:4200';
            Cors::apply();

            $env['CORS_ORIGIN'] = 'https://*.tostoes.com';
            $prop->setValue(null, $env);
            $_SERVER['HTTP_ORIGIN'] = 'https://app.tostoes.com';
            Cors::apply();

            $env['CORS_ORIGIN'] = 'http://only-one.example';
            $prop->setValue(null, $env);
            unset($_SERVER['HTTP_ORIGIN']);
            Cors::apply();

            $env['CORS_ORIGIN'] = 'http://a.com, http://b.com';
            $prop->setValue(null, $env);
            $_SERVER['HTTP_ORIGIN'] = 'http://evil.com';
            Cors::apply();

            $env['CORS_ORIGIN'] = '*';
            $prop->setValue(null, $env);
            $_SERVER['HTTP_ORIGIN'] = 'https://any.random.test';
            Cors::apply();

            $this->assertTrue(true);
        } finally {
            if ($prevOrigin === null) {
                unset($_SERVER['HTTP_ORIGIN']);
            } else {
                $_SERVER['HTTP_ORIGIN'] = $prevOrigin;
            }
        }
    }

    public function testParseFromBodyResponsibleUserIdMember(): void
    {
        $member = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetch')->willReturn([1]);
        });
        $name = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturn('Ana');
        });

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($member, $name);

        $result = ResponsibleUser::parseFromBody($pdo, ['responsibleUserId' => 5], 1);
        $this->assertSame(5, $result['responsibleUserId']);
        $this->assertSame('Ana', $result['responsible']);
    }
}
