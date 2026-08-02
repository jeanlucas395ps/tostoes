-- 026: iconografia Lucide (chaves em vez de emoji)
-- Amplia a coluna e converte valores legados.

ALTER TABLE planning_item_categories
  MODIFY COLUMN icon VARCHAR(32) NOT NULL DEFAULT 'pin';

UPDATE planning_item_categories SET icon = 'shopping-cart' WHERE icon = '🛒';
UPDATE planning_item_categories SET icon = 'beef' WHERE icon = '🥩';
UPDATE planning_item_categories SET icon = 'house' WHERE icon = '🏠';
UPDATE planning_item_categories SET icon = 'car' WHERE icon = '🚗';
UPDATE planning_item_categories SET icon = 'smartphone' WHERE icon = '📱';
UPDATE planning_item_categories SET icon = 'banknote' WHERE icon = '💰';
UPDATE planning_item_categories SET icon = 'credit-card' WHERE icon = '💳';
UPDATE planning_item_categories SET icon = 'utensils' WHERE icon IN ('🍽️', '🍽');
UPDATE planning_item_categories SET icon = 'zap' WHERE icon = '⚡';
UPDATE planning_item_categories SET icon = 'droplets' WHERE icon = '💡';
UPDATE planning_item_categories SET icon = 'tv' WHERE icon = '📺';
UPDATE planning_item_categories SET icon = 'clapperboard' WHERE icon = '🎬';
UPDATE planning_item_categories SET icon = 'music' WHERE icon = '🎵';
UPDATE planning_item_categories SET icon = 'pill' WHERE icon = '💊';
UPDATE planning_item_categories SET icon = 'heart-pulse' WHERE icon = '🏥';
UPDATE planning_item_categories SET icon = 'plane' WHERE icon = '✈️';
UPDATE planning_item_categories SET icon = 'graduation-cap' WHERE icon = '🎓';
UPDATE planning_item_categories SET icon = 'baby' WHERE icon = '👶';
UPDATE planning_item_categories SET icon = 'paw-print' WHERE icon = '🐾';
UPDATE planning_item_categories SET icon = 'shopping-bag' WHERE icon IN ('🛍️', '🛍');
UPDATE planning_item_categories SET icon = 'wrench' WHERE icon = '🔧';
UPDATE planning_item_categories SET icon = 'clipboard-list' WHERE icon = '📋';
UPDATE planning_item_categories SET icon = 'landmark' WHERE icon = '🏦';
UPDATE planning_item_categories SET icon = 'briefcase' WHERE icon = '💼';
UPDATE planning_item_categories SET icon = 'gift' WHERE icon = '🎁';
UPDATE planning_item_categories SET icon = 'wine' WHERE icon = '🍷';
UPDATE planning_item_categories SET icon = 'coffee' WHERE icon = '☕';
UPDATE planning_item_categories SET icon = 'bus' WHERE icon = '🚌';
UPDATE planning_item_categories SET icon = 'shield' WHERE icon IN ('🛡️', '🛡');
UPDATE planning_item_categories SET icon = 'package' WHERE icon = '📦';
UPDATE planning_item_categories SET icon = 'star' WHERE icon = '⭐';
UPDATE planning_item_categories SET icon = 'pin' WHERE icon = '📌';
UPDATE planning_item_categories SET icon = 'dumbbell' WHERE icon = '💪';
