-- Store tax rate as decimal (0.05 for 5%) per feedback doc
-- Add rate column, backfill from percentage. App uses rate for storage, exposes percentage (rate * 100) for display.

alter table tax_rates
  add column if not exists rate numeric(6, 4) check (rate >= 0 and rate <= 1);

update tax_rates
set rate = percentage / 100
where rate is null and percentage is not null;

alter table tax_rates alter column rate set not null;

comment on column tax_rates.rate is 'Tax rate as decimal (e.g. 0.05 for 5%). Source of truth.';
