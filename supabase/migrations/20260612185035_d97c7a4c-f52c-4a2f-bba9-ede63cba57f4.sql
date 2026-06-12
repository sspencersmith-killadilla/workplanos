
ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.items  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS boards_active_idx ON public.boards(workspace_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS items_active_idx  ON public.items(board_id) WHERE archived_at IS NULL;
