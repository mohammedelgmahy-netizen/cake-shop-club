-- Cake Shop — سجل النسخ الاحتياطي والاسترجاع (Backup & Restore). محتوى النسخة نفسه بيتنزل على جهاز صاحب المحل.
create table if not exists cakeshop.mc_backups (
  id bigserial primary key,
  kind text not null default 'backup' check (kind in ('backup', 'restore')),
  created_at timestamptz not null default now(),
  created_by text not null default '',
  note text not null default '',
  size_bytes bigint not null default 0,
  tables_count integer not null default 0,
  rows_count integer not null default 0,
  checksum text not null default ''
);
alter table cakeshop.mc_backups enable row level security;
revoke all on cakeshop.mc_backups from anon, authenticated;
revoke all on sequence cakeshop.mc_backups_id_seq from anon, authenticated;
