-- One row per member per UTC day. Later snapshots on the same day overwrite it.
CREATE TABLE power_snapshots (
  governor_id       BIGINT      NOT NULL,
  snapshot_date     DATE        NOT NULL,
  nick_name         TEXT,
  power             BIGINT      NOT NULL,
  town_center_level INTEGER,
  kills             BIGINT,
  alliance_rank     INTEGER,
  captured_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (governor_id, snapshot_date)
);

CREATE INDEX power_snapshots_date_idx ON power_snapshots (snapshot_date);
