
-- =============== ENUMS ===============
create type public.workspace_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.column_kind as enum ('text','status','people','date','timeline','number','formula','link');
create type public.view_kind as enum ('table','kanban','calendar','workload');

-- =============== PROFILES ===============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);
create policy "profiles self-insert"
  on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles self-update"
  on public.profiles for update to authenticated using (auth.uid() = id);

-- Auto-create profile row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at helper
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- =============== WORKSPACES ===============
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  color text not null default '#6366f1',
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.workspaces to authenticated;
grant all on public.workspaces to service_role;
alter table public.workspaces enable row level security;
create trigger workspaces_touch before update on public.workspaces for each row execute function public.touch_updated_at();

-- =============== WORKSPACE MEMBERS ===============
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
grant select, insert, update, delete on public.workspace_members to authenticated;
grant all on public.workspace_members to service_role;
alter table public.workspace_members enable row level security;

-- security-definer membership/role helpers (avoid recursion)
create or replace function public.is_member(_ws uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.workspace_members where workspace_id = _ws and user_id = _user);
$$;

create or replace function public.has_ws_role(_ws uuid, _user uuid, _roles public.workspace_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.workspace_members
    where workspace_id = _ws and user_id = _user and role = any(_roles)
  );
$$;

-- workspaces policies
create policy "ws select for members"
  on public.workspaces for select to authenticated
  using (public.is_member(id, auth.uid()));
create policy "ws insert by signed-in"
  on public.workspaces for insert to authenticated
  with check (owner_id = auth.uid());
create policy "ws update by admins/owners"
  on public.workspaces for update to authenticated
  using (public.has_ws_role(id, auth.uid(), array['owner','admin']::public.workspace_role[]));
create policy "ws delete by owner"
  on public.workspaces for delete to authenticated
  using (owner_id = auth.uid());

-- members policies
create policy "members select if member"
  on public.workspace_members for select to authenticated
  using (public.is_member(workspace_id, auth.uid()));
create policy "members insert by admins or self-join-as-owner"
  on public.workspace_members for insert to authenticated
  with check (
    public.has_ws_role(workspace_id, auth.uid(), array['owner','admin']::public.workspace_role[])
    or (user_id = auth.uid() and exists(select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()))
  );
create policy "members update by admins"
  on public.workspace_members for update to authenticated
  using (public.has_ws_role(workspace_id, auth.uid(), array['owner','admin']::public.workspace_role[]));
create policy "members delete by admins or self"
  on public.workspace_members for delete to authenticated
  using (
    public.has_ws_role(workspace_id, auth.uid(), array['owner','admin']::public.workspace_role[])
    or user_id = auth.uid()
  );

-- After creating a workspace, the owner must be added as a member (owner role)
create or replace function public.add_workspace_owner_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_members(workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;
create trigger workspaces_add_owner after insert on public.workspaces
  for each row execute function public.add_workspace_owner_member();

-- =============== BOARDS ===============
create table public.boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  icon text default 'Layout',
  color text not null default '#6366f1',
  position double precision not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.boards to authenticated;
grant all on public.boards to service_role;
alter table public.boards enable row level security;
create trigger boards_touch before update on public.boards for each row execute function public.touch_updated_at();
create index boards_workspace_idx on public.boards(workspace_id);

create policy "boards select members"
  on public.boards for select to authenticated using (public.is_member(workspace_id, auth.uid()));
create policy "boards write members+"
  on public.boards for insert to authenticated
  with check (public.has_ws_role(workspace_id, auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "boards update members+"
  on public.boards for update to authenticated
  using (public.has_ws_role(workspace_id, auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "boards delete admins"
  on public.boards for delete to authenticated
  using (public.has_ws_role(workspace_id, auth.uid(), array['owner','admin']::public.workspace_role[]));

-- security definer to find workspace from a board id (used by nested tables' policies to keep them simple)
create or replace function public.board_workspace(_board uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select workspace_id from public.boards where id = _board;
$$;

-- =============== GROUPS ===============
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null default 'New Group',
  color text not null default '#64748b',
  position double precision not null default 0,
  collapsed boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.groups to authenticated;
grant all on public.groups to service_role;
alter table public.groups enable row level security;
create index groups_board_idx on public.groups(board_id);

create policy "groups select members" on public.groups for select to authenticated
  using (public.is_member(public.board_workspace(board_id), auth.uid()));
create policy "groups write members+" on public.groups for insert to authenticated
  with check (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "groups update members+" on public.groups for update to authenticated
  using (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "groups delete members+" on public.groups for delete to authenticated
  using (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));

-- =============== BOARD COLUMNS ===============
create table public.board_columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  kind public.column_kind not null,
  title text not null,
  settings jsonb not null default '{}'::jsonb,
  position double precision not null default 0,
  width integer not null default 160,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.board_columns to authenticated;
grant all on public.board_columns to service_role;
alter table public.board_columns enable row level security;
create index board_columns_board_idx on public.board_columns(board_id);

create policy "cols select members" on public.board_columns for select to authenticated
  using (public.is_member(public.board_workspace(board_id), auth.uid()));
create policy "cols write members+" on public.board_columns for insert to authenticated
  with check (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "cols update members+" on public.board_columns for update to authenticated
  using (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "cols delete admins" on public.board_columns for delete to authenticated
  using (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin']::public.workspace_role[]));

-- =============== ITEMS ===============
create table public.items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  parent_item_id uuid references public.items(id) on delete cascade,
  title text not null default 'New item',
  position double precision not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.items to authenticated;
grant all on public.items to service_role;
alter table public.items enable row level security;
create trigger items_touch before update on public.items for each row execute function public.touch_updated_at();
create index items_board_idx on public.items(board_id);
create index items_group_idx on public.items(group_id);
create index items_parent_idx on public.items(parent_item_id);

create policy "items select members" on public.items for select to authenticated
  using (public.is_member(public.board_workspace(board_id), auth.uid()));
create policy "items write members+" on public.items for insert to authenticated
  with check (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "items update members+" on public.items for update to authenticated
  using (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "items delete members+" on public.items for delete to authenticated
  using (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));

-- =============== ITEM VALUES ===============
create table public.item_values (
  item_id uuid not null references public.items(id) on delete cascade,
  column_id uuid not null references public.board_columns(id) on delete cascade,
  text_value text,
  number_value numeric,
  date_value date,
  date_end_value date,
  link_url text,
  link_label text,
  status_option_id text,
  people_user_ids uuid[],
  updated_at timestamptz not null default now(),
  primary key (item_id, column_id)
);
grant select, insert, update, delete on public.item_values to authenticated;
grant all on public.item_values to service_role;
alter table public.item_values enable row level security;
create index item_values_col_idx on public.item_values(column_id);

create or replace function public.item_workspace(_item uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select public.board_workspace(board_id) from public.items where id = _item;
$$;

create policy "values select members" on public.item_values for select to authenticated
  using (public.is_member(public.item_workspace(item_id), auth.uid()));
create policy "values write members+" on public.item_values for insert to authenticated
  with check (public.has_ws_role(public.item_workspace(item_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "values update members+" on public.item_values for update to authenticated
  using (public.has_ws_role(public.item_workspace(item_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "values delete members+" on public.item_values for delete to authenticated
  using (public.has_ws_role(public.item_workspace(item_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));

-- =============== BOARD VIEWS ===============
create table public.board_views (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  kind public.view_kind not null,
  name text not null,
  settings jsonb not null default '{}'::jsonb,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.board_views to authenticated;
grant all on public.board_views to service_role;
alter table public.board_views enable row level security;
create index board_views_board_idx on public.board_views(board_id);

create policy "views select members" on public.board_views for select to authenticated
  using (public.is_member(public.board_workspace(board_id), auth.uid()));
create policy "views write members+" on public.board_views for insert to authenticated
  with check (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "views update members+" on public.board_views for update to authenticated
  using (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "views delete members+" on public.board_views for delete to authenticated
  using (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));

-- =============== COMMENTS ===============
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
grant select, insert, update, delete on public.comments to authenticated;
grant all on public.comments to service_role;
alter table public.comments enable row level security;
create index comments_item_idx on public.comments(item_id);

create policy "comments select members" on public.comments for select to authenticated
  using (public.is_member(public.item_workspace(item_id), auth.uid()));
create policy "comments insert members+" on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.has_ws_role(public.item_workspace(item_id), auth.uid(), array['owner','admin','member']::public.workspace_role[])
  );
create policy "comments update self" on public.comments for update to authenticated using (author_id = auth.uid());
create policy "comments delete self/admin" on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.has_ws_role(public.item_workspace(item_id), auth.uid(), array['owner','admin']::public.workspace_role[]));

-- =============== ITEM ACTIVITY ===============
create table public.item_activity (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.item_activity to authenticated;
grant all on public.item_activity to service_role;
alter table public.item_activity enable row level security;
create index item_activity_item_idx on public.item_activity(item_id);

create policy "activity select members" on public.item_activity for select to authenticated
  using (public.is_member(public.item_workspace(item_id), auth.uid()));
create policy "activity insert members+" on public.item_activity for insert to authenticated
  with check (public.has_ws_role(public.item_workspace(item_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));

-- =============== NOTIFICATIONS ===============
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create index notifications_user_idx on public.notifications(user_id, read_at);

create policy "notifs self select" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifs self update" on public.notifications for update to authenticated using (user_id = auth.uid());
create policy "notifs self delete" on public.notifications for delete to authenticated using (user_id = auth.uid());

-- =============== FORMS ===============
create table public.forms (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  slug text not null unique,
  title text not null,
  description text,
  fields jsonb not null default '[]'::jsonb,
  is_published boolean not null default false,
  redirect_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.forms to authenticated;
grant select on public.forms to anon;
grant all on public.forms to service_role;
alter table public.forms enable row level security;
create index forms_board_idx on public.forms(board_id);

create policy "forms select members" on public.forms for select to authenticated
  using (public.is_member(public.board_workspace(board_id), auth.uid()));
create policy "forms public read published" on public.forms for select to anon using (is_published = true);
create policy "forms write members+" on public.forms for insert to authenticated
  with check (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "forms update members+" on public.forms for update to authenticated
  using (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "forms delete admins" on public.forms for delete to authenticated
  using (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin']::public.workspace_role[]));

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  payload jsonb not null,
  submitted_at timestamptz not null default now()
);
grant select on public.form_submissions to authenticated;
grant all on public.form_submissions to service_role;
alter table public.form_submissions enable row level security;
create policy "submissions select members" on public.form_submissions for select to authenticated
  using (exists(select 1 from public.forms f where f.id = form_id and public.is_member(public.board_workspace(f.board_id), auth.uid())));

-- =============== AUTOMATIONS ===============
create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null default 'New automation',
  trigger jsonb not null,
  actions jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.automation_rules to authenticated;
grant all on public.automation_rules to service_role;
alter table public.automation_rules enable row level security;
create index automation_rules_board_idx on public.automation_rules(board_id);

create policy "auto select members" on public.automation_rules for select to authenticated
  using (public.is_member(public.board_workspace(board_id), auth.uid()));
create policy "auto write admins" on public.automation_rules for insert to authenticated
  with check (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin']::public.workspace_role[]));
create policy "auto update admins" on public.automation_rules for update to authenticated
  using (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin']::public.workspace_role[]));
create policy "auto delete admins" on public.automation_rules for delete to authenticated
  using (public.has_ws_role(public.board_workspace(board_id), auth.uid(), array['owner','admin']::public.workspace_role[]));

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  status text not null,
  error text,
  ran_at timestamptz not null default now()
);
grant select on public.automation_runs to authenticated;
grant all on public.automation_runs to service_role;
alter table public.automation_runs enable row level security;
create policy "runs select members" on public.automation_runs for select to authenticated
  using (exists(select 1 from public.automation_rules r where r.id = rule_id and public.is_member(public.board_workspace(r.board_id), auth.uid())));

-- =============== DASHBOARDS ===============
create table public.dashboards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null default 'Dashboard',
  layout jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.dashboards to authenticated;
grant all on public.dashboards to service_role;
alter table public.dashboards enable row level security;

create policy "dash select members" on public.dashboards for select to authenticated
  using (public.is_member(workspace_id, auth.uid()));
create policy "dash write members+" on public.dashboards for insert to authenticated
  with check (public.has_ws_role(workspace_id, auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "dash update members+" on public.dashboards for update to authenticated
  using (public.has_ws_role(workspace_id, auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "dash delete admins" on public.dashboards for delete to authenticated
  using (public.has_ws_role(workspace_id, auth.uid(), array['owner','admin']::public.workspace_role[]));

create table public.dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboards(id) on delete cascade,
  kind text not null,
  settings jsonb not null default '{}'::jsonb,
  position jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.dashboard_widgets to authenticated;
grant all on public.dashboard_widgets to service_role;
alter table public.dashboard_widgets enable row level security;

create or replace function public.dashboard_workspace(_dash uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select workspace_id from public.dashboards where id = _dash;
$$;

create policy "widgets select members" on public.dashboard_widgets for select to authenticated
  using (public.is_member(public.dashboard_workspace(dashboard_id), auth.uid()));
create policy "widgets write members+" on public.dashboard_widgets for insert to authenticated
  with check (public.has_ws_role(public.dashboard_workspace(dashboard_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "widgets update members+" on public.dashboard_widgets for update to authenticated
  using (public.has_ws_role(public.dashboard_workspace(dashboard_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));
create policy "widgets delete members+" on public.dashboard_widgets for delete to authenticated
  using (public.has_ws_role(public.dashboard_workspace(dashboard_id), auth.uid(), array['owner','admin','member']::public.workspace_role[]));

-- =============== REALTIME ===============
alter publication supabase_realtime add table public.items;
alter publication supabase_realtime add table public.item_values;
alter publication supabase_realtime add table public.groups;
alter publication supabase_realtime add table public.board_columns;
alter publication supabase_realtime add table public.comments;
