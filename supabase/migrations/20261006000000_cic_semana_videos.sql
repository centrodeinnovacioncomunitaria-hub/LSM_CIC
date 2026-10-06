-- CIC · Segunda migración: satélites, «Mi semana» de cada emprendedora y videos de la plataforma.
-- Se ejecuta DESPUÉS de 20260928000000_cic_acceso.sql (Supabase → SQL Editor → Run).
-- No contiene datos personales: la asignación de satélites del equipo está en privado_NO_SUBIR/asignar_satelites.sql.

-- ---------------------------------------------------------------- Satélites
-- Identificadores (los mismos de herramientas/Datos.pm y assets/datos-cic.js)
create table if not exists public.satelites (
  id           text primary key,
  codigo       text not null unique,
  nombre       text not null,
  departamento text not null,
  municipios   text[] not null
);
insert into public.satelites (id, codigo, nombre, departamento, municipios) values
  ('la-guajira',   'GUA', 'La Guajira',   'La Guajira', array['Riohacha', 'Albania']),
  ('magdalena',    'MAG', 'Magdalena',    'Magdalena',  array['Santa Marta']),
  ('valledupar',   'VAL', 'Valledupar',   'Cesar',      array['Valledupar']),
  ('pueblo-bello', 'PBE', 'Pueblo Bello', 'Cesar',      array['Pueblo Bello']),
  ('atlantico',    'ATL', 'Atlántico',    'Atlántico',  array['Baranoa', 'Campo de la Cruz']),
  ('bolivar',      'BOL', 'Bolívar',      'Bolívar',    array['Cartagena', 'María la Baja']),
  ('sucre',        'SUC', 'Sucre',        'Sucre',      array['Sincelejo', 'Tolú']),
  ('cordoba',      'COR', 'Córdoba',      'Córdoba',    array['Montería', 'Tierralta'])
on conflict (id) do update set codigo = excluded.codigo, nombre = excluded.nombre, departamento = excluded.departamento, municipios = excluded.municipios;
alter table public.satelites enable row level security;
drop policy if exists "satelites visibles" on public.satelites;
create policy "satelites visibles" on public.satelites for select to anon, authenticated using (true);
grant select on public.satelites to anon, authenticated;

-- ---------------------------------------------------------------- Nuevas columnas
alter table public.directorio add column if not exists satelite text references public.satelites (id);
alter table public.perfiles   add column if not exists satelite text references public.satelites (id);
alter table public.perfiles   add column if not exists semana_actual smallint not null default 1 check (semana_actual between 1 and 6);
alter table public.perfiles   add column if not exists dinamizadora_cedula text references public.directorio (cedula);

-- Las emprendedoras ya inscritas toman su satélite a partir del municipio
update public.perfiles p set satelite = s.id
from public.satelites s
where p.satelite is null and p.rol = 'emprendedora' and p.municipio = any (s.municipios);

-- ---------------------------------------------------------------- Funciones de apoyo
create or replace function public.cic_mi_satelite() returns text
language sql stable security definer set search_path = public as $$
  select satelite from public.perfiles where id = auth.uid()
$$;
revoke execute on function public.cic_mi_satelite() from public, anon;
grant execute on function public.cic_mi_satelite() to authenticated;

-- La dinamizadora de la emprendedora que pregunta: la asignada, o la de acompañamiento de su satélite.
-- Devuelve solo nombre, cargo y celular (para el botón de WhatsApp de «Mi semana»).
create or replace function public.mi_dinamizadora()
returns table (nombre text, cargo text, celular text)
language sql stable security definer set search_path = public as $$
  select d.nombre, d.cargo, d.celular
  from public.perfiles p
  join public.directorio d on d.cedula = coalesce(
    p.dinamizadora_cedula,
    (select x.cedula from public.directorio x
      where x.rol = 'dinamizadora' and x.satelite = p.satelite and x.cargo ilike '%acompa%'
      order by x.cedula limit 1))
  where p.id = auth.uid()
$$;
revoke execute on function public.mi_dinamizadora() from public, anon;
grant execute on function public.mi_dinamizadora() to authenticated;

-- La dinamizadora (de su departamento) o la Secretaría cambian la semana en que va una emprendedora.
create or replace function public.fijar_semana(p_cedula text, p_semana smallint)
returns void
language plpgsql security definer set search_path = public as $$
declare
  yo public.perfiles%rowtype;
begin
  select * into yo from public.perfiles where id = auth.uid();
  if yo.id is null or yo.rol not in ('dinamizadora', 'secretaria') then
    raise exception 'Solo el equipo del CIC puede cambiar la semana.';
  end if;
  if p_semana not between 1 and 6 then
    raise exception 'La semana debe estar entre 1 y 6.';
  end if;
  update public.perfiles set semana_actual = p_semana
  where cedula = p_cedula and rol = 'emprendedora'
    and (yo.rol = 'secretaria' or departamento = yo.departamento);
  if not found then
    raise exception 'No encontramos a esa emprendedora en tu departamento.';
  end if;
end
$$;
revoke execute on function public.fijar_semana(text, smallint) from public, anon;
grant execute on function public.fijar_semana(text, smallint) to authenticated;

-- ---------------------------------------------------------------- Videos (YouTube «no listado», ver GUIA_VIDEOS.md)
create table if not exists public.videos (
  codigo       text primary key check (codigo ~ '^(GES-M[1-5]|HAC-S[1-6]|SER-T[1-4]|GRAB-SER[1-4]-[A-Z]{3,5}-[0-9]{8})$'),
  titulo       text not null,
  youtube_id   text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  duracion_min smallint check (duracion_min between 1 and 300),
  audiencia    text not null check (audiencia in ('equipo', 'emprendedoras')),
  curso        text not null check (curso in ('gestion', 'acompanar-hacer', 'facilitar-ser', 'grabaciones')),
  unidad       smallint not null check (unidad between 1 and 6),
  satelite     text references public.satelites (id),
  fecha        date,
  creado_por   uuid default auth.uid() references auth.users (id),
  creado_en    timestamptz not null default now()
);
alter table public.videos enable row level security;

-- Quién ve qué: el equipo ve los videos de sus cursos; cada emprendedora, las grabaciones generales y las de su satélite.
drop policy if exists "ver videos" on public.videos;
create policy "ver videos" on public.videos for select to authenticated using (
  public.cic_mi_rol() in ('secretaria', 'dinamizadora')
  or (audiencia = 'emprendedoras' and (satelite is null or satelite = public.cic_mi_satelite()))
);
-- Solo la Secretaría Técnica publica, cambia o quita videos.
drop policy if exists "secretaria publica videos" on public.videos;
create policy "secretaria publica videos" on public.videos for all to authenticated
  using (public.cic_mi_rol() = 'secretaria') with check (public.cic_mi_rol() = 'secretaria');

revoke all on public.videos from anon;
grant select, insert, update, delete on public.videos to authenticated;
