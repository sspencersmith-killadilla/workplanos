
-- 1. board_kpis
CREATE TABLE public.board_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  name text NOT NULL,
  metric text NOT NULL CHECK (metric IN ('count_items','sum_column','avg_column','count_with_status')),
  column_id uuid REFERENCES public.board_columns(id) ON DELETE SET NULL,
  status_column_id uuid REFERENCES public.board_columns(id) ON DELETE SET NULL,
  status_option_id text,
  target numeric NOT NULL DEFAULT 0,
  unit text,
  period text NOT NULL DEFAULT 'all_time' CHECK (period IN ('all_time','month','quarter','year')),
  position integer NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_kpis TO authenticated;
GRANT ALL ON public.board_kpis TO service_role;
ALTER TABLE public.board_kpis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kpis read by ws members" ON public.board_kpis FOR SELECT TO authenticated
  USING (public.is_member(public.board_workspace(board_id), auth.uid()));
CREATE POLICY "kpis write by ws admins" ON public.board_kpis FOR ALL TO authenticated
  USING (public.has_ws_role(public.board_workspace(board_id), auth.uid(), ARRAY['owner','admin']::workspace_role[]))
  WITH CHECK (public.has_ws_role(public.board_workspace(board_id), auth.uid(), ARRAY['owner','admin']::workspace_role[]));
CREATE TRIGGER board_kpis_touch BEFORE UPDATE ON public.board_kpis FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. board_external_assignees
CREATE TABLE public.board_external_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_external_assignees TO authenticated;
GRANT ALL ON public.board_external_assignees TO service_role;
ALTER TABLE public.board_external_assignees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ext assignees read by ws members" ON public.board_external_assignees FOR SELECT TO authenticated
  USING (public.is_member(public.board_workspace(board_id), auth.uid()));
CREATE POLICY "ext assignees write by ws admins" ON public.board_external_assignees FOR ALL TO authenticated
  USING (public.has_ws_role(public.board_workspace(board_id), auth.uid(), ARRAY['owner','admin']::workspace_role[]))
  WITH CHECK (public.has_ws_role(public.board_workspace(board_id), auth.uid(), ARRAY['owner','admin']::workspace_role[]));
CREATE TRIGGER board_external_assignees_touch BEFORE UPDATE ON public.board_external_assignees FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. people_external_ids on item_values
ALTER TABLE public.item_values
  ADD COLUMN IF NOT EXISTS people_external_ids uuid[];
