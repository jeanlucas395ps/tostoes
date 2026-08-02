<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Auth;
use Gastos\Api\CategoryIcon;
use Gastos\Api\Config;
use Gastos\Api\Cors;
use Gastos\Api\Database;
use Gastos\Api\MoneyHelper;
use Gastos\Api\RequestPath;
use Gastos\Api\Response;
use Gastos\Api\ResponseExitException;
use Gastos\Api\ResponsibleUser;
use Gastos\Api\Services\AccountService;
use Gastos\Api\Services\FxRateService;
use Gastos\Api\Services\GoalPlanService;
use Gastos\Api\Services\InvestmentPortfolioService;
use Gastos\Api\Services\MonthPlanService;
use Gastos\Api\Services\PasswordResetService;
use Gastos\Api\Services\PlanningAccess;
use Gastos\Api\Services\PlanningService;
use Gastos\Api\Services\ProjectionService;
use PDO;
use PDOStatement;
use PHPUnit\Framework\Attributes\PreserveGlobalState;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionMethod;

final class CoverageAllClassesTest extends TestCase
{
    private function stubStmt(?callable $c = null): PDOStatement
    {
        $s = $this->createMock(PDOStatement::class);
        $s->method('execute')->willReturn(true);
        if ($c) {
            $c($s);
        }

        return $s;
    }

    private function setJwtSecret(): void
    {
        $ref = new ReflectionClass(Config::class);
        $prop = $ref->getProperty('env');
        $env = $prop->getValue() ?? [];
        $env['JWT_SECRET'] = 'test-secret';
        $prop->setValue(null, $env);
    }

    private function setConfigKey(string $key, string $value): void
    {
        $ref = new ReflectionClass(Config::class);
        $prop = $ref->getProperty('env');
        $env = $prop->getValue() ?? [];
        $env[$key] = $value;
        $prop->setValue(null, $env);
    }

    protected function setUp(): void
    {
        $this->setJwtSecret();
        Auth::$requestHeadersProvider = null;
        unset($_SERVER['HTTP_AUTHORIZATION'], $_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
        unset($_SERVER['HTTP_X_PLANNING_ID'], $_GET['planningId'], $_SERVER['HTTP_ORIGIN']);
        Database::setConnection(null);
        Response::$throwInsteadOfExit = true;
    }

    protected function tearDown(): void
    {
        Auth::$requestHeadersProvider = null;
        Database::setConnection(null);
        FxRateService::$forceStreamHttp = false;
    }

    // ─── ResponseExitException / Auth ─────────────────────────────────

    public function testResponseExitExceptionViaError(): void
    {
        try {
            Response::error('boom', 400);
            $this->fail('expected throw');
        } catch (ResponseExitException $e) {
            $this->assertSame(400, $e->status);
            $this->assertSame('boom', $e->getMessage());
            $this->assertIsArray($e->payload);
        }

        try {
            Response::json(['ok' => true], 200);
            $this->fail('expected throw');
        } catch (ResponseExitException $e) {
            $this->assertSame('response exit', $e->getMessage());
            $this->assertSame(200, $e->status);
        }
    }

    public function testRequireUserSuccessAnd401(): void
    {
        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . Auth::createToken(9);
        $this->assertSame(9, Auth::requireUser());

        unset($_SERVER['HTTP_AUTHORIZATION']);
        $this->expectException(ResponseExitException::class);
        Auth::requireUser();
    }

    public function testRequirePlanningIdWithHeader(): void
    {
        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . Auth::createToken(2);
        $_SERVER['HTTP_X_PLANNING_ID'] = '7';

        $member = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn([1]));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($member);
        Database::setConnection($pdo);

        $this->assertSame(7, Auth::requirePlanningId());
    }

    public function testRequirePlanningIdDefaultPlanning(): void
    {
        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . Auth::createToken(3);
        unset($_SERVER['HTTP_X_PLANNING_ID'], $_GET['planningId']);

        $default = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('11'));
        $member = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn([1]));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($default, $member);
        Database::setConnection($pdo);

        $this->assertSame(11, Auth::householdUserId());
    }

    public function testRequirePlanningIdInvalidHeader(): void
    {
        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . Auth::createToken(1);
        $_SERVER['HTTP_X_PLANNING_ID'] = '0';
        Database::setConnection($this->createMock(PDO::class));

        $this->expectException(ResponseExitException::class);
        Auth::requirePlanningId();
    }

    public function testAuthorizationViaRequestHeadersProvider(): void
    {
        Auth::$requestHeadersProvider = static fn (): array => [
            'Authorization' => 'Bearer ' . Auth::createToken(44),
        ];
        $this->assertSame(44, Auth::bearerUserId());
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testAuthorizationViaApacheRequestHeaders(): void
    {
        require __DIR__ . '/fixtures/apache_headers_stub.php';
        $this->setJwtSecret();
        Auth::$requestHeadersProvider = null;
        unset($_SERVER['HTTP_AUTHORIZATION'], $_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
        $GLOBALS['apache_request_headers'] = [
            'Authorization' => 'Bearer ' . Auth::createToken(55),
        ];
        $this->assertSame(55, Auth::bearerUserId());
    }

    public function testValidateTokenJsonExceptionPath(): void
    {
        $payload = base64_encode('{');
        $sig = hash_hmac('sha256', $payload, 'test-secret');
        $this->assertNull(Auth::validateToken($payload . '.' . $sig));
    }

    // ─── PlanningAccess ───────────────────────────────────────────────

    public function testRequireMemberForPlanningSuccess(): void
    {
        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . Auth::createToken(5);
        $member = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn([1]));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($member);
        Database::setConnection($pdo);

        $this->assertSame(3, PlanningAccess::requireMemberForPlanning(3));
    }

    public function testAssertRowInPlanningInvalidTable(): void
    {
        $pdo = $this->createMock(PDO::class);
        $this->expectException(ResponseExitException::class);
        PlanningAccess::assertRowInPlanning($pdo, 'users', 1, 1);
    }

    public function testAssertRowInPlanningNotFound(): void
    {
        $stmt = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);
        $this->expectException(ResponseExitException::class);
        PlanningAccess::assertRowInPlanning($pdo, 'transactions', 99, 1);
    }

    public function testAssertUsersSharePlanningForbidden(): void
    {
        $stmt = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);
        $this->expectException(ResponseExitException::class);
        PlanningAccess::assertUsersSharePlanning($pdo, 1, 2);
    }

    // ─── Cors ─────────────────────────────────────────────────────────

    public function testCorsApplySingleOriginFallbackAndLocalhost(): void
    {
        $prev = $_SERVER['HTTP_ORIGIN'] ?? null;
        try {
            $this->setConfigKey('CORS_ORIGIN', 'https://app.example.com');
            unset($_SERVER['HTTP_ORIGIN']);
            Cors::apply();

            $_SERVER['HTTP_ORIGIN'] = 'https://localhost';
            Cors::apply();
            $this->assertTrue(true);
        } finally {
            if ($prev === null) {
                unset($_SERVER['HTTP_ORIGIN']);
            } else {
                $_SERVER['HTTP_ORIGIN'] = $prev;
            }
        }
    }

    // ─── Config ───────────────────────────────────────────────────────

    public function testConfigLoadGetenvOverride(): void
    {
        $dir = sys_get_temp_dir() . '/gastos-cfg-getenv-' . uniqid('', true);
        mkdir($dir);
        try {
            putenv('DB_HOST=from-getenv');
            Config::load($dir);
            $this->assertSame('from-getenv', Config::get('DB_HOST'));
        } finally {
            putenv('DB_HOST');
            @rmdir($dir);
        }
    }

    public function testConfigNormalizeEmptyDbNameAndUser(): void
    {
        $ref = new ReflectionClass(Config::class);
        $envProp = $ref->getProperty('env');
        $envProp->setValue(null, [
            'DB_NAME' => 'keep',
            'DB_USER' => 'keep_user',
            'DB_DATABASE' => 'alias_db',
            'DB_USERNAME' => 'alias_user',
            'DB_PASSWORD' => '',
            'MAIL_FROM_ADDRESS' => 'a@b.com',
            'MAIL_FROM_NAME' => 'App',
            'MAIL_FROM' => '',
            'APP_TIMEZONE' => 'UTC',
        ]);
        $m = new ReflectionMethod(Config::class, 'normalizeDatabaseKeys');
        $m->invoke(null);
        $env = $envProp->getValue();
        // Aliases overwrite when present (cPanel style).
        $this->assertSame('alias_db', $env['DB_NAME']);
        $this->assertSame('alias_user', $env['DB_USER']);
    }

    // ─── RequestPath ──────────────────────────────────────────────────

    public function testRequestPathWithAppBasePath(): void
    {
        $this->setConfigKey('APP_BASE_PATH', '/gastos');
        $this->assertSame('/accounts', RequestPath::fromUri('/gastos/api/accounts'));
        $this->setConfigKey('APP_BASE_PATH', '');
    }

    // ─── CategoryIcon ─────────────────────────────────────────────────

    public function testCategoryIconResolveForItemAndEmptyMatch(): void
    {
        $this->assertSame('🛒', CategoryIcon::resolveForItem('Mercado', '🛒', 'ignored'));
        $this->assertSame('🛒', CategoryIcon::resolveForItem('Outros', '📌', 'Supermercado Extra'));
        $this->assertSame('📌', CategoryIcon::suggestForName(''));
        $this->assertSame('📌', CategoryIcon::resolveForItem(null, '📌', 'xyzsemregra'));
    }

    // ─── MoneyHelper ──────────────────────────────────────────────────

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testMoneyHelperUsdFallbackWithColumn(): void
    {
        $info = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(1));
        $settingsFalse = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        $settingsVal = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('5.75'));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($settingsFalse, $settingsVal);

        $this->assertSame(5.0, MoneyHelper::getUsdToBrlFallback($pdo, 1));
        $this->assertSame(5.75, MoneyHelper::getUsdToBrlFallback($pdo, 1));
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testMoneyHelperParseInputRemainingBranches(): void
    {
        require __DIR__ . '/fixtures/fx_curl_stub.php';
        $info = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        $settings = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('6.0'));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturn($settings);

        $a = MoneyHelper::parseInput($pdo, 1, ['currency' => 'BRL', 'suggestedAmountBrl' => 9.5]);
        $this->assertSame(9.5, $a['amount']);

        $b = MoneyHelper::parseInput($pdo, 1, ['currency' => 'BRL', 'amountOriginal' => 4.2]);
        $this->assertSame(4.2, $b['amount']);

        $c = MoneyHelper::parseInput($pdo, 1, ['currency' => 'BRL']);
        $this->assertSame(0.0, $c['amount']);
    }

    // ─── ResponsibleUser ──────────────────────────────────────────────

    public function testResponsibleUserInvalidMember(): void
    {
        $stmt = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($stmt);
        $this->expectException(ResponseExitException::class);
        ResponsibleUser::assertValidPlanningMember($pdo, 1, 99);
    }

    // ─── AccountService validations ───────────────────────────────────

    public function testValidateAccountIdErrors(): void
    {
        $pdo = $this->createMock(PDO::class);
        try {
            AccountService::validateAccountId($pdo, 1, 0);
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertSame(422, $e->status);
        }

        $notFound = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $pdo2 = $this->createMock(PDO::class);
        $pdo2->method('prepare')->willReturn($notFound);
        try {
            AccountService::validateAccountId($pdo2, 1, 5);
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertStringContainsString('não encontrada', $e->getMessage());
        }

        foreach (['bank' => 'bancária', 'investment' => 'investimento', 'credit' => 'crédito', 'wallet' => 'wallet'] as $type => $labelPart) {
            $row = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(['id' => 1, 'type' => 'other']));
            $p = $this->createMock(PDO::class);
            $p->method('prepare')->willReturn($row);
            try {
                AccountService::validateAccountId($p, 1, 1, $type);
                $this->fail('expected type ' . $type);
            } catch (ResponseExitException $e) {
                $this->assertStringContainsString($labelPart, $e->getMessage());
            }
        }
    }

    public function testValidatePaymentSourceErrors(): void
    {
        $pdo = $this->createMock(PDO::class);
        try {
            AccountService::validatePaymentSourceAccountId($pdo, 1, 0);
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertSame(422, $e->status);
        }

        $nf = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $pdo2 = $this->createMock(PDO::class);
        $pdo2->method('prepare')->willReturn($nf);
        try {
            AccountService::validatePaymentSourceAccountId($pdo2, 1, 3);
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertStringContainsString('não encontrada', $e->getMessage());
        }

        $wrong = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(['id' => 1, 'type' => 'investment']));
        $pdo3 = $this->createMock(PDO::class);
        $pdo3->method('prepare')->willReturn($wrong);
        $this->expectException(ResponseExitException::class);
        AccountService::validatePaymentSourceAccountId($pdo3, 1, 1);
    }

    public function testValidateTransfersSameAccounts(): void
    {
        $bank = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(['id' => 5, 'type' => 'bank']));
        $inv = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(['id' => 5, 'type' => 'investment']));
        // same id 5 for both validates — first call bank type, second investment type with same id
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($bank, $inv);
        try {
            AccountService::validateInvestmentTransfer($pdo, 1, 5, 5);
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertStringContainsString('diferentes', $e->getMessage());
        }

        $a = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(['id' => 8, 'type' => 'bank']));
        $b = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(['id' => 8, 'type' => 'bank']));
        $pdo2 = $this->createMock(PDO::class);
        $pdo2->method('prepare')->willReturnOnConsecutiveCalls($a, $b);
        $this->expectException(ResponseExitException::class);
        AccountService::validateAccountTransfer($pdo2, 1, 8, 8);
    }

    public function testMapAccountCreditWithStatementYearMonth(): void
    {
        $y = (int) date('Y');
        $m = (int) date('n');
        $accountRow = [
            'id' => 5,
            'planning_id' => 1,
            'name' => 'Card',
            'type' => 'credit',
            'currency' => 'BRL',
            'initial_balance' => 0,
            'initial_balance_date' => '2020-01-01',
            'credit_limit' => 1000,
            'closing_day' => 10,
            'due_day' => 17,
            'color' => '#000',
            'sort_order' => 0,
        ];

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($accountRow) {
            if (str_contains($sql, 'eur_to_brl') || str_contains($sql, 'usd_to_brl')) {
                return $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('6.0'));
            }
            if (str_contains($sql, 'FROM transactions') && str_contains($sql, 'transaction_date >=')) {
                return $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
            }
            if (str_contains($sql, 'FROM recurring_items')) {
                return $this->stubStmt(fn ($s) => $s->method('fetchAll')->willReturn([]));
            }
            if (str_contains($sql, 'FROM recurring_items r') || str_contains($sql, 'is_fixed = 1')) {
                return $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
            }
            if (str_contains($sql, 'month_plan_entries') && str_contains($sql, "status = 'pending'")) {
                return $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
            }
            if (str_contains($sql, 'FROM transactions') && str_contains($sql, 'YEAR')) {
                return $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
            }
            if (str_contains($sql, 'FROM financial_accounts')) {
                return $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn($accountRow));
            }
            if (str_contains($sql, 'LEFT JOIN month_plan_entries')) {
                return $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
            }

            return $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
        });

        $mapped = AccountService::mapAccount($pdo, $accountRow, true, $y, $m);
        $this->assertArrayHasKey('statement', $mapped);
        $this->assertArrayHasKey('monthForecast', $mapped);
    }

    public function testFutureInstallmentsCommittedBranches(): void
    {
        $nowY = (int) date('Y');
        $nowM = (int) date('n');
        $pastEnd = sprintf('%04d-%02d-01', $nowY - 1, 1);
        $futureStart = sprintf('%04d-%02d-01', $nowY + 1, 1);
        $futureEnd = sprintf('%04d-%02d-28', $nowY + 1, 6);
        $activeEnd = sprintf('%04d-%02d-28', $nowY + ($nowM >= 12 ? 1 : 0), $nowM >= 12 ? 1 : min(12, $nowM + 1));
        $activeStart = sprintf('%04d-%02d-01', $nowY - 1, 1);

        $items = [
            ['id' => 1, 'currency' => 'BRL', 'amount_original' => null, 'default_amount_brl' => 10, 'start_date' => '', 'end_date' => ''],
            ['id' => 2, 'currency' => 'BRL', 'amount_original' => null, 'default_amount_brl' => 10, 'start_date' => $futureStart, 'end_date' => $futureEnd],
            ['id' => 3, 'currency' => 'BRL', 'amount_original' => null, 'default_amount_brl' => 10, 'start_date' => $pastEnd, 'end_date' => $pastEnd],
            [
                'id' => 4,
                'currency' => 'BRL',
                'amount_original' => null,
                'default_amount_brl' => 50,
                'start_date' => $activeStart,
                'end_date' => $activeEnd,
            ],
            [
                'id' => 5,
                'currency' => 'EUR',
                'amount_original' => 20,
                'default_amount_brl' => 120,
                'start_date' => $activeStart,
                'end_date' => $activeEnd,
            ],
            [
                'id' => 6,
                'currency' => 'BRL',
                'amount_original' => null,
                'default_amount_brl' => 90,
                'start_date' => $activeStart,
                'end_date' => $activeEnd,
            ],
            [
                'id' => 7,
                'currency' => 'USD',
                'amount_original' => 15,
                'default_amount_brl' => 75,
                'start_date' => $activeStart,
                'end_date' => $activeEnd,
            ],
        ];

        $list = $this->stubStmt(fn ($s) => $s->method('fetchAll')->willReturn($items));
        $confirmed = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturnCallback(static function () {
                static $n = 0;
                $n++;
                // First call confirmed (skip month, may roll year), rest unconfirmed
                return $n === 1 ? 1 : false;
            });
        });
        $amount = $this->stubStmt(function (PDOStatement $s): void {
            $s->method('fetchColumn')->willReturnCallback(static function () {
                static $n = 0;
                $n++;
                return $n === 1 ? '40' : false;
            });
        });

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($list, $confirmed, $amount) {
            if (str_contains($sql, 'FROM recurring_items')) {
                return $list;
            }
            if (str_contains($sql, 'month_plan_entries')) {
                return $confirmed;
            }

            return $amount;
        });

        $brl = AccountService::futureInstallmentsCommitted($pdo, 1, 5, 'BRL', 6.0);
        $this->assertGreaterThanOrEqual(0, $brl);

        // Dec confirmed → m++ rolls to next year (m>12)
        $lastMonth = 0;
        $listDec = $this->stubStmt(fn ($s) => $s->method('fetchAll')->willReturn([[
            'id' => 90,
            'currency' => 'BRL',
            'amount_original' => null,
            'default_amount_brl' => 8,
            'start_date' => sprintf('%04d-01-01', $nowY - 1),
            'end_date' => sprintf('%04d-12-31', $nowY + 1),
        ]]));
        $confDec = $this->createMock(PDOStatement::class);
        $confDec->method('execute')->willReturnCallback(function (array $params) use (&$lastMonth): bool {
            $lastMonth = (int) $params[3];

            return true;
        });
        $confDec->method('fetchColumn')->willReturnCallback(function () use (&$lastMonth) {
            return $lastMonth === 12 ? 1 : false;
        });
        $amtDec = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        $pdoDec = $this->createMock(PDO::class);
        $pdoDec->method('prepare')->willReturnCallback(function (string $sql) use ($listDec, $confDec, $amtDec) {
            if (str_contains($sql, 'FROM recurring_items')) {
                return $listDec;
            }
            if (str_contains($sql, 'month_plan_entries')) {
                return $confDec;
            }

            return $amtDec;
        });
        $this->assertGreaterThanOrEqual(0, AccountService::futureInstallmentsCommitted($pdoDec, 1, 5, 'BRL', 6.0));

        $fxItems = [
            [
                'id' => 10,
                'currency' => 'EUR',
                'amount_original' => 12,
                'default_amount_brl' => 70,
                'start_date' => $activeStart,
                'end_date' => $activeEnd,
            ],
            [
                'id' => 11,
                'currency' => 'BRL',
                'amount_original' => null,
                'default_amount_brl' => 60,
                'start_date' => $activeStart,
                'end_date' => $activeEnd,
            ],
            [
                'id' => 12,
                'currency' => 'USD',
                'amount_original' => 15,
                'default_amount_brl' => 75,
                'start_date' => $activeStart,
                'end_date' => $activeEnd,
            ],
        ];
        foreach ([['EUR', 6.0], ['EUR', 0.0], ['USD', 5.0]] as [$cur, $rate]) {
            $list2 = $this->stubStmt(fn ($s) => $s->method('fetchAll')->willReturn($fxItems));
            $conf2 = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
            $amt2 = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
            $pdo2 = $this->createMock(PDO::class);
            $pdo2->method('prepare')->willReturnCallback(function (string $sql) use ($list2, $conf2, $amt2) {
                if (str_contains($sql, 'FROM recurring_items')) {
                    return $list2;
                }
                if (str_contains($sql, 'month_plan_entries')) {
                    return $conf2;
                }

                return $amt2;
            });
            $this->assertGreaterThanOrEqual(0, AccountService::futureInstallmentsCommitted($pdo2, 1, 5, $cur, $rate));
        }
    }

    public function testStatementCreditIncomeRunningBranch(): void
    {
        $account = [
            'id' => 5,
            'planning_id' => 1,
            'currency' => 'BRL',
            'type' => 'credit',
            'initial_balance' => 100,
            'initial_balance_date' => '2026-01-01',
        ];
        $accStmt = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn($account));
        $txStmt = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturnOnConsecutiveCalls(
            [
                'id' => 1,
                'transaction_date' => '2026-01-05',
                'kind' => 'income',
                'description' => 'Payment',
                'amount' => 30,
                'currency' => 'BRL',
                'amount_brl' => 30,
                'eur_to_brl' => null,
                'category' => null,
                'notes' => null,
                'item_category_name' => null,
            ],
            false
        ));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($accStmt, $txStmt);

        $lines = AccountService::statement($pdo, 5, 1, 2026, 1, 6.0);
        $this->assertGreaterThan(1, count($lines));
    }

    public function testStatementBankExpenseRunningBranch(): void
    {
        $account = [
            'id' => 5,
            'planning_id' => 1,
            'currency' => 'BRL',
            'type' => 'bank',
            'initial_balance' => 100,
            'initial_balance_date' => '2026-01-01',
        ];
        $accStmt = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn($account));
        $txStmt = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturnOnConsecutiveCalls(
            [
                'id' => 1,
                'transaction_date' => '2026-01-05',
                'kind' => 'expense',
                'description' => 'Buy',
                'amount' => 30,
                'currency' => 'BRL',
                'amount_brl' => 30,
                'eur_to_brl' => null,
                'category' => null,
                'notes' => null,
                'item_category_name' => null,
            ],
            false
        ));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($accStmt, $txStmt);

        $lines = AccountService::statement($pdo, 5, 1, null, null, 6.0);
        $this->assertGreaterThan(1, count($lines));
        $this->assertSame(70.0, $lines[1]['balanceAfter']);
    }

    // ─── FxRateService ────────────────────────────────────────────────

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testFxResolveBrlShortCircuit(): void
    {
        $pdo = $this->createMock(PDO::class);
        $r = FxRateService::resolveToBrl($pdo, 1, 'BRL', '2026-01-01');
        $this->assertSame(1.0, $r['rate']);
        $this->assertSame('fallback', $r['source']);
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testFxCacheMissApiSuccessCachesEurAndUsd(): void
    {
        require __DIR__ . '/fixtures/fx_curl_stub.php';
        $GLOBALS['fx_curl_init'] = true;
        $GLOBALS['fx_curl_body'] = json_encode(['rates' => ['BRL' => 6.5]]);
        $GLOBALS['fx_curl_code'] = 200;

        $table = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(1));
        $usdCol = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(1));
        $cacheMiss = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $insert = $this->stubStmt();

        $queryN = 0;
        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturnCallback(function () use (&$queryN, $table, $usdCol) {
            $queryN++;

            return $queryN === 1 ? $table : $usdCol;
        });
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($cacheMiss, $insert) {
            if (str_starts_with(ltrim($sql), 'INSERT')) {
                return $insert;
            }

            return $cacheMiss;
        });

        $eur = FxRateService::resolveToBrl($pdo, 1, 'EUR', '2020-06-01');
        $this->assertSame('api', $eur['source']);
        $this->assertSame(6.5, $eur['rate']);

        $GLOBALS['fx_curl_body'] = json_encode(['rates' => ['BRL' => 5.2]]);
        $usd = FxRateService::resolveToBrl($pdo, 1, 'USD', '2020-06-01');
        $this->assertSame('api', $usd['source']);
        $this->assertSame(5.2, $usd['rate']);

        // hasUsdColumn cached second call
        $usd2 = FxRateService::resolveToBrl($pdo, 1, 'USD', '2020-06-02');
        $this->assertSame('api', $usd2['source']);
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testFxCacheMissApiNullFallbackCache(): void
    {
        require __DIR__ . '/fixtures/fx_curl_stub.php';
        $GLOBALS['fx_curl_init'] = true;
        $GLOBALS['fx_curl_body'] = 'not-json';
        $GLOBALS['fx_curl_code'] = 200;

        $table = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(1));
        $cacheMiss = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $settings = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('6.1'));
        $insert = $this->stubStmt();

        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($table);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($cacheMiss, $settings, $insert) {
            if (str_starts_with(ltrim($sql), 'INSERT')) {
                return $insert;
            }
            if (str_contains($sql, 'planning_settings')) {
                return $settings;
            }

            return $cacheMiss;
        });

        $r = FxRateService::resolveToBrl($pdo, 1, 'EUR', '2020-01-01');
        $this->assertSame('fallback', $r['source']);
        $this->assertSame(6.1, $r['rate']);
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testFxGetCachedBranches(): void
    {
        require __DIR__ . '/fixtures/fx_curl_stub.php';
        $GLOBALS['fx_curl_init'] = true;
        $GLOBALS['fx_curl_body'] = false;
        $GLOBALS['fx_curl_code'] = 500;

        // no table
        $noTable = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        $settings = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('5.0'));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($noTable);
        $pdo->method('prepare')->willReturn($settings);
        $r = FxRateService::resolveToBrl($pdo, 1, 'USD', '2020-01-01');
        $this->assertSame('fallback', $r['source']);
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testFxGetCachedUsdWithoutColumnAndBadRate(): void
    {
        require __DIR__ . '/fixtures/fx_curl_stub.php';
        $GLOBALS['fx_curl_init'] = true;
        $GLOBALS['fx_curl_body'] = false;
        $GLOBALS['fx_curl_code'] = 500;

        $tableYes = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(1));
        $usdNo = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        $settings = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('5.0'));

        $q = 0;
        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturnCallback(function () use (&$q, $tableYes, $usdNo) {
            $q++;

            return $q === 1 ? $tableYes : $usdNo;
        });
        $pdo->method('prepare')->willReturn($settings);

        $r = FxRateService::resolveToBrl($pdo, 1, 'USD', '2020-01-01');
        $this->assertSame('fallback', $r['source']);
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testFxGetCachedBadRateAndSourceFallback(): void
    {
        $table = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(1));
        $bad = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(['rate' => null, 'source' => 'api']));
        $settings = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('6.0'));
        $insert = $this->stubStmt();

        require __DIR__ . '/fixtures/fx_curl_stub.php';
        $GLOBALS['fx_curl_body'] = false;
        $GLOBALS['fx_curl_code'] = 500;

        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($table);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($bad, $settings, $insert) {
            if (str_starts_with(ltrim($sql), 'INSERT')) {
                return $insert;
            }
            if (str_contains($sql, 'planning_settings')) {
                return $settings;
            }

            return $bad;
        });

        $r = FxRateService::resolveToBrl($pdo, 1, 'EUR', '2020-01-01');
        $this->assertSame('fallback', $r['source']);

        // source fallback from cache
        $okFallback = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(['rate' => '6.2', 'source' => 'fallback']));
        $pdo2 = $this->createMock(PDO::class);
        $pdo2->method('query')->willReturn($table);
        $pdo2->method('prepare')->willReturn($okFallback);
        // Reset static exists via separate... we're same process; tableExists already cached true
        $cached = FxRateService::resolveToBrl($pdo2, 1, 'EUR', '2020-02-01');
        $this->assertSame('fallback', $cached['source']);
        $this->assertSame(6.2, $cached['rate']);
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testFxFetchInvalidJsonAndMissingRates(): void
    {
        require __DIR__ . '/fixtures/fx_curl_stub.php';
        $m = new ReflectionMethod(FxRateService::class, 'fetchFromFrankfurter');

        $GLOBALS['fx_curl_init'] = true;
        $GLOBALS['fx_curl_code'] = 200;
        $GLOBALS['fx_curl_body'] = '{bad';
        $this->assertNull($m->invoke(null, '2020-01-01', 'EUR'));

        $GLOBALS['fx_curl_body'] = json_encode(['rates' => []]);
        $this->assertNull($m->invoke(null, '2020-01-01', 'EUR'));
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testFxHttpGetCurlBranches(): void
    {
        require __DIR__ . '/fixtures/fx_curl_stub.php';
        $m = new ReflectionMethod(FxRateService::class, 'httpGetCurl');

        $GLOBALS['fx_curl_init'] = false;
        $this->assertNull($m->invoke(null, 'https://example.com'));

        $GLOBALS['fx_curl_init'] = true;
        $GLOBALS['fx_curl_body'] = 'ok';
        $GLOBALS['fx_curl_code'] = 500;
        $this->assertNull($m->invoke(null, 'https://example.com'));

        $GLOBALS['fx_curl_code'] = 200;
        $this->assertSame('ok', $m->invoke(null, 'https://example.com'));
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testFxHttpGetStream(): void
    {
        FxRateService::$forceStreamHttp = true;
        $m = new ReflectionMethod(FxRateService::class, 'httpGetStream');
        $ok = $m->invoke(null, 'data://text/plain,hello');
        $this->assertSame('hello', $ok);
        $this->assertNull($m->invoke(null, 'http://127.0.0.1:1/nope-' . uniqid()));

        $httpGet = new ReflectionMethod(FxRateService::class, 'httpGet');
        $this->assertSame('via-httpget', $httpGet->invoke(null, 'data://text/plain,via-httpget'));
    }

    // ─── PasswordReset ────────────────────────────────────────────────

    public function testPasswordResetValidationErrors(): void
    {
        $pdo = $this->createMock(PDO::class);
        try {
            PasswordResetService::request($pdo, 'not-an-email');
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertSame(422, $e->status);
        }

        try {
            PasswordResetService::reset($pdo, 'short', 'password123');
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertStringContainsString('inválido', $e->getMessage());
        }

        try {
            PasswordResetService::reset($pdo, str_repeat('a', 32), 'short');
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertStringContainsString('8 caracteres', $e->getMessage());
        }

        $used = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn([
            'id' => 1,
            'user_id' => 1,
            'expires_at' => date('Y-m-d H:i:s', time() + 3600),
            'used_at' => date('Y-m-d H:i:s'),
        ]));
        $pdo2 = $this->createMock(PDO::class);
        $pdo2->method('prepare')->willReturn($used);
        try {
            PasswordResetService::reset($pdo2, str_repeat('b', 32), 'password123');
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertStringContainsString('inválido', $e->getMessage());
        }

        $expired = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn([
            'id' => 1,
            'user_id' => 1,
            'expires_at' => date('Y-m-d H:i:s', time() - 10),
            'used_at' => null,
        ]));
        $pdo3 = $this->createMock(PDO::class);
        $pdo3->method('prepare')->willReturn($expired);
        $this->expectException(ResponseExitException::class);
        PasswordResetService::reset($pdo3, str_repeat('c', 32), 'password123');
    }

    // ─── PlanningService errors ───────────────────────────────────────

    public function testPlanningServiceErrorPaths(): void
    {
        $deny = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($deny);
        try {
            PlanningService::assertMember($pdo, 1, 1);
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertSame(403, $e->status);
        }

        $noRole = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        $pdo2 = $this->createMock(PDO::class);
        $pdo2->method('prepare')->willReturn($noRole);
        try {
            PlanningService::assertOwner($pdo2, 1, 1);
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertSame(403, $e->status);
        }

        $member = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('member'));
        $pdo3 = $this->createMock(PDO::class);
        $pdo3->method('prepare')->willReturn($member);
        try {
            PlanningService::assertOwner($pdo3, 1, 1);
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertStringContainsString('dono', $e->getMessage());
        }

        $owner = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('owner'));
        $pdo4 = $this->createMock(PDO::class);
        $pdo4->method('prepare')->willReturn($owner);
        try {
            PlanningService::update($pdo4, 1, 1, '  ');
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertSame(422, $e->status);
        }

        $owner2 = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('owner'));
        $upd = $this->stubStmt(fn ($s) => $s->method('rowCount')->willReturn(0));
        $exists = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $pdo5 = $this->createMock(PDO::class);
        $pdo5->method('prepare')->willReturnOnConsecutiveCalls($owner2, $upd, $exists);
        try {
            PlanningService::update($pdo5, 1, 1, 'Nome');
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertSame(404, $e->status);
        }

        $owner3 = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('owner'));
        $del = $this->stubStmt(fn ($s) => $s->method('rowCount')->willReturn(0));
        $pdo6 = $this->createMock(PDO::class);
        $pdo6->method('prepare')->willReturnOnConsecutiveCalls($owner3, $del);
        try {
            PlanningService::destroy($pdo6, 1, 1);
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertSame(404, $e->status);
        }

        $none = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        $pdo7 = $this->createMock(PDO::class);
        $pdo7->method('prepare')->willReturn($none);
        try {
            PlanningService::defaultPlanningForUser($pdo7, 1);
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertSame(404, $e->status);
        }

        $assert = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn([1]));
        $noUser = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        $pdo8 = $this->createMock(PDO::class);
        $pdo8->method('prepare')->willReturnOnConsecutiveCalls($assert, $noUser);
        try {
            PlanningService::addMemberByUsername($pdo8, 1, 1, 'ghost');
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertSame(404, $e->status);
        }

        $assert2 = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn([1]));
        $user = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('9'));
        $already = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn([1]));
        $pdo9 = $this->createMock(PDO::class);
        $pdo9->method('prepare')->willReturnOnConsecutiveCalls($assert2, $user, $already);
        $this->expectException(ResponseExitException::class);
        PlanningService::addMemberByUsername($pdo9, 1, 1, 'bob');
    }

    // ─── GoalPlanService ──────────────────────────────────────────────

    public function testGoalPlanServiceErrorAndEdgePaths(): void
    {
        try {
            GoalPlanService::parseDates([]);
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertSame(422, $e->status);
        }
        try {
            GoalPlanService::parseDates(['startDate' => 'bad', 'endDate' => 'also-bad']);
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertStringContainsString('inválidas', $e->getMessage());
        }
        try {
            GoalPlanService::parseDates(['startDate' => '2026-12-01', 'endDate' => '2026-01-01']);
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertStringContainsString('anterior', $e->getMessage());
        }

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturn($this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('0')));
        $this->assertSame(0.0, GoalPlanService::uniformMonthlyInstallment($pdo, 1, [
            'target_amount_brl' => 100,
            'start_date' => '',
            'end_date' => '',
            'id' => 1,
        ]));

        // monthsLeft <= 0 (past end)
        $this->assertSame(0.0, GoalPlanService::uniformMonthlyInstallment($pdo, 1, [
            'target_amount_brl' => 1000,
            'current_amount_brl' => 0,
            'start_date' => '2020-01-01',
            'end_date' => '2020-06-01',
            'id' => 1,
            'target_financial_account_id' => null,
        ], 2026, 1));

        $goals = $this->stubStmt(fn ($s) => $s->method('fetchAll')->willReturn(['3']));
        $goalRow = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $pdo2 = $this->createMock(PDO::class);
        $pdo2->method('prepare')->willReturnOnConsecutiveCalls($goals, $goalRow);
        GoalPlanService::refreshAllPendingAmounts($pdo2, 1);

        $pdo3 = $this->createMock(PDO::class);
        $pdo3->method('prepare')->willReturn($this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('50')));
        $this->assertSame(50.0, GoalPlanService::plannedAmountAtDate($pdo3, 1, [
            'target_amount_brl' => 100,
            'start_date' => '',
            'end_date' => '',
            'id' => 2,
            'target_financial_account_id' => null,
        ], '2026-01-01'));

        $this->assertSame(50.0, GoalPlanService::plannedAmountAtDate($pdo3, 1, [
            'target_amount_brl' => 100,
            'start_date' => '2026-06-01',
            'end_date' => '2026-12-01',
            'id' => 2,
            'target_financial_account_id' => null,
        ], '2026-01-01'));
    }

    // ─── MonthPlanService gaps ────────────────────────────────────────

    public function testMonthPlanSyncDueSkipsAndExisting(): void
    {
        $rows = [
            [
                'id' => 1, 'due_day' => 28, 'kind' => 'expense', 'name' => 'Late', 'category' => 'x',
                'region' => 'geral', 'responsible' => null, 'responsible_user_id' => null,
                'investment_type_id' => null, 'financial_account_id' => null,
                'source_financial_account_id' => null, 'custom_tab_id' => null, 'item_category_id' => null,
                'currency' => 'BRL', 'amount_original' => null, 'amount_brl' => 10,
                'is_installment' => 0, 'start_date' => null, 'end_date' => null,
            ],
            [
                'id' => 2, 'due_day' => 1, 'kind' => 'expense', 'name' => 'Out', 'category' => 'x',
                'region' => 'geral', 'responsible' => null, 'responsible_user_id' => null,
                'investment_type_id' => null, 'financial_account_id' => null,
                'source_financial_account_id' => null, 'custom_tab_id' => null, 'item_category_id' => null,
                'currency' => 'BRL', 'amount_original' => null, 'amount_brl' => 10,
                'is_installment' => 1, 'start_date' => '2099-01-01', 'end_date' => '2099-12-01',
            ],
            [
                'id' => 3, 'due_day' => 1, 'kind' => 'expense', 'name' => 'Exists', 'category' => 'x',
                'region' => 'geral', 'responsible' => null, 'responsible_user_id' => null,
                'investment_type_id' => null, 'financial_account_id' => null,
                'source_financial_account_id' => null, 'custom_tab_id' => null, 'item_category_id' => null,
                'currency' => 'BRL', 'amount_original' => null, 'amount_brl' => 10,
                'is_installment' => 0, 'start_date' => null, 'end_date' => null,
            ],
        ];
        $list = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturnOnConsecutiveCalls(...array_merge($rows, [false])));
        $owner = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('1'));
        $insert = $this->stubStmt();
        $check = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(['id' => 9]));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($list, $owner, $insert, $check) {
            if (str_contains($sql, 'FROM recurring_items r')) {
                return $list;
            }
            if (str_contains($sql, 'created_by_user_id')) {
                return $owner;
            }
            if (str_starts_with(ltrim($sql), 'INSERT')) {
                return $insert;
            }

            return $check;
        });

        MonthPlanService::syncDueSuggestions($pdo, 1, 2026, 7, 5);
        $this->assertTrue(true);
    }

    public function testMonthPlanBuildForecastBranches(): void
    {
        $m = new ReflectionMethod(MonthPlanService::class, 'buildForecast');
        $existingRows = [['recurring_item_id' => 2]];
        $items = [
            [
                'id' => 1, 'due_day' => 20, 'kind' => 'expense', 'name' => 'A', 'category' => 'c',
                'currency' => 'BRL', 'amount_original' => null, 'amount_brl' => 15,
                'is_installment' => 1, 'start_date' => '2099-01-01', 'end_date' => '2099-02-01',
            ],
            [
                'id' => 2, 'due_day' => 25, 'kind' => 'expense', 'name' => 'B', 'category' => 'c',
                'currency' => 'BRL', 'amount_original' => null, 'amount_brl' => 15,
                'is_installment' => 0, 'start_date' => null, 'end_date' => null,
            ],
            [
                'id' => 3, 'due_day' => 3, 'kind' => 'expense', 'name' => 'C', 'category' => 'c',
                'currency' => 'BRL', 'amount_original' => null, 'amount_brl' => 15,
                'is_installment' => 0, 'start_date' => null, 'end_date' => null,
            ],
            [
                'id' => 4, 'due_day' => 28, 'kind' => 'expense', 'name' => 'D', 'category' => 'c',
                'currency' => 'BRL', 'amount_original' => null, 'amount_brl' => 22,
                'is_installment' => 0, 'start_date' => null, 'end_date' => null,
            ],
        ];
        $list = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturnOnConsecutiveCalls(...array_merge($items, [false])));
        $existing = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturnOnConsecutiveCalls(...array_merge($existingRows, [false])));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('prepare')->willReturnOnConsecutiveCalls($list, $existing);

        $forecast = $m->invoke(null, $pdo, 1, 2026, 7, 5);
        $this->assertNotEmpty($forecast);
        $this->assertSame(22.0, $forecast[0]['suggestedAmount']);
    }

    public function testMonthPlanBuildSummaryUnknownKind(): void
    {
        $pdo = $this->createMock(PDO::class);
        $summary = MonthPlanService::buildSummary($pdo, 1, 2026, 7, [
            [
                'status' => 'pending',
                'kind' => 'weird',
                'currency' => 'BRL',
                'suggestedAmount' => 10,
                'suggestedAmountBrl' => 10,
            ],
        ], []);
        $this->assertArrayHasKey('projected', $summary);
    }

    public function testMonthPlanRevertAndFindEntryErrors(): void
    {
        $pdo = $this->createMock(PDO::class);
        try {
            MonthPlanService::revertConfirmation($pdo, 1, ['status' => 'pending', 'id' => 1]);
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertSame(422, $e->status);
        }
        try {
            MonthPlanService::revertConfirmation($pdo, 1, ['status' => 'confirmed', 'id' => 1, 'transaction_id' => 0]);
            $this->fail('expected');
        } catch (ResponseExitException $e) {
            $this->assertStringContainsString('transação', $e->getMessage());
        }

        $entryMiss = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $txMiss = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $pdo2 = $this->createMock(PDO::class);
        $pdo2->method('prepare')->willReturnOnConsecutiveCalls($entryMiss, $txMiss);
        $this->assertNull(MonthPlanService::findEntryForTransaction($pdo2, 1, 9));

        $entryMiss2 = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $txNotes = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn([
            'id' => 9,
            'notes' => 'no marker',
        ]));
        $pdo3 = $this->createMock(PDO::class);
        $pdo3->method('prepare')->willReturnOnConsecutiveCalls($entryMiss2, $txNotes);
        $this->assertNull(MonthPlanService::findEntryForTransaction($pdo3, 1, 9));

        $mapped = MonthPlanService::mapEntry([
            'id' => 1,
            'suggested_amount_brl' => 12.5,
            'kind' => 'expense',
            'name' => 'X',
            'category' => 'c',
            'region' => 'geral',
            'status' => 'pending',
            'year' => 2026,
            'month' => 7,
            'due_day' => 1,
            'recurring_item_id' => null,
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
            'currency' => 'BRL',
        ]);
        $this->assertSame(12.5, $mapped['suggestedAmount']);
    }

    // ─── ProjectionService ────────────────────────────────────────────

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testProjectionUsdAndEntryWithoutSuggestedAmount(): void
    {
        require __DIR__ . '/fixtures/fx_curl_stub.php';
        $info = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        $settings = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('5.0'));
        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturn($settings);

        $brl = ProjectionService::amountInBrlForMonth($pdo, 1, 2099, 1, 'USD', 10.0);
        $this->assertSame(50.0, $brl);

        $entry = ProjectionService::entrySuggestedBrl($pdo, 1, 2099, 1, [
            'currency' => 'BRL',
            'suggested_amount_brl' => 7.5,
        ]);
        $this->assertSame(7.5, $entry);
    }

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testProjectionRecurringEurOverridePaths(): void
    {
        require __DIR__ . '/fixtures/fx_curl_stub.php';
        $info = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        $settings = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('6.0'));

        $items = $this->stubStmt(fn ($s) => $s->method('fetchAll')->willReturn([
            [
                'id' => 1,
                'kind' => 'expense',
                'currency' => 'EUR',
                'amount_original' => 10,
                'default_amount_brl' => 60,
                'is_installment' => 0,
                'start_date' => null,
                'end_date' => null,
            ],
            [
                'id' => 2,
                'kind' => 'skipme',
                'currency' => 'BRL',
                'amount_original' => null,
                'default_amount_brl' => 1,
                'is_installment' => 1,
                'start_date' => '2099-01-01',
                'end_date' => '2099-01-01',
            ],
        ]));
        $amt = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('70'));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($items, $amt, $settings) {
            if (str_contains($sql, 'FROM recurring_items')) {
                return $items;
            }
            if (str_contains($sql, 'recurring_item_amounts')) {
                return $amt;
            }

            return $settings;
        });

        $t = ProjectionService::recurringTotalsForMonth($pdo, 1, 2099, 3);
        $this->assertGreaterThan(0, $t['expense']);

        $items2 = $this->stubStmt(fn ($s) => $s->method('fetchAll')->willReturn([
            [
                'id' => 1,
                'kind' => 'expense',
                'currency' => 'EUR',
                'amount_original' => 10,
                'default_amount_brl' => 60,
                'is_installment' => 0,
                'start_date' => null,
                'end_date' => null,
            ],
            [
                'id' => 2,
                'kind' => 'expense',
                'currency' => 'BRL',
                'amount_original' => null,
                'default_amount_brl' => 5,
                'is_installment' => 1,
                'start_date' => '2000-01-01',
                'end_date' => '2000-01-01',
            ],
        ]));
        $amtRows = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturnOnConsecutiveCalls(
            ['month' => 6, 'amount_brl' => 80],
            false,
            false
        ));
        $pdo2 = $this->createMock(PDO::class);
        $pdo2->method('query')->willReturn($info);
        $pdo2->method('prepare')->willReturnCallback(function (string $sql) use ($items2, $amtRows, $settings) {
            if (str_contains($sql, 'FROM recurring_items')) {
                return $items2;
            }
            if (str_contains($sql, 'recurring_item_amounts')) {
                return $amtRows;
            }

            return $settings;
        });

        $byMonth = ProjectionService::monthlyTotalsFromRecurring($pdo2, 1, 2099);
        $this->assertArrayHasKey(6, $byMonth);
        $this->assertGreaterThan(0, $byMonth[6]['expense']);

        // Current year → isBeforeCurrentMonth continue
        $y = (int) date('Y');
        $itemsPast = $this->stubStmt(fn ($s) => $s->method('fetchAll')->willReturn([[
            'id' => 1,
            'kind' => 'expense',
            'currency' => 'BRL',
            'amount_original' => null,
            'default_amount_brl' => 10,
            'is_installment' => 0,
            'start_date' => null,
            'end_date' => null,
        ]]));
        $amtPast = $this->stubStmt(fn ($s) => $s->method('fetch')->willReturn(false));
        $pdoPast = $this->createMock(PDO::class);
        $pdoPast->method('prepare')->willReturnCallback(function (string $sql) use ($itemsPast, $amtPast, $settings) {
            if (str_contains($sql, 'FROM recurring_items')) {
                return $itemsPast;
            }
            if (str_contains($sql, 'recurring_item_amounts')) {
                return $amtPast;
            }

            return $settings;
        });
        $past = ProjectionService::monthlyTotalsFromRecurring($pdoPast, 1, $y);
        $this->assertCount(12, $past);
    }

    // ─── InvestmentPortfolio EUR override ─────────────────────────────

    #[RunInSeparateProcess]
    #[PreserveGlobalState(false)]
    public function testInvestmentPortfolioEurOverrideContribution(): void
    {
        require __DIR__ . '/fixtures/fx_curl_stub.php';
        $m = new ReflectionMethod(InvestmentPortfolioService::class, 'monthlyContributionForType');

        $info = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn(false));
        $settings = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturn('6.0'));
        $items = $this->stubStmt(fn ($s) => $s->method('fetchAll')->willReturn([
            [
                'id' => 1,
                'currency' => 'EUR',
                'amount_original' => 10,
                'default_amount_brl' => 60,
            ],
            [
                'id' => 2,
                'currency' => 'BRL',
                'amount_original' => null,
                'default_amount_brl' => 20,
            ],
        ]));
        $amt = $this->stubStmt(fn ($s) => $s->method('fetchColumn')->willReturnOnConsecutiveCalls('70', '25'));

        $pdo = $this->createMock(PDO::class);
        $pdo->method('query')->willReturn($info);
        $pdo->method('prepare')->willReturnCallback(function (string $sql) use ($items, $amt, $settings) {
            if (str_contains($sql, 'FROM recurring_items')) {
                return $items;
            }
            if (str_contains($sql, 'recurring_item_amounts')) {
                return $amt;
            }

            return $settings;
        });

        $total = $m->invoke(null, $pdo, 1, 3, 2099, 5);
        $this->assertGreaterThan(0, $total);
    }
}
