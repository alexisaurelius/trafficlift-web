-- Enable RLS on Supabase-exposed tables.
-- With RLS enabled and no anon/authenticated policies, PostgREST access is denied by default.

ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CreditLedger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuditCheck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Audit" ENABLE ROW LEVEL SECURITY;

-- Defense in depth: explicitly remove Data API role grants from Prisma migration metadata.
REVOKE ALL ON TABLE public."_prisma_migrations" FROM anon, authenticated;
