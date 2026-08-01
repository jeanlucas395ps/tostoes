<?php

declare(strict_types=1);

namespace Gastos\Api\Tests\Unit;

use Gastos\Api\CategoryIcon;
use PHPUnit\Framework\TestCase;

final class CategoryIconTest extends TestCase
{
    public function testSuggestForNameKnownKeywords(): void
    {
        $this->assertSame('🛒', CategoryIcon::suggestForName('Mercado'));
        $this->assertSame('💳', CategoryIcon::suggestForName('Cartão de crédito'));
        $this->assertSame('🏠', CategoryIcon::suggestForName('Aluguel'));
        $this->assertSame('💪', CategoryIcon::suggestForName('Exercícios'));
    }

    public function testSuggestForNameUnknownFallsBack(): void
    {
        $this->assertSame('📌', CategoryIcon::suggestForName('xyzzy-unknown-cat-999'));
    }

    public function testNormalizeKeepsAllowed(): void
    {
        $this->assertSame('🛒', CategoryIcon::normalize('🛒'));
    }

    public function testNormalizeInvalidSuggestsFromName(): void
    {
        $this->assertSame('💳', CategoryIcon::normalize('🚫', 'Nubank cartão'));
    }

    public function testResolveForItemUsesItemNameWhenCategoryGeneric(): void
    {
        $icon = CategoryIcon::resolveForItem('Geral', null, 'Netflix assinatura');
        $this->assertSame('📱', $icon);
    }

    public function testCatalogNotEmpty(): void
    {
        $opts = CategoryIcon::catalog();
        $this->assertNotEmpty($opts);
        $this->assertArrayHasKey('icon', $opts[0]);
        $this->assertArrayHasKey('label', $opts[0]);
    }
}
