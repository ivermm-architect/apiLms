ALTER TABLE "courses" ADD COLUMN "academic_year" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courses_academic_year_idx" ON "courses" USING btree ("academic_year");