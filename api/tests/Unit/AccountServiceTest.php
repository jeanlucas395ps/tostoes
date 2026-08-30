<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\Services\AccountService;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class AccountServiceTest extends TestCase
{
    public function testIsTransferInflow(): void
    {
        $this->assertTrue(AccountService::isTransferInflow([
            'kind' => 'transfer',
            'notes' => 'Transferência ← Nubank (#12)',
        ]));
        $this->assertFalse(AccountService::isTransferInflow([
            'kind' => 'transfer',
            'notes' => 'Transferência → Nubank (#12)',
        ]));
        $this->assertFalse(AccountService::isTransferInflow([
            'kind' => 'expense',
            'notes' => 'Transferência ← X',
        ]));
    }

    #[DataProvider('bankBalanceProvider')]
    public function testApplyTxToBalanceBank(
        float $start,
        array $row,
        float $amt,
        float $expected
    ): void {
        $this->assertSame(
            $expected,
            AccountService::applyTxToBalance($start, $row, $amt, false)
        );
    }

    /** @return list<array{0: float, 1: array<string, mixed>, 2: float, 3: float}> */
    public static function bankBalanceProvider(): array
    {
        return [
            'income' => [100.0, ['kind' => 'income'], 50.0, 150.0],
            'expense' => [100.0, ['kind' => 'expense'], 30.0, 70.0],
            'leisure' => [100.0, ['kind' => 'leisure'], 20.0, 80.0],
            'investment out' => [100.0, ['kind' => 'investment'], 40.0, 60.0],
            'transfer out' => [
                100.0,
                ['kind' => 'transfer', 'notes' => 'Transferência → XP'],
                25.0,
                75.0,
            ],
            'transfer in' => [
                100.0,
                ['kind' => 'transfer', 'notes' => 'Transferência ← Banco'],
                25.0,
                125.0,
            ],
            'unknown kind' => [100.0, ['kind' => 'other'], 10.0, 100.0],
        ];
    }

    #[DataProvider('creditBalanceProvider')]
    public function testApplyTxToBalanceCredit(
        float $start,
        array $row,
        float $amt,
        float $expected
    ): void {
        $this->assertSame(
            $expected,
            AccountService::applyTxToBalance($start, $row, $amt, true)
        );
    }

    /** @return list<array{0: float, 1: array<string, mixed>, 2: float, 3: float}> */
    public static function creditBalanceProvider(): array
    {
        return [
            'purchase increases debt' => [1000.0, ['kind' => 'expense'], 200.0, 1200.0],
            'leisure increases debt' => [500.0, ['kind' => 'leisure'], 50.0, 550.0],
            'payment reduces debt' => [1000.0, ['kind' => 'income'], 300.0, 700.0],
            'transfer out increases debt' => [
                800.0,
                ['kind' => 'transfer', 'notes' => 'Transferência → Outro'],
                100.0,
                900.0,
            ],
            'transfer in pays card' => [
                800.0,
                ['kind' => 'transfer', 'notes' => 'Transferência ← Banco'],
                100.0,
                700.0,
            ],
        ];
    }

    public function testBalanceToBrl(): void
    {
        $this->assertSame(100.0, AccountService::balanceToBrl(100.0, 'BRL', 6.2));
        $this->assertSame(62.0, AccountService::balanceToBrl(10.0, 'EUR', 6.2));
    }

    public function testResolveAccountCdiFallsBackToPlanning(): void
    {
        $settings = $this->createMock(\PDOStatement::class);
        $settings->method('execute');
        $settings->method('fetchColumn')->willReturn('0.0095');

        $pdo = $this->createMock(\PDO::class);
        $pdo->method('prepare')->willReturn($settings);

        $rate = AccountService::resolveAccountCdiMonthlyRate($pdo, 1, [
            'type' => 'investment',
            'cdi_monthly_rate' => null,
        ]);
        $this->assertSame(0.0095, $rate);
    }

    public function testResolveAccountCdiUsesOverride(): void
    {
        $pdo = $this->createMock(\PDO::class);
        $pdo->expects($this->never())->method('prepare');

        $rate = AccountService::resolveAccountCdiMonthlyRate($pdo, 1, [
            'type' => 'investment',
            'cdi_monthly_rate' => 0.02,
        ]);
        $this->assertSame(0.02, $rate);
    }

    #[DataProvider('txAmountProvider')]
    public function testTxAmountInAccountCurrency(
        array $row,
        string $accountCurrency,
        float $fallback,
        float $expected
    ): void {
        $this->assertSame(
            $expected,
            AccountService::txAmountInAccountCurrency($row, $accountCurrency, $fallback)
        );
    }

    /** @return list<array{0: array<string, mixed>, 1: string, 2: float, 3: float}> */
    public static function txAmountProvider(): array
    {
        return [
            'same currency BRL' => [
                ['currency' => 'BRL', 'amount' => 40.5, 'amount_brl' => 40.5],
                'BRL',
                6.2,
                40.5,
            ],
            'same currency EUR' => [
                ['currency' => 'EUR', 'amount' => 10.0, 'amount_brl' => 62.0, 'eur_to_brl' => 6.2],
                'EUR',
                6.0,
                10.0,
            ],
            'tx EUR to account BRL' => [
                ['currency' => 'EUR', 'amount' => 10.0, 'amount_brl' => 62.0, 'eur_to_brl' => 6.2],
                'BRL',
                6.0,
                62.0,
            ],
            'tx BRL to account EUR' => [
                ['currency' => 'BRL', 'amount' => 62.0, 'amount_brl' => 62.0, 'eur_to_brl' => 6.2],
                'EUR',
                6.2,
                10.0,
            ],
            'fallback rate' => [
                ['currency' => 'BRL', 'amount' => 31.0, 'amount_brl' => 31.0],
                'EUR',
                6.2,
                5.0,
            ],
        ];
    }
}
