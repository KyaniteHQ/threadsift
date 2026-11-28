INSERT INTO `topics` (`id`, `key`, `name`) VALUES (1, 'alpha', 'Alpha'), (2, 'beta', 'Beta'), (3, 'gamma', 'Gamma');
INSERT INTO `items` (`id`, `source`, `kind`, `normalized_url`, `original_url`, `saved_at`, `topic_id`) VALUES
  (1, 'other', 'link', 'https://example.com/1', 'https://example.com/1', 1, 1),
  (2, 'other', 'link', 'https://example.com/2', 'https://example.com/2', 2, 1),
  (3, 'other', 'link', 'https://example.com/3', 'https://example.com/3', 3, 2),
  (4, 'other', 'link', 'https://example.com/4', 'https://example.com/4', 4, 3),
  (5, 'other', 'link', 'https://example.com/5', 'https://example.com/5', 5, null),
  (6, 'other', 'link', 'https://example.com/6', 'https://example.com/6', 6, 2),
  (7, 'other', 'link', 'https://example.com/7', 'https://example.com/7', 7, 3);
INSERT INTO `jobs` (`kind`, `item_id`, `address`, `state`, `attempts`, `stale_requeues`, `next_attempt_at`, `claim_expires`) VALUES
  ('topic_overview', 1, 'https://example.com/1', 'queued', 0, 0, 0, null),
  ('topic_overview', 3, 'https://example.com/3', 'running', 1, 0, 0, 9999999999999),
  ('topic_overview', 5, 'https://example.com/5', 'queued', 0, 0, 0, null),
  ('topic_overview', 2, 'https://example.com/2', 'done', 1, 0, 0, null),
  ('fetch', 6, 'https://example.com/6', 'queued', 0, 0, 0, null),
  ('digest', 4, 'https://example.com/4', 'done', 1, 0, 0, null);
INSERT INTO `jobs` (`id`, `kind`, `item_id`, `address`, `state`, `attempts`, `stale_requeues`, `next_attempt_at`) VALUES
  (100, 'fetch', 7, 'https://example.com/7', 'done', 1, 0, 0);
DELETE FROM `items` WHERE `id` = 7;
