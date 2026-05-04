-- UNO ONCHAIN — PostgreSQL schema
--
-- Run: psql $DATABASE_URL -f schema.sql
-- Requires: pgcrypto (for gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address       VARCHAR(66) NOT NULL,
    chain         VARCHAR(20) NOT NULL,
    chain_type    VARCHAR(10) NOT NULL,
    username      VARCHAR(30),
    games_played  INT DEFAULT 0,
    games_won     INT DEFAULT 0,
    total_earned  NUMERIC(38, 18) DEFAULT 0,
    total_wagered NUMERIC(38, 18) DEFAULT 0,
    elo_rating    INT DEFAULT 1000,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE(address, chain)
);

CREATE INDEX IF NOT EXISTS idx_users_address ON users(address);
CREATE INDEX IF NOT EXISTS idx_users_elo     ON users(elo_rating DESC);

CREATE TABLE IF NOT EXISTS games (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escrow_game_id      VARCHAR(66),
    chain               VARCHAR(20) NOT NULL,
    mode                VARCHAR(10) NOT NULL CHECK (mode IN ('ai', 'pvp')),
    buy_in              NUMERIC(38, 18) DEFAULT 0,
    total_pool          NUMERIC(38, 18) DEFAULT 0,
    platform_fee        NUMERIC(38, 18) DEFAULT 0,
    winner_payout       NUMERIC(38, 18) DEFAULT 0,
    winner_id           UUID REFERENCES users(id),
    status              VARCHAR(20) DEFAULT 'waiting',
    max_players         INT NOT NULL,
    settlement_tx_hash  VARCHAR(130),
    started_at          TIMESTAMP,
    finished_at         TIMESTAMP,
    created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_games_status   ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_winner   ON games(winner_id);
CREATE INDEX IF NOT EXISTS idx_games_chain    ON games(chain);

CREATE TABLE IF NOT EXISTS game_players (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id           UUID REFERENCES games(id) ON DELETE CASCADE,
    user_id           UUID REFERENCES users(id),
    seat_index        INT NOT NULL,
    final_card_count  INT,
    final_score       INT,
    deposit_tx_hash   VARCHAR(130),
    created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_players_game ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players(user_id);

CREATE TABLE IF NOT EXISTS game_actions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id      UUID REFERENCES games(id) ON DELETE CASCADE,
    user_id      UUID REFERENCES users(id),
    action_type  VARCHAR(20) NOT NULL,
    card_id      VARCHAR(40),
    chosen_color VARCHAR(10),
    timestamp    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_actions_game ON game_actions(game_id, timestamp);

CREATE TABLE IF NOT EXISTS leaderboard (
    user_id    UUID REFERENCES users(id),
    chain      VARCHAR(20) NOT NULL,
    period     VARCHAR(10) NOT NULL CHECK (period IN ('daily', 'weekly', 'alltime')),
    wins       INT DEFAULT 0,
    earnings   NUMERIC(38, 18) DEFAULT 0,
    elo        INT DEFAULT 1000,
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, chain, period)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_period_earnings
    ON leaderboard(period, earnings DESC);
