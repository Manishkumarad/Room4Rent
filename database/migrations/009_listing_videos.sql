CREATE TABLE IF NOT EXISTS listing_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_videos_listing_id ON listing_videos(listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_videos_primary ON listing_videos(listing_id, is_primary DESC, sort_order ASC, created_at ASC);
