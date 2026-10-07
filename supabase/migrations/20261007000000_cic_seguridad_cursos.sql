-- CIC · Tercera migración: acceso seguro con código de activación y progresión de los cursos del equipo.
-- Se ejecuta DESPUÉS de 20260928000000_cic_acceso.sql y 20261006000000_cic_semana_videos.sql.
-- No contiene datos personales ni respuestas: el banco de preguntas se carga aparte desde
-- privado_NO_SUBIR/banco_preguntas.sql (tiene la clave de respuestas y no se sube a GitHub).
--
-- Regla general: la página NUNCA escribe en estas tablas. Todo cambio pasa por la función cic-acceso,
-- que valida quién es la persona, si el paso está desbloqueado y califica los cuestionarios.

-- ================================================================ 1. Acceso seguro
-- Códigos de activación y recuperación (6 números, se guardan cifrados y vencen).
create table if not exists public.codigos_acceso (
  cedula     text primary key check (cedula ~ '^[0-9]{5,12}$'),
  hash       text not null,
  motivo     text not null check (motivo in ('activacion', 'recuperacion')),
  expira     timestamptz not null,
  intentos   smallint not null default 0,
  creado_por uuid references auth.users (id),
  creado_en  timestamptz not null default now()
);
alter table public.codigos_acceso enable row level security;
revoke all on public.codigos_acceso from anon, authenticated;

-- Intentos fallidos de ingreso por cédula: 5 fallos en 15 minutos bloquean esa cédula 15 minutos.
create table if not exists public.bloqueos_ingreso (
  cedula          text primary key,
  fallos          smallint not null default 0,
  ventana_desde   timestamptz not null default now(),
  bloqueado_hasta timestamptz
);
alter table public.bloqueos_ingreso enable row level security;
revoke all on public.bloqueos_ingreso from anon, authenticated;

-- ================================================================ 2. Cursos del equipo
-- Banco de preguntas (con la respuesta correcta). Nadie lo lee desde la página: solo la función.
create table if not exists public.preguntas (
  id        bigserial primary key,
  curso     text not null check (curso in ('gestion', 'acompanar-hacer', 'facilitar-ser')),
  unidad    smallint not null check (unidad between 1 and 6),
  n         smallint not null,
  enunciado text not null,
  opciones  jsonb not null,
  correcta  smallint not null,
  retro     text,
  unique (curso, unidad, n)
);
alter table public.preguntas enable row level security;
revoke all on public.preguntas from anon, authenticated;

-- Avance de cada persona en cada módulo, semana o taller.
create table if not exists public.progreso (
  persona      uuid not null references auth.users (id) on delete cascade,
  curso        text not null check (curso in ('gestion', 'formacion-secretaria', 'acompanar-hacer', 'facilitar-ser')),
  unidad       smallint not null check (unidad between 1 and 6),
  video_en     timestamptz,
  material_en  timestamptz,
  intentos     smallint not null default 0,
  ronda        smallint not null default 1,
  mejor_nota   smallint,
  aprobado_en  timestamptz,
  bloqueado_en timestamptz,          -- con valor: perdió los dos intentos y debe repasar video y material
  actualizado_en timestamptz not null default now(),
  primary key (persona, curso, unidad)
);
alter table public.progreso enable row level security;

-- Cada intento de cuestionario: guarda qué preguntas salieron para calificarlas en el servidor.
create table if not exists public.cuestionarios (
  id            uuid primary key default gen_random_uuid(),
  persona       uuid not null references auth.users (id) on delete cascade,
  curso         text not null,
  unidad        smallint not null,
  preguntas     bigint[] not null,
  respuestas    smallint[],
  nota          smallint,
  creado_en     timestamptz not null default now(),
  respondido_en timestamptz
);
alter table public.cuestionarios enable row level security;
revoke all on public.cuestionarios from anon, authenticated;

-- Evidencias: la actividad de cada módulo de Gestión y la verificación de cada sesión de HACER y SER.
create table if not exists public.evidencias (
  id           bigserial primary key,
  persona      uuid not null references auth.users (id) on delete cascade,
  curso        text not null,
  unidad       smallint not null,
  tipo         text not null check (tipo in ('actividad', 'verificacion')),
  texto        text check (char_length(texto) <= 4000),
  enlace       text check (enlace is null or enlace ~ '^https://'),
  estado       text not null default 'enviada' check (estado in ('enviada', 'aprobada', 'devuelta')),
  comentario   text check (char_length(comentario) <= 1000),
  revisado_por uuid references auth.users (id),
  creado_en    timestamptz not null default now(),
  revisado_en  timestamptz,
  unique (persona, curso, unidad, tipo)
);
alter table public.evidencias enable row level security;

-- Hitos que marca la persona (compromiso) o la Secretaría Técnica (transferencias).
create table if not exists public.hitos (
  persona    uuid not null references auth.users (id) on delete cascade,
  hito       text not null check (hito in ('compromiso', 'transferencia-hacer', 'transferencia-ser')),
  fecha      timestamptz not null default now(),
  marcado_por uuid references auth.users (id),
  primary key (persona, hito)
);
alter table public.hitos enable row level security;

-- Constancias con código verificable.
create table if not exists public.constancias (
  codigo    text primary key,
  persona   uuid not null references auth.users (id) on delete cascade,
  curso     text not null,
  nombre    text not null,
  emitida_en timestamptz not null default now(),
  unique (persona, curso)
);
alter table public.constancias enable row level security;

-- Quién ve qué: cada persona su propio avance; la Secretaría Técnica, el de todo el equipo.
do $$
declare t text;
begin
  foreach t in array array['progreso', 'evidencias', 'hitos', 'constancias'] loop
    execute format('drop policy if exists "ver lo propio" on public.%I', t);
    execute format('create policy "ver lo propio" on public.%I for select to authenticated using (persona = auth.uid())', t);
    execute format('drop policy if exists "secretaria ve el equipo" on public.%I', t);
    execute format('create policy "secretaria ve el equipo" on public.%I for select to authenticated using (public.cic_mi_rol() = ''secretaria'')', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ================================================================ 3. Material de estudio privado
-- Bucket privado: los archivos solo se entregan con enlaces temporales que firma la función,
-- y únicamente si el módulo está desbloqueado. Estructura: <curso>/<unidad>/archivo y <curso>/general/archivo.
insert into storage.buckets (id, name, public)
values ('material-equipo', 'material-equipo', false)
on conflict (id) do update set public = false;

-- La cédula deja de servir como contraseña inicial: las cuentas pendientes se activan con código.
comment on column public.perfiles.debe_cambiar_clave is
  'Solo cuentas creadas antes de la migración 20261007: la contraseña aún es la cédula y deben cambiarla.';
