ALTER TABLE "users" ADD COLUMN "cohort_year" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_cohort_year_idx" ON "users" USING btree ("cohort_year");