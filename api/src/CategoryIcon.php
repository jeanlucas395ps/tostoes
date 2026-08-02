<?php

declare(strict_types=1);

namespace Gastos\Api;

final class CategoryIcon
{
    public const DEFAULT = 'pin';

    /** @var list<string> */
    public const ALLOWED = [
        'shopping-cart', 'beef', 'house', 'car', 'smartphone', 'banknote', 'credit-card',
        'utensils', 'zap', 'droplets', 'tv', 'clapperboard', 'music', 'pill', 'heart-pulse',
        'plane', 'graduation-cap', 'baby', 'paw-print', 'shopping-bag', 'wrench',
        'clipboard-list', 'landmark', 'briefcase', 'gift', 'wine', 'coffee', 'bus',
        'shield', 'package', 'star', 'pin', 'dumbbell',
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
        return self::matchIcon($name) ?? self::DEFAULT;
    }

    public static function resolveForItem(
        ?string $categoryName,
        ?string $categoryIcon,
        ?string $itemName
    ): string {
        $cat = self::normalize($categoryIcon, $categoryName ?? '');
        if ($cat !== self::DEFAULT) {
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
            [['talho', 'açougue', 'acougue', 'carn'], 'beef'],
            [['mercado', 'supermerc'], 'shopping-cart'],
            [['alimenta', 'restaur', 'lazer'], 'utensils'],
            [['moradia', 'aluguel', 'apartamento', 'condom', 'arrend', 'lucila'], 'house'],
            [['transporte', 'uber', 'combust', 'gasolina', 'metro'], 'car'],
            [['assinatura', 'netflix', 'spotify', 'crunch', 'apple', 'drive', 'cursor', 'claude'], 'smartphone'],
            [['telecomunic', 'internet', 'vivo', 'cel '], 'smartphone'],
            [['cartão', 'cartao', 'credito', 'crédito', 'itau', 'itáu', 'santander', 'nubank'], 'credit-card'],
            [['salário', 'salario', 'ordenado'], 'banknote'],
            [['recebimento', 'rendimento', 'coders', 'odontoprev', 'odont'], 'banknote'],
            [['reembolso'], 'banknote'],
            [['extra'], 'gift'],
            [['invest', 'reserva', 'capitaliza'], 'landmark'],
            [['luz', 'energia', 'eletric'], 'zap'],
            [['água', 'agua'], 'droplets'],
            [['imposto', 'das', 'cau', 'conselho'], 'clipboard-list'],
            [['serviço', 'servico', 'contador'], 'wrench'],
            [['trabalho', 'tech'], 'briefcase'],
            [['exerc', 'ginásio', 'ginasio', 'fitness', 'pilates', 'yoga', 'musculação', 'musculacao'], 'dumbbell'],
            [['saúde', 'saude', 'convênio', 'convenio', 'academia'], 'heart-pulse'],
            [['beleza', 'manicure', 'fotos'], 'shopping-bag'],
            [['outros'], 'package'],
        ];

        foreach ($rules as [$keywords, $key]) {
            foreach ($keywords as $kw) {
                if (str_contains($n, $kw)) {
                    return $key;
                }
            }
        }

        return null;
    }

    /** @return list<array{icon: string, label: string}> */
    public static function catalog(): array
    {
        $labels = [
            'shopping-cart' => 'Mercado',
            'beef' => 'Talho',
            'house' => 'Moradia',
            'car' => 'Transporte',
            'smartphone' => 'Assinaturas / telecom',
            'banknote' => 'Salário / receita',
            'credit-card' => 'Cartão',
            'utensils' => 'Alimentação / lazer',
            'zap' => 'Energia / luz',
            'droplets' => 'Água',
            'tv' => 'TV / streaming',
            'clapperboard' => 'Cinema',
            'music' => 'Música',
            'pill' => 'Farmácia',
            'heart-pulse' => 'Saúde',
            'plane' => 'Viagem',
            'graduation-cap' => 'Educação',
            'baby' => 'Família',
            'paw-print' => 'Pets',
            'shopping-bag' => 'Compras / beleza',
            'wrench' => 'Serviços',
            'clipboard-list' => 'Impostos / taxas',
            'landmark' => 'Investimento / banco',
            'briefcase' => 'Trabalho / tech',
            'gift' => 'Extra / presente',
            'wine' => 'Bebidas',
            'coffee' => 'Café',
            'bus' => 'Transporte público',
            'shield' => 'Seguros',
            'package' => 'Outros',
            'star' => 'Favorito',
            'pin' => 'Geral',
            'dumbbell' => 'Exercícios / fitness',
        ];

        $out = [];
        foreach (self::ALLOWED as $icon) {
            $out[] = ['icon' => $icon, 'label' => $labels[$icon] ?? $icon];
        }

        return $out;
    }
}
