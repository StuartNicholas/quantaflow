-- Grant authenticated role DML access to cabinets.
-- RLS policies already restrict to company members — this just allows the role
-- to attempt the operation so RLS can evaluate.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE cabinets TO authenticated;

-- Same for the new qty column added in 20260726000001
-- (column-level grants inherit from table grant above, no extra steps needed)
