ALTER TABLE IF EXISTS "verification_tokens" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "categories" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "lesson_files" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE IF EXISTS "reviews" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE IF EXISTS "verification_tokens" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "categories" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "lesson_files" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "reviews" CASCADE;--> statement-breakpoint
ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "courses_category_id_categories_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "courses_category_idx";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN IF EXISTS "promo_video_url";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN IF EXISTS "category_id";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN IF EXISTS "price_bob";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN IF EXISTS "price_usd";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN IF EXISTS "average_rating";--> statement-breakpoint
ALTER TABLE "courses" DROP COLUMN IF EXISTS "total_ratings";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "video_provider";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "video_id";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "video_url";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "duration_seconds";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "transcript";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "captions_url";--> statement-breakpoint
ALTER TABLE "lessons" DROP COLUMN IF EXISTS "transcript_status";--> statement-breakpoint
ALTER TABLE "certificates" DROP COLUMN IF EXISTS "pdf_url";