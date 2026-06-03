<?php

declare(strict_types=1);

namespace Gastos\Api;

final class CategoryIcon
{
    /** @var list<string> */
    public const ALLOWED = [
        '🛒', '🥩', '🏠', '🚗', '📱', '💰', '💳', '🍽️', '⚡', '💡', '📺', '🎬', '🎵',
        '💊', '🏥', '✈️', '🎓', '👶', '🐾',         '🛍️', '🔧', '📋', '🏦', '💼', '🎁', '🍷',
        '☕', '🚌', '🛡️', '📦', '⭐', '📌', '💪',
    ];

    public static function normalize(?string $icon, ?string $categoryName = null): string
    {
        $icon = trim((string) ($icon ?? ''));
        if ($icon !== '' && in_array($icon, self::ALLOWED, true)) {
            return $icon;
        }

        return self::suggestForName($categoryName ?? '');
    }

    public static function suggestForName(string $name): string
    {
        return self::matchIcon($name) ?? '📌';
    }

    public static function resolveForItem(
        ?string $categoryName,
        ?string $categoryIcon,
        ?string $itemName
    ): string {
        $cat = self::normalize($categoryIcon, $categoryName ?? '');
        if ($cat !== '📌') {
            return $cat;
        }
        if ($itemName !== null && trim($itemName) !== '') {
            $fromItem = self::matchIcon($itemName);
            if ($fromItem !== null) {
                return $fromItem;
            }
        }

        return $cat;
    }

    private static function matchIcon(string $text): ?string
    {
        $n = mb_strtolower(trim($text));
        if ($n === '') {
            return null;
        }

        $rules = [
            [['talho', 'açougue', 'acougue', 'carn'], '🥩'],
            [['mercado', 'supermerc'], '🛒'],
            [['alimenta', 'restaur', 'lazer'], '🍽️'],
            [['moradia', 'aluguel', 'apartamento', 'condom', 'arrend', 'lucila'], '🏠'],
            [['transporte', 'uber', 'combust', 'gasolina', 'metro'], '🚗'],
            [['assinatura', 'netflix', 'spotify', 'crunch', 'apple', 'drive', 'cursor', 'claude'], '📱'],
            [['telecomunic', 'internet', 'vivo', 'cel '], '📱'],
            [['cartão', 'cartao', 'credito', 'crédito', 'itau', 'itáu', 'santander', 'nubank'], '💳'],
            [['salário', 'salario', 'ordenado'], '💰'],
            [['recebimento', 'rendimento', 'coders', 'odontoprev', 'odont'], '💰'],
            [['reembolso'], '💰'],
            [['extra'], '🎁'],
            [['invest', 'reserva', 'capitaliza'], '🏦'],
            [['luz', 'energia', 'eletric'], '⚡'],
            [['água', 'agua'], '💡'],
            [['imposto', 'das', 'cau', 'conselho'], '📋'],
            [['serviço', 'servico', 'contador'], '🔧'],
            [['trabalho', 'tech'], '💼'],
            [['exerc', 'ginásio', 'ginasio', 'fitness', 'pilates', 'yoga', 'musculação', 'musculacao'], '💪'],
            [['saúde', 'saude', 'convênio', 'convenio', 'academia'], '🏥'],
            [['beleza', 'manicure', 'fotos'], '🛍️'],
            [['outros'], '📦'],
        ];

        foreach ($rules as [$keywords, $emoji]) {
            foreach ($keywords as $kw) {
                if (str_contains($n, $kw)) {
                    return $emoji;
                }
            }
        }

        return null;
    }

    /** @return list<array{icon: string, label: string}> */
    public static function catalog(): array
    {
        $labels = [
            '🛒' => 'Mercado',
            '🥩' => 'Talho',
            '🏠' => 'Moradia',
            '🚗' => 'Transporte',
            '📱' => 'Assinaturas / telecom',
            '💰' => 'Salário / receita',
            '💳' => 'Cartão',
            '🍽️' => 'Alimentação / lazer',
            '⚡' => 'Energia / luz',
            '💡' => 'Água',
            '🏥' => 'Saúde',
            '💪' => 'Exercícios / fitness',
            '📋' => 'Impostos / taxas',
            '🔧' => 'Serviços',
            '💼' => 'Trabalho / tech',
            '🏦' => 'Investimento / banco',
            '🛍️' => 'Compras / beleza',
            '🎁' => 'Extra / presente',
            '📦' => 'Outros',
            '📌' => 'Geral',
        ];

        $out = [];
        foreach (self::ALLOWED as $icon) {
            $out[] = ['icon' => $icon, 'label' => $labels[$icon] ?? $icon];
        }

        return $out;
    }
}
