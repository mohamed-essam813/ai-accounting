-- Allow 0% rates to be classified as zero-rated (taxable at 0%) vs exempt (outside VAT scope) for compliance / reporting.

alter table tax_rates
  add column if not exists vat_supply_treatment text not null default 'standard';

alter table tax_rates
  drop constraint if exists tax_rates_vat_supply_treatment_check;

alter table tax_rates
  add constraint tax_rates_vat_supply_treatment_check
  check (vat_supply_treatment in ('standard', 'zero_rated', 'exempt'));

comment on column tax_rates.vat_supply_treatment is
  'standard: VAT at percentage; zero_rated: 0% taxable supply; exempt: not in VAT reporting scope.';
