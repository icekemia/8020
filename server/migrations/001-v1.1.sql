CREATE TABLE IF NOT EXISTS presence (
 user_id BIGINT UNSIGNED PRIMARY KEY,
 seen_at BIGINT NOT NULL,
 available TINYINT NOT NULL DEFAULT 0,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
 INDEX online (seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_offers (
 match_id CHAR(32) PRIMARY KEY,
 target_id BIGINT UNSIGNED NULL,
 expires_at BIGINT NOT NULL,
 FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
 FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE,
 INDEX incoming (target_id, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rematches (
 match_id CHAR(32) PRIMARY KEY,
 requested_by BIGINT UNSIGNED NOT NULL,
 expires_at BIGINT NOT NULL,
 state VARCHAR(12) NOT NULL DEFAULT 'pending',
 next_id CHAR(32) NULL UNIQUE,
 FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
 FOREIGN KEY (requested_by) REFERENCES users(id),
 FOREIGN KEY (next_id) REFERENCES matches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
