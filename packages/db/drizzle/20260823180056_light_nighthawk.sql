DROP TABLE "competency_progress" CASCADE;--> statement-breakpoint
DROP TABLE "ability_estimates" CASCADE;--> statement-breakpoint
DROP TABLE "bkt_states" CASCADE;--> statement-breakpoint
DROP TABLE "item_irt_params" CASCADE;--> statement-breakpoint
ALTER TABLE "evaluation_attempts" DROP COLUMN IF EXISTS "answers";--> statement-breakpoint
ALTER TABLE "evaluation_attempts" DROP COLUMN IF EXISTS "status";--> statement-breakpoint
ALTER TABLE "public"."evaluation_questions" ALTER COLUMN "difficulty" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."evaluations" ALTER COLUMN "difficulty" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."evaluation_questions" ALTER COLUMN "difficulty" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."evaluations" ALTER COLUMN "difficulty" SET DATA TYPE text;--> statement-breakpoint
UPDATE "public"."evaluation_questions" SET "difficulty" = 'medium' WHERE "difficulty" = 'adaptive';--> statement-breakpoint
UPDATE "public"."evaluations" SET "difficulty" = 'medium' WHERE "difficulty" = 'adaptive';--> statement-breakpoint
DROP TYPE "public"."difficulty_level";--> statement-breakpoint
CREATE TYPE "public"."difficulty_level" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
ALTER TABLE "public"."evaluation_questions" ALTER COLUMN "difficulty" SET DATA TYPE "public"."difficulty_level" USING "difficulty"::"public"."difficulty_level";--> statement-breakpoint
ALTER TABLE "public"."evaluations" ALTER COLUMN "difficulty" SET DATA TYPE "public"."difficulty_level" USING "difficulty"::"public"."difficulty_level";--> statement-breakpoint
ALTER TABLE "public"."evaluation_questions" ALTER COLUMN "difficulty" SET DEFAULT 'medium';--> statement-breakpoint
ALTER TABLE "public"."evaluations" ALTER COLUMN "difficulty" SET DEFAULT 'medium';--> statement-breakpoint
DROP TYPE "public"."mastery_status";
