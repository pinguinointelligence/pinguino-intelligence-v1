-- FUNCTIONAL EQUIVALENCE (owner rule, 2026-09-03).
--
-- A country product does NOT have to match a reference specification. It has to
-- perform the same FUNCTION and then be calculated with its OWN real numbers.
-- 3.2% milk standing in for a 3.5% reference is correct; relabelling it 3.5% to
-- make the numbers tidy is not — that hides the difference from the Engine and
-- silently changes the recipe.
--
-- So the acceptance REASONING becomes data, not a note in someone's head: what
-- function the slot needs, how the chosen product differs, and why that is
-- acceptable. Admin renders these next to the real composition, so an operator
-- can audit a substitution instead of trusting it.
alter table public.country_local_products
  add column if not exists reference_function text,
  add column if not exists technical_difference text,
  add column if not exists acceptance_rationale text,
  add column if not exists catalog_product_id uuid,
  add column if not exists profile text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'country_local_products_profile_check') then
    alter table public.country_local_products
      add constraint country_local_products_profile_check
      check (profile is null or profile in ('GELATO','SORBET','VEGAN','PROTEIN'));
  end if;
end $$;

comment on column public.country_local_products.reference_function is
  'What the recipe needs from this slot (e.g. "fresh whole milk, ~3.5% fat, unsweetened"). Function, not brand.';
comment on column public.country_local_products.technical_difference is
  'How the chosen local product differs from the reference (e.g. "3.2% fat vs 3.5% reference").';
comment on column public.country_local_products.acceptance_rationale is
  'Why the difference is acceptable. The Engine calculates on the REAL values recorded here.';
