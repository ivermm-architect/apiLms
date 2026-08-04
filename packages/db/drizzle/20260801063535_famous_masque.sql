ALTER TABLE "users" ADD COLUMN "document_id" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "student_code" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_document_id_idx" ON "users" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_student_code_idx" ON "users" USING btree ("student_code");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_document_id_unique" UNIQUE("document_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_student_code_unique" UNIQUE("student_code");