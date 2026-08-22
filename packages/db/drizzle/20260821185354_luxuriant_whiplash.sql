CREATE TABLE IF NOT EXISTS "recommendation_ai" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"clase_id" uuid,
	"recommendation_type" varchar(20) NOT NULL,
	"reason" text NOT NULL,
	"source_ai" varchar(100) DEFAULT 'openai-compatible' NOT NULL,
	"effectiveness_score" numeric DEFAULT '0',
	"status" varchar(20) DEFAULT 'pending',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_ai_type_check" CHECK ("recommendation_ai"."recommendation_type" in ('refuerzo', 'avance'))
);
--> statement-breakpoint
ALTER TABLE "evaluation_attempts" ADD COLUMN "answers" jsonb;--> statement-breakpoint
ALTER TABLE "evaluation_attempts" ADD COLUMN "status" varchar(20) DEFAULT 'in_progress' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recommendation_ai" ADD CONSTRAINT "recommendation_ai_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recommendation_ai" ADD CONSTRAINT "recommendation_ai_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recommendation_ai" ADD CONSTRAINT "recommendation_ai_clase_id_lessons_id_fk" FOREIGN KEY ("clase_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recommendation_ai_user_idx" ON "recommendation_ai" USING btree ("user_id");