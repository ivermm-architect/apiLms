CREATE TABLE IF NOT EXISTS "course_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"created_by" uuid,
	"title" varchar(200) NOT NULL,
	"description" text,
	"max_score" numeric(5, 2) DEFAULT '100' NOT NULL,
	"weight" numeric(3, 2) DEFAULT '1' NOT NULL,
	"due_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grades" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_activities" ADD CONSTRAINT "course_activities_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_activities" ADD CONSTRAINT "course_activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_activities_course_idx" ON "course_activities" USING btree ("course_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "grades" ADD CONSTRAINT "grades_activity_id_course_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."course_activities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grades_activity_idx" ON "grades" USING btree ("activity_id");