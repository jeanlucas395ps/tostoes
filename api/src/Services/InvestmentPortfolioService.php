<?php

declare(strict_types=1);

namespace Gastos\Api\Services;

use PDO;

/**
 * Saldo atual por tipo de investimento e projeção do próximo mês (CDI + aportes fixos).
 * CDI mensal: por conta de investimento (opcional) com fallback em planning_settings.
 */
final class InvestmentPortfolioService
{
    /** @return array{year: int, month: int, cdiMonthlyRate: float, items: list<array<string, mixed>>, totals: array<string, float>} */
    public static function portfolio(PDO $pdo, int $planningId, int $refYear, int $refMonth): array
    {
        $refMonth = max(1, min(12, $refMonth));
        [$nextYear, $nextMonth] = self::nextMonth($refYear, $refMonth);
        $settingsCdiRate = AccountService::planningCdiMonthlyRate($pdo, $planningId);

        $stmt = $pdo->prepare(
            'SELECT id, name, slug, color, target_monthly_brl, current_balance_brl
             FROM investment_types
             WHERE planning_id = ? AND is_active = 1
             ORDER BY sort_order, name'
        );
        $stmt->execute([$planningId]);

        $items = [];
        $totalBalance = 0.0;
        $totalGain = 0.0;
        $totalCdi = 0.0;
        $totalContribution = 0.0;

        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $typeId = (int) $row['id'];
            $slug = (string) $row['slug'];
            $cdiPercent = self::cdiPercentForSlug($slug);
            $resolved = self::resolveBalanceAndCdiYield(
                $pdo,
                $planningId,
                $typeId,
                (float) $row['current_balance_brl'],
                $settingsCdiRate,
                $cdiPercent
            );
            $balance = $resolved['balance'];
            $cdiYield = $resolved['cdiYield'];
            $contribution = self::monthlyContributionForType($pdo, $planningId, $typeId, $nextYear, $nextMonth);
            $projectedGain = round($cdiYield + $contribution, 2);

            $items[] = [
                'id' => $typeId,
                'name' => $row['name'],
                'slug' => $slug,
                'color' => $row['color'],
                'currentBalanceBrl' => $balance,
                'monthlyContributionBrl' => $contribution,
                'cdiPercent' => $cdiPercent,
                'cdiYieldBrl' => $cdiYield,
                'projectedGainBrl' => $projectedGain,
                'projectedBalanceBrl' => round($balance + $projectedGain, 2),
                'yieldsCdi' => $cdiPercent > 0,
                'effectiveCdiMonthlyRate' => $resolved['effectiveCdiMonthlyRate'],
            ];

            $totalBalance += $balance;
            $totalGain += $projectedGain;
            $totalCdi += $cdiYield;
            $totalContribution += $contribution;
        }

        return [
            'refYear' => $refYear,
            'refMonth' => $refMonth,
            'nextYear' => $nextYear,
            'nextMonth' => $nextMonth,
            'cdiMonthlyRate' => $settingsCdiRate,
            'items' => $items,
            'totals' => [
                'currentBalanceBrl' => round($totalBalance, 2),
                'projectedGainBrl' => round($totalGain, 2),
                'cdiYieldBrl' => round($totalCdi, 2),
                'monthlyContributionBrl' => round($totalContribution, 2),
            ],
        ];
    }

    /**
     * @return array{balance: float, cdiYield: float, effectiveCdiMonthlyRate: float}
     */
    private static function resolveBalanceAndCdiYield(
        PDO $pdo,
        int $planningId,
        int $typeId,
        float $storedBalance,
        float $settingsCdiRate,
        float $cdiPercent
    ): array {
        $accountIds = self::linkedAccountIds($pdo, $planningId, $typeId);
        if ($accountIds === []) {
            $yield = $cdiPercent > 0
                ? round(max(0, $storedBalance) * $settingsCdiRate * ($cdiPercent / 100), 2)
                : 0.0;

            return [
                'balance' => round(max(0, $storedBalance), 2),
                'cdiYield' => $yield,
                'effectiveCdiMonthlyRate' => $settingsCdiRate,
            ];
        }

        $fromAccounts = 0.0;
        $cdiYield = 0.0;
        $weightedRate = 0.0;

        foreach ($accountIds as $accountId) {
            $stmt = $pdo->prepare(
                'SELECT * FROM financial_accounts WHERE id = ? AND planning_id = ? AND active = 1'
            );
            $stmt->execute([$accountId, $planningId]);
            $account = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$account) {
                continue;
            }
            $accCurrency = (string) ($account['currency'] ?? 'BRL');
            $rate = \Gastos\Api\MoneyHelper::getFxFallback(
                $pdo,
                $planningId,
                $accCurrency === 'BRL' ? 'EUR' : $accCurrency
            );
            $bal = AccountService::computeBalance($pdo, $account, $rate);
            $balBrl = AccountService::balanceToBrl($bal, $accCurrency, $rate);
            if ($balBrl <= 0) {
                continue;
            }
            $fromAccounts += $balBrl;
            $accountCdi = AccountService::resolveAccountCdiMonthlyRate($pdo, $planningId, $account);
            $weightedRate += $balBrl * $accountCdi;
            if ($cdiPercent > 0) {
                $cdiYield += $balBrl * $accountCdi * ($cdiPercent / 100);
            }
        }

        if ($fromAccounts > 0) {
            return [
                'balance' => round($fromAccounts, 2),
                'cdiYield' => round($cdiYield, 2),
                'effectiveCdiMonthlyRate' => round($weightedRate / $fromAccounts, 6),
            ];
        }

        $yield = $cdiPercent > 0
            ? round(max(0, $storedBalance) * $settingsCdiRate * ($cdiPercent / 100), 2)
            : 0.0;

        return [
            'balance' => round(max(0, $storedBalance), 2),
            'cdiYield' => $yield,
            'effectiveCdiMonthlyRate' => $settingsCdiRate,
        ];
    }

    /** @return list<int> */
    private static function linkedAccountIds(PDO $pdo, int $planningId, int $typeId): array
    {
        $stmt = $pdo->prepare(
            'SELECT DISTINCT financial_account_id
             FROM recurring_items
             WHERE planning_id = ? AND investment_type_id = ? AND active = 1
               AND financial_account_id IS NOT NULL'
        );
        $stmt->execute([$planningId, $typeId]);
        $ids = [];
        while ($id = $stmt->fetchColumn()) {
            $ids[] = (int) $id;
        }

        return $ids;
    }

    private static function monthlyContributionForType(
        PDO $pdo,
        int $planningId,
        int $typeId,
        int $year,
        int $month
    ): float {
        $stmt = $pdo->prepare(
            'SELECT id, currency, amount_original, default_amount_brl
             FROM recurring_items
             WHERE planning_id = ? AND active = 1 AND kind = "investment"
               AND investment_type_id = ?'
        );
        $stmt->execute([$planningId, $typeId]);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
        if ($items === []) {
            $t = $pdo->prepare(
                'SELECT target_monthly_brl FROM investment_types WHERE id = ? AND planning_id = ?'
            );
            $t->execute([$typeId, $planningId]);
            $target = $t->fetchColumn();

            return $target !== false ? round((float) $target, 2) : 0.0;
        }

        $amtStmt = $pdo->prepare(
            'SELECT amount_brl FROM recurring_item_amounts WHERE recurring_item_id = ? AND month = ?'
        );
        $total = 0.0;
        foreach ($items as $item) {
            $amtStmt->execute([(int) $item['id'], $month]);
            $override = $amtStmt->fetchColumn();
            $currency = $item['currency'] ?? 'BRL';
            $original = $item['amount_original'] !== null
                ? (float) $item['amount_original']
                : (float) $item['default_amount_brl'];
            if ($override !== false) {
                $amount = (float) $override;
                if ($currency === 'EUR' || $currency === 'USD') {
                    $total += ProjectionService::amountInBrlForMonth(
                        $pdo,
                        $planningId,
                        $year,
                        $month,
                        $currency,
                        $original,
                        $amount
                    );
                } else {
                    $total += $amount;
                }
            } else {
                $total += ProjectionService::amountInBrlForMonth(
                    $pdo,
                    $planningId,
                    $year,
                    $month,
                    $currency,
                    $original,
                    null
                );
            }
        }

        return round($total, 2);
    }

    private static function cdiPercentForSlug(string $slug): float
    {
        if ($slug === 'capitalizacao') {
            return 0.0;
        }

        return 100.0;
    }

    /** @return array{0: int, 1: int} */
    private static function nextMonth(int $year, int $month): array
    {
        if ($month >= 12) {
            return [$year + 1, 1];
        }

        return [$year, $month + 1];
    }
}
