
-- Phase 12: notification triggers

-- @mention trigger on comments
CREATE OR REPLACE FUNCTION public.notify_comment_mentions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_user_id uuid;
  v_ws uuid;
BEGIN
  v_ws := public.item_workspace(NEW.item_id);
  -- crude @email scan
  FOR v_email IN
    SELECT DISTINCT lower(m[1])
    FROM regexp_matches(NEW.body, '@([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})', 'g') AS m
  LOOP
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;
    IF v_user_id IS NOT NULL AND v_user_id <> NEW.author_id
      AND public.is_member(v_ws, v_user_id) THEN
      INSERT INTO public.notifications(user_id, kind, payload)
      VALUES (
        v_user_id,
        'mention',
        jsonb_build_object(
          'comment_id', NEW.id,
          'item_id', NEW.item_id,
          'workspace_id', v_ws,
          'author_id', NEW.author_id,
          'preview', left(NEW.body, 140)
        )
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_comment_mentions ON public.comments;
CREATE TRIGGER trg_notify_comment_mentions
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_comment_mentions();

-- Assignment trigger on item_values for people-type columns
CREATE OR REPLACE FUNCTION public.notify_people_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col record;
  v_old_ids uuid[];
  v_new_ids uuid[];
  v_added uuid;
  v_ws uuid;
  v_actor uuid;
BEGIN
  SELECT * INTO v_col FROM public.board_columns WHERE id = NEW.column_id;
  IF v_col.kind <> 'people' THEN
    RETURN NEW;
  END IF;
  v_ws := public.item_workspace(NEW.item_id);
  v_actor := auth.uid();

  -- value_json expected to be array of uuids
  BEGIN
    v_new_ids := ARRAY(SELECT (jsonb_array_elements_text(NEW.value_json))::uuid);
  EXCEPTION WHEN OTHERS THEN
    v_new_ids := ARRAY[]::uuid[];
  END;
  IF TG_OP = 'UPDATE' THEN
    BEGIN
      v_old_ids := ARRAY(SELECT (jsonb_array_elements_text(OLD.value_json))::uuid);
    EXCEPTION WHEN OTHERS THEN
      v_old_ids := ARRAY[]::uuid[];
    END;
  ELSE
    v_old_ids := ARRAY[]::uuid[];
  END IF;

  FOREACH v_added IN ARRAY v_new_ids LOOP
    IF NOT (v_added = ANY(v_old_ids)) AND v_added <> coalesce(v_actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications(user_id, kind, payload)
      VALUES (v_added, 'assigned', jsonb_build_object(
        'item_id', NEW.item_id,
        'workspace_id', v_ws,
        'actor_id', v_actor
      ));
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_people_assignment ON public.item_values;
CREATE TRIGGER trg_notify_people_assignment
  AFTER INSERT OR UPDATE ON public.item_values
  FOR EACH ROW EXECUTE FUNCTION public.notify_people_assignment();

-- Make sure items + workspace_invites have realtime if not already
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
