
-- 1. workspace_integrations
CREATE TABLE public.workspace_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('tess')),
  target_board_id uuid REFERENCES public.boards(id) ON DELETE SET NULL,
  tess_base_url text,
  tess_workspace_id text,
  shared_secret text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_integrations TO authenticated;
GRANT ALL ON public.workspace_integrations TO service_role;

ALTER TABLE public.workspace_integrations ENABLE ROW LEVEL SECURITY;

-- Owners can do everything (including read the secret)
CREATE POLICY "ws integrations owners all"
  ON public.workspace_integrations FOR ALL
  TO authenticated
  USING (public.has_ws_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role]))
  WITH CHECK (public.has_ws_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role]));

CREATE TRIGGER workspace_integrations_touch
  BEFORE UPDATE ON public.workspace_integrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. item_external_refs
CREATE TABLE public.item_external_refs (
  item_id uuid PRIMARY KEY REFERENCES public.items(id) ON DELETE CASCADE,
  source text NOT NULL,
  external_id text NOT NULL,
  external_kind text,
  external_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

GRANT SELECT ON public.item_external_refs TO authenticated;
GRANT ALL ON public.item_external_refs TO service_role;

ALTER TABLE public.item_external_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item refs read by ws members"
  ON public.item_external_refs FOR SELECT
  TO authenticated
  USING (public.is_member(public.item_workspace(item_id), auth.uid()));

-- 3. integration_dispatches
CREATE TABLE public.integration_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('outbound','inbound')),
  payload jsonb NOT NULL,
  status_code int,
  error text,
  attempts int NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.integration_dispatches TO authenticated;
GRANT ALL ON public.integration_dispatches TO service_role;

ALTER TABLE public.integration_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatches read by owners"
  ON public.integration_dispatches FOR SELECT
  TO authenticated
  USING (public.has_ws_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role]));

CREATE TRIGGER integration_dispatches_touch
  BEFORE UPDATE ON public.integration_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. boards.embed_token
ALTER TABLE public.boards ADD COLUMN embed_token text UNIQUE;
