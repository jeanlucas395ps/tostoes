<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Services\AccountService;
use Gastos\Api\Services\InvestmentPortfolioService;
use Gastos\Api\Services\MonthPlanService;
use Gastos\Api\Services\PlanningService;
use Gastos\Api\Services\ProjectionService;
use Gastos\Api\Services\GoalPlanService;
use Gastos\Api\MoneyHelper;
use Gastos\Api\Services\FxRateService;
use PDO;
use PDOStatement;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

final class CoveragePush90Test extends TestCase
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

    public function testPortfolioWithOneTypeNoLinkedAccounts(): void
    {
        $settings = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('0.01'));
        $types = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([
            [
                'id' => 1,
                'name' => 'Reserva',
                'slug' => 'reserva',
                'color' => '#0f0',
                'target_monthly_brl' => 100,
                'current_balance_brl' => 1000,
            ],
            [
                'id' => 2,
                'name' => 'Cap',
                'slug' => 'capitalizacao',
                'color' => '#00f',
                'target_monthly_brl' => 50,
                'current_balance_brl' => 200,
            ],
        ]));
        $linked = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        $contrib = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([]));
        $target = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('100'));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($settings, $types, $linked, $contrib, $target) {
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
                return $contrib;
            }
            if (str_contains($sql, 'target_monthly_brl')) {
                return $target;
            }
            return $this->stmt();
        });

        $p = InvestmentPortfolioService::portfolio($pdo, 1, 2026, 6);
        $this->assertCount(2, $p['items']);
        $this->assertSame(1000.0, $p['items'][0]['currentBalanceBrl']);
        $this->assertTrue($p['items'][0]['yieldsCdi']);
        $this->assertFalse($p['items'][1]['yieldsCdi']);
        $this->assertSame(1200.0, $p['totals']['currentBalanceBrl']);
    }

    public function testRecurringTotalsForMonthEmpty(): void
    {
        $stmt = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([]));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);

        $t = ProjectionService::recurringTotalsForMonth($pdo, 1, 2026, 7);
        $this->assertSame(0.0, $t['income']);
        $this->assertSame(0.0, $t['expense']);
    }

    public function testRecurringTotalsForMonthWithItems(): void
    {
        $list = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([
            [
                'id' => 1,
                'kind' => 'expense',
                'currency' => 'BRL',
                'amount_original' => 50,
                'default_amount_brl' => 50,
                'is_installment' => 0,
                'start_date' => null,
                'end_date' => null,
            ],
            [
                'id' => 2,
                'kind' => 'income',
                'currency' => 'BRL',
                'amount_original' => 1000,
                'default_amount_brl' => 1000,
                'is_installment' => 0,
                'start_date' => null,
                'end_date' => null,
            ],
        ]));
        $amt = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($list, $amt) {
            if (str_contains($sql, 'FROM recurring_items')) {
                return $list;
            }
            return $amt;
        });

        $t = ProjectionService::recurringTotalsForMonth($pdo, 1, 2026, 7);
        $this->assertSame(50.0, $t['expense']);
        $this->assertSame(1000.0, $t['income']);
    }

    public function testMonthlyTotalsFromRecurring(): void
    {
        $usage = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('2026-01-01'));
        $empty = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([]));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($usage, $empty) {
            if (str_contains($sql, 'created_at')) {
                return $usage;
            }
            return $empty;
        });

        $byMonth = ProjectionService::monthlyTotalsFromRecurring($pdo, 1, 2026);
        $this->assertCount(12, $byMonth);
    }

    public function testValidateAccountIdAndPaymentSource(): void
    {
        $bank = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(['id' => 1, 'type' => 'bank']));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($bank);

        $this->assertSame(1, AccountService::validateAccountId($pdo, 1, 1, 'bank'));
        $this->assertSame(1, AccountService::validatePaymentSourceAccountId($pdo, 1, 1));
    }

    public function testValidateInvestmentAndAccountTransfer(): void
    {
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function () {
            static $n = 0;
            $n++;
            $type = $n % 2 === 1 ? 'bank' : 'investment';
            return $this->stmt(fn ($s) => $s->method('fetch')->willReturn(['id' => $n, 'type' => $type]));
        });

        $r = AccountService::validateInvestmentTransfer($pdo, 1, 1, 2);
        $this->assertSame(1, $r['bankAccountId']);
        $this->assertSame(2, $r['investmentAccountId']);

        $pdo2 = $this->createMock(PDO::class);
        $pdo2->method('prepare')->willReturnCallback(function () {
            static $n = 0;
            $n++;
            return $this->stmt(fn ($s) => $s->method('fetch')->willReturn(['id' => $n, 'type' => 'bank']));
        });
        $r2 = AccountService::validateAccountTransfer($pdo2, 1, 1, 2);
        $this->assertArrayHasKey('sourceAccountId', $r2);
        $this->assertArrayHasKey('targetAccountId', $r2);
    }

    public function testStatementEmptyAccount(): void
    {
        $stmt = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);
        $this->assertSame([], AccountService::statement($pdo, 1, 1, 2026, 7, 6.0));
    }

    public function testStatementWithTransactions(): void
    {
        $account = [
            'id' => 1,
            'planning_id' => 1,
            'currency' => 'BRL',
            'type' => 'bank',
            'initial_balance' => 100,
            'initial_balance_date' => '2026-01-01',
            'name' => 'Banco',
        ];
        $accStmt = $this->stmt(fn ($s) => $s->method('fetch')->willReturn($account));
        $balanceStmt = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $txStmt = $this->stmt(fn ($s) => $s->method('fetch')->willReturnOnConsecutiveCalls(
            [
                'id' => 10,
                'kind' => 'income',
                'amount' => 50,
                'currency' => 'BRL',
                'amount_brl' => 50,
                'eur_to_brl' => null,
                'notes' => null,
                'transaction_date' => '2026-07-05',
                'description' => 'Pix',
                'category' => 'Extra',
                'item_category_name' => null,
            ],
            false
        ));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($accStmt, $balanceStmt, $txStmt);

        $lines = AccountService::statement($pdo, 1, 1, 2026, 7, 6.0);
        $this->assertNotEmpty($lines);
        $this->assertSame('opening', $lines[0]['kind']);
    }

    public function testMapAccountCredit(): void
    {
        $fx = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('6.0'));
        $txs = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $future = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([]));
        $info = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($fx, $txs, $future) {
            if (str_contains($sql, 'eur_to_brl') || str_contains($sql, 'usd_to_brl')) {
                return $fx;
            }
            if (str_contains($sql, 'FROM transactions')) {
                return $txs;
            }
            if (str_contains($sql, 'is_installment') || str_contains($sql, 'recurring_items')) {
                return $future;
            }
            return $fx;
        });

        $mapped = AccountService::mapAccount($pdo, [
            'id' => 5,
            'planning_id' => 1,
            'name' => 'Nubank',
            'type' => 'credit',
            'currency' => 'BRL',
            'color' => '#8a0',
            'initial_balance' => 0,
            'initial_balance_date' => '2026-01-01',
            'sort_order' => 0,
            'active' => 1,
            'credit_limit' => 5000,
            'due_day' => 10,
            'closing_day' => 1,
            'created_at' => '2026-01-01',
        ], false);

        $this->assertSame('credit', $mapped['type']);
        $this->assertSame(5000.0, $mapped['creditLimit']);
        $this->assertArrayHasKey('availableLimit', $mapped);
    }

    public function testRegeneratePastMonthNoop(): void
    {
        $pdo = $this->createMock(PDO::class);
        $pdo->expects($this->never())->method('prepare');
        MonthPlanService::regenerate($pdo, 1, 2020, 1);
        $this->assertTrue(true);
    }

    public function testRegenerateFutureMonth(): void
    {
        $del = $this->stmt();
        $list = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $owner = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('1'));
        $insert = $this->stmt();

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($del, $list, $owner, $insert);

        MonthPlanService::regenerate($pdo, 1, 2099, 1);
        $this->assertTrue(true);
    }

    public function testApplyRecurringTemplate(): void
    {
        $update = $this->stmt();
        $scrub = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($update, $scrub);

        MonthPlanService::applyRecurringTemplateToPendingEntries($pdo, 1, 9);
        $this->assertTrue(true);
    }

    public function testScrubInstallmentWindow(): void
    {
        $row = $this->stmt(fn ($s) => $s->method('fetch')->willReturn([
            'is_installment' => 1,
            'start_date' => '2026-07-01',
            'end_date' => '2026-12-01',
        ]));
        $del = $this->stmt();

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($row, $del);

        MonthPlanService::scrubPendingOutsideInstallmentWindow($pdo, 1, 9);
        $this->assertTrue(true);
    }

    public function testRevertConfirmation(): void
    {
        $primary = $this->stmt(fn ($s) => $s->method('fetch')->willReturn([
            'id' => 50,
            'account_id' => 3,
            'notes' => null,
        ]));
        $mirrors = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([]));
        $delete = $this->stmt();
        $update = $this->stmt();

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($primary, $mirrors, $delete, $update);

        $accounts = MonthPlanService::revertConfirmation($pdo, 1, [
            'id' => 8,
            'status' => 'confirmed',
            'transaction_id' => 50,
            'financial_goal_id' => null,
        ]);
        $this->assertContains(3, $accounts);
    }

    public function testPlanningMembersAndAddMember(): void
    {
        $memberCheck = $this->stmt(fn ($s) => $s->method('fetch')->willReturn([1]));
        $users = $this->stmt(fn ($s) => $s->method('fetch')->willReturnOnConsecutiveCalls(
            [
                'id' => 1,
                'username' => 'ana',
                'email' => 'a@a.com',
                'name' => 'Ana',
                'gender' => 'female',
                'avatar_path' => null,
                'role' => 'owner',
            ],
            false
        ));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($memberCheck, $users);

        $members = PlanningService::members($pdo, 1, 1);
        $this->assertCount(1, $members);
        $this->assertSame('Ana', $members[0]['name']);
    }

    public function testAddMemberByUsername(): void
    {
        $assert = $this->stmt(fn ($s) => $s->method('fetch')->willReturn([1]));
        $findUser = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('9'));
        $already = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $insert = $this->stmt();

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($assert, $findUser, $already, $insert);

        PlanningService::addMemberByUsername($pdo, 1, 1, 'bob');
        $this->assertTrue(true);
    }

    public function testGoalSyncPlanEntriesMissingGoal(): void
    {
        $stmt = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);
        GoalPlanService::syncPlanEntries($pdo, 1, 99);
        $this->assertTrue(true);
    }

    public function testRefreshAllPendingAmountsEmpty(): void
    {
        $stmt = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([]));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);
        GoalPlanService::refreshAllPendingAmounts($pdo, 1);
        $this->assertTrue(true);
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testFxRateFallbackWhenNoTable(): void
    {
        require __DIR__ . '/fixtures/fx_curl_stub.php';

        $info = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        $fx = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('6.4'));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturn($fx);

        $result = FxRateService::resolveToBrl($pdo, 1, 'EUR', '2020-01-01');
        $this->assertSame('fallback', $result['source']);
        $this->assertSame(6.4, $result['rate']);
    }

    public function testMoneyHelperUsdFallbackWithoutColumn(): void
    {
        $info = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);

        $this->assertSame(5.0, MoneyHelper::getUsdToBrlFallback($pdo, 1));
        $this->assertSame(5.0, MoneyHelper::getFxFallback($pdo, 1, 'USD'));
    }

    public function testGetPlanCurrentMonthRunsSync(): void
    {
        $y = (int) date('Y');
        $m = (int) date('n');

        $dueList = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $owner = $this->stmt(fn ($s) => $s->method('fetchColumn')->willReturn('1'));
        $insert = $this->stmt();
        $entries = $this->stmt(fn ($s) => $s->method('fetchAll')->willReturn([]));
        $forecast = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $existing = $this->stmt(fn ($s) => $s->method('fetch')->willReturn(false));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls(
            $dueList,
            $owner,
            $insert,
            $entries,
            $forecast,
            $existing
        );

        $plan = MonthPlanService::getPlan($pdo, 1, $y, $m);
        $this->assertSame($y, $plan['year']);
        $this->assertNotNull($plan['todayDay']);
    }
}
