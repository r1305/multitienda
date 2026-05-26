-- Run once on production MySQL for high-traffic workloads
-- mysql -u USER -p DATABASE < deploy/mysql-indexes.sql

ALTER TABLE orders ADD INDEX idx_orders_status_created (orderstatus_id, created_at);
ALTER TABLE orders ADD INDEX idx_orders_user_created (user_id, created_at);
ALTER TABLE orders ADD INDEX idx_orders_restaurant_created (restaurant_id, created_at);

ALTER TABLE ratings ADD INDEX idx_ratings_restaurant (restaurant_id);

ALTER TABLE delivery_guy_details ADD INDEX idx_delivery_guy_user (user_id);

ALTER TABLE accept_deliveries ADD INDEX idx_accept_order (order_id);
ALTER TABLE accept_deliveries ADD INDEX idx_accept_user (user_id);

ALTER TABLE favorites ADD INDEX idx_favorites_user_type (user_id, favoriteable_type);
ALTER TABLE favorites ADD INDEX idx_favorites_lookup (user_id, favoriteable_id, favoriteable_type);

ALTER TABLE items ADD INDEX idx_items_restaurant_active (restaurant_id, is_active);

ALTER TABLE push_tokens ADD INDEX idx_push_tokens_user (user_id);

ALTER TABLE delivery_ignored_orders ADD INDEX idx_ignored_user (user_id);
