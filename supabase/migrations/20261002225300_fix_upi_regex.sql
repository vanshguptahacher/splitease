-- Fix PostgreSQL regex quantifier max repetition count (max 255 in Postgres POSIX)
alter table public.profiles
  drop constraint if exists profiles_upi_format;

alter table public.profiles
  add constraint profiles_upi_format check (
    upi_id is null or upi_id ~ '^[a-z0-9._-]{2,255}@[a-z][a-z0-9.-]{1,63}$'
  );
