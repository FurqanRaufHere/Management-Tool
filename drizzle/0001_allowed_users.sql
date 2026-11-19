CREATE TYPE "public"."allowed_role" AS ENUM('ADMIN', 'TA');--> statement-breakpoint
CREATE TABLE "allowed_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "allowed_role" DEFAULT 'TA' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"added_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sign_in_at" timestamp with time zone,
	CONSTRAINT "allowed_users_email_unique" UNIQUE("email"),
	CONSTRAINT "allowed_users_email_lowercase" CHECK ("allowed_users"."email" = lower("allowed_users"."email"))
);
--> statement-breakpoint
ALTER TABLE "allowed_users" ADD CONSTRAINT "allowed_users_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;