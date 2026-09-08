CREATE TABLE IF NOT EXISTS "course_grade_weights" (
	"course_id" uuid PRIMARY KEY NOT NULL,
	"exam_weight" numeric(5, 2) DEFAULT '40' NOT NULL,
	"practice_weight" numeric(5, 2) DEFAULT '30' NOT NULL,
	"activity_weight" numeric(5, 2) DEFAULT '30' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_activities" ADD COLUMN "category" varchar(20) DEFAULT 'actividad' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "course_grade_weights" ADD CONSTRAINT "course_grade_weights_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
