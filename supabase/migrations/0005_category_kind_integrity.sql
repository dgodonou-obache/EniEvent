-- =============================================================================
-- 0005 — Une sous-catégorie ne peut pas contredire la nature de sa famille.
--
-- En 0003, `parent_id` pointait simplement `categories(id)` : rien n'empêchait
-- de ranger « Traiteur » (service) sous « Lieux » (venue). Comme `listings`
-- hérite sa nature de sa catégorie, une telle incohérence aurait fait
-- apparaître des traiteurs dans le filtre « capacité d'accueil ».
--
-- Même remède que pour les rôles et les annonces : une clé étrangère composite
-- rend l'état incohérent inexprimable, plutôt que de le rattraper par un
-- déclencheur ou une revue de code.
-- =============================================================================

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'categories'
    and con.contype = 'f'
    and con.confrelid = rel.oid
    and con.conkey = array[
      (select attnum from pg_attribute
        where attrelid = rel.oid and attname = 'parent_id')
    ]::smallint[];

  if constraint_name is not null then
    execute format('alter table categories drop constraint %I', constraint_name);
  end if;
end
$$;

alter table categories
  add constraint categories_parent_kind_fkey
  foreign key (parent_id, kind) references categories (id, kind) on delete restrict;
