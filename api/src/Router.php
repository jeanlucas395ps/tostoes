<?php

declare(strict_types=1);

namespace Gastos\Api;

use Gastos\Api\Controllers\AccountController;
use Gastos\Api\Controllers\AiReportController;
use Gastos\Api\Controllers\AuthController;
use Gastos\Api\Controllers\DashboardController;
use Gastos\Api\Controllers\FxRateController;
use Gastos\Api\Controllers\GoalController;
use Gastos\Api\Controllers\InviteController;
use Gastos\Api\Controllers\InvestmentTypeController;
use Gastos\Api\Controllers\LedgerController;
use Gastos\Api\Controllers\MonthPlanController;
use Gastos\Api\Controllers\PlanningController;
use Gastos\Api\Controllers\PlanningTaxonomyController;
use Gastos\Api\Controllers\RecurringItemController;
use Gastos\Api\Controllers\ProfileController;
use Gastos\Api\Controllers\ProjectionController;
use Gastos\Api\Controllers\SettingsController;
use Gastos\Api\Controllers\TransactionController;

final class Router
{
    public static function dispatch(string $method, string $path): void
    {
        $path = rtrim($path, '/') ?: '/';

        if ($method === 'POST' && $path === '/auth/login') {
            AuthController::login();
        }
        if ($method === 'POST' && $path === '/auth/register') {
            AuthController::register();
        }
        if ($method === 'GET' && $path === '/auth/me') {
            AuthController::me();
        }
        if ($method === 'GET' && $path === '/auth/users') {
            AuthController::householdUsers();
        }
        if ($method === 'POST' && $path === '/auth/forgot-password') {
            AuthController::forgotPassword();
        }
        if ($method === 'POST' && $path === '/auth/reset-password') {
            AuthController::resetPassword();
        }
        if ($method === 'PATCH' && $path === '/auth/profile') {
            ProfileController::update();
        }
        if ($method === 'POST' && $path === '/auth/change-password') {
            ProfileController::changePassword();
        }
        if ($method === 'POST' && $path === '/auth/avatar') {
            ProfileController::uploadAvatar();
        }
        if (preg_match('#^/auth/avatars/(\d+)$#', $path, $m) && $method === 'GET') {
            ProfileController::avatar((int) $m[1]);
        }

        if ($method === 'GET' && $path === '/plannings') {
            PlanningController::index();
        }
        if ($method === 'POST' && $path === '/plannings') {
            PlanningController::store();
        }
        if (preg_match('#^/plannings/(\d+)$#', $path, $m)) {
            $planningId = (int) $m[1];
            if ($method === 'PUT') {
                PlanningController::update($planningId);
            }
            if ($method === 'DELETE') {
                PlanningController::destroy($planningId);
            }
        }
        if (preg_match('#^/plannings/(\d+)/members$#', $path, $m)) {
            $planningId = (int) $m[1];
            if ($method === 'GET') {
                PlanningController::members($planningId);
            }
        }
        if (preg_match('#^/plannings/(\d+)/invites$#', $path, $m) && $method === 'POST') {
            PlanningController::addMember((int) $m[1]);
        }

        if (preg_match('#^/invites/([a-f0-9]{64})$#', $path, $m)) {
            $token = $m[1];
            if ($method === 'GET') {
                InviteController::show($token);
            }
            if ($method === 'POST') {
                InviteController::accept($token);
            }
        }

        if ($method === 'GET' && $path === '/planning-taxonomy') {
            PlanningTaxonomyController::index();
        }
        if ($method === 'POST' && $path === '/planning-custom-tabs') {
            PlanningTaxonomyController::storeTab();
        }
        if (preg_match('#^/planning-custom-tabs/(\d+)$#', $path, $m)) {
            $id = (int) $m[1];
            if ($method === 'PUT') {
                PlanningTaxonomyController::updateTab($id);
            }
            if ($method === 'DELETE') {
                PlanningTaxonomyController::destroyTab($id);
            }
        }
        if ($method === 'POST' && $path === '/planning-item-categories') {
            PlanningTaxonomyController::storeCategory();
        }
        if (preg_match('#^/planning-item-categories/(\d+)$#', $path, $m)) {
            $id = (int) $m[1];
            if ($method === 'PUT') {
                PlanningTaxonomyController::updateCategory($id);
            }
            if ($method === 'DELETE') {
                PlanningTaxonomyController::destroyCategory($id);
            }
        }

        if ($method === 'GET' && $path === '/settings') {
            SettingsController::get();
        }
        if ($method === 'PUT' && $path === '/settings') {
            SettingsController::update();
        }

        if ($method === 'GET' && $path === '/fx/eur-brl') {
            FxRateController::eurToBrl();
        }
        if ($method === 'GET' && $path === '/fx/usd-brl') {
            FxRateController::usdToBrl();
        }

        if ($method === 'GET' && $path === '/dashboard/summary') {
            DashboardController::summary();
        }

        if ($method === 'GET' && $path === '/ai-reports') {
            AiReportController::index();
        }
        if ($method === 'POST' && $path === '/ai-reports') {
            AiReportController::store();
        }
        if (preg_match('#^/ai-reports/(\d+)$#', $path, $m)) {
            $id = (int) $m[1];
            if ($method === 'GET') {
                AiReportController::show($id);
            }
            if ($method === 'DELETE') {
                AiReportController::destroy($id);
            }
        }

        if ($method === 'GET' && $path === '/accounts/summary') {
            AccountController::summary();
        }
        if ($method === 'GET' && $path === '/accounts/flow-graph') {
            AccountController::flowGraph();
        }
        if ($method === 'GET' && $path === '/accounts') {
            AccountController::index();
        }
        if ($method === 'POST' && $path === '/accounts') {
            AccountController::store();
        }
        if (preg_match('#^/accounts/(\d+)$#', $path, $m)) {
            $id = (int) $m[1];
            if ($method === 'GET') {
                AccountController::show($id);
            }
            if ($method === 'PUT') {
                AccountController::update($id);
            }
            if ($method === 'DELETE') {
                AccountController::destroy($id);
            }
        }

        if ($method === 'GET' && $path === '/transactions') {
            TransactionController::index();
        }
        if ($method === 'POST' && $path === '/transactions') {
            TransactionController::store();
        }
        if (preg_match('#^/transactions/(\d+)/unconfirm$#', $path, $m) && $method === 'POST') {
            TransactionController::unconfirm((int) $m[1]);
        }
        if (preg_match('#^/transactions/(\d+)$#', $path, $m)) {
            $id = (int) $m[1];
            if ($method === 'PUT') {
                TransactionController::update($id);
            }
            if ($method === 'DELETE') {
                TransactionController::destroy($id);
            }
        }

        if ($method === 'GET' && $path === '/investment-types/portfolio') {
            InvestmentTypeController::portfolio();
        }
        if ($method === 'GET' && $path === '/investment-types') {
            InvestmentTypeController::index();
        }
        if ($method === 'POST' && $path === '/investment-types') {
            InvestmentTypeController::store();
        }
        if (preg_match('#^/investment-types/(\d+)$#', $path, $m) && $method === 'PUT') {
            InvestmentTypeController::update((int) $m[1]);
        }

        if ($method === 'GET' && $path === '/goals') {
            GoalController::index();
        }
        if ($method === 'POST' && $path === '/goals') {
            GoalController::store();
        }
        if (preg_match('#^/goals/(\d+)$#', $path, $m)) {
            $id = (int) $m[1];
            if ($method === 'PUT') {
                GoalController::update($id);
            }
            if ($method === 'DELETE') {
                GoalController::destroy($id);
            }
        }

        if ($method === 'GET' && $path === '/projections') {
            ProjectionController::index();
        }
        if ($method === 'POST' && $path === '/projections') {
            ProjectionController::store();
        }
        if (preg_match('#^/projections/(\d+)$#', $path, $m) && $method === 'DELETE') {
            ProjectionController::destroy((int) $m[1]);
        }

        if ($method === 'GET' && $path === '/ledger') {
            LedgerController::index();
        }

        if ($method === 'GET' && $path === '/recurring-items') {
            RecurringItemController::index();
        }
        if ($method === 'POST' && $path === '/recurring-items') {
            RecurringItemController::store();
        }
        if (preg_match('#^/recurring-items/(\d+)$#', $path, $m)) {
            $id = (int) $m[1];
            if ($method === 'PUT') {
                RecurringItemController::update($id);
            }
            if ($method === 'DELETE') {
                RecurringItemController::destroy($id);
            }
        }

        if ($method === 'POST' && $path === '/month-plan/spawn') {
            MonthPlanController::spawn();
        }
        if ($method === 'GET' && $path === '/month-plan') {
            MonthPlanController::index();
        }
        if ($method === 'POST' && $path === '/month-plan/regenerate') {
            MonthPlanController::regenerate();
        }
        if ($method === 'POST' && $path === '/month-plan') {
            MonthPlanController::store();
        }
        if (preg_match('#^/month-plan/(\d+)$#', $path, $m) && $method === 'PUT') {
            MonthPlanController::update((int) $m[1]);
        }
        if (preg_match('#^/month-plan/(\d+)/confirm$#', $path, $m) && $method === 'POST') {
            MonthPlanController::confirm((int) $m[1]);
        }
        if (preg_match('#^/month-plan/(\d+)/skip$#', $path, $m) && $method === 'POST') {
            MonthPlanController::skip((int) $m[1]);
        }
        if (preg_match('#^/month-plan/(\d+)/unconfirm$#', $path, $m) && $method === 'POST') {
            MonthPlanController::unconfirm((int) $m[1]);
        }
        if (preg_match('#^/month-plan/(\d+)$#', $path, $m) && $method === 'DELETE') {
            MonthPlanController::destroy((int) $m[1]);
        }

        Response::error('Rota não encontrada.', 404);
    }
}
