-- Verixo — Add finish_id to cabinets and estimate_items
-- Allows cabinets and estimate line items to be linked to a finish/material
-- record when a finish library is built out in a later phase.

alter table cabinets
  add column if not exists finish_id integer default null;

alter table estimate_items
  add column if not exists finish_id integer default null;
