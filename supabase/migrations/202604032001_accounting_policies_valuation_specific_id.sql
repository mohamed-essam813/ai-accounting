-- Allow specific identification alongside FIFO and weighted average (company settings alignment).

alter table public.accounting_policies
  drop constraint if exists accounting_policies_inventory_valuation_method_check;

alter table public.accounting_policies
  add constraint accounting_policies_inventory_valuation_method_check
  check (inventory_valuation_method in ('fifo', 'weighted_average', 'specific_identification'));
