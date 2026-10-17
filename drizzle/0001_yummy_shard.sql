CREATE TABLE `share_links` (
	`token` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`last_viewed_at` text,
	`view_count` integer DEFAULT 0 NOT NULL
);
