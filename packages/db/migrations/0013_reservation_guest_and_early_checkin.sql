ALTER TABLE "reservations" ADD COLUMN "guest_count" integer;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "checkin_time" time;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "checkout_time" time;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "early_checkin_requested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "early_checkin_paid" boolean;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "early_checkin_authorized_by" text;