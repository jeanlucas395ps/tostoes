<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\CategoryIcon;
use PHPUnit\Framework\TestCase;

final class CategoryIconTest extends TestCase
{
    public function testSuggestForNameKnownKeywords(): void
    {
        $this->assertSame('shopping-cart', CategoryIcon::suggestForName('Mercado'));
        $this->assertSame('credit-card', CategoryIcon::suggestForName('Cartão de crédito'));
        $this->assertSame('house', CategoryIcon::suggestForName('Aluguel'));
        $this->assertSame('dumbbell', CategoryIcon::suggestForName('Exercícios'));
    }

    public function testSuggestForNameUnknownFallsBack(): void
    {
        $this->assertSame('pin', CategoryIcon::suggestForName('xyzzy-unknown-cat-999'));
    }

    public function testNormalizeKeepsAllowed(): void
    {
        $this->assertSame('shopping-cart', CategoryIcon::normalize('shopping-cart'));
    }

    public function testNormalizeInvalidSuggestsFromName(): void
    {
        $this->assertSame('credit-card', CategoryIcon::normalize('🚫', 'Nubank cartão'));
    }

    public function testResolveForItemUsesItemNameWhenCategoryGeneric(): void
    {
        $icon = CategoryIcon::resolveForItem('Geral', null, 'Netflix assinatura');
        $this->assertSame('smartphone', $icon);
    }

    public function testCatalogNotEmpty(): void
    {
        $opts = CategoryIcon::catalog();
        $this->assertNotEmpty($opts);
        $this->assertArrayHasKey('icon', $opts[0]);
        $this->assertArrayHasKey('label', $opts[0]);
        $this->assertSame('shopping-cart', $opts[0]['icon']);
    }
}
