CREATE TYPE "public"."attendance_status" AS ENUM('PRESENT', 'LATE', 'ABSENT', 'LEAVE');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('DRAFT', 'SENDING', 'SENT', 'FAILED', 'DISCARDED');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('PHOTO', 'VIDEO', 'END_SNAPSHOT');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('OWNER', 'TA');--> statement-breakpoint
CREATE TYPE "public"."template_kind" AS ENUM('ABSENCE', 'WARNING', 'CUSTOM');--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"student_id" text NOT NULL,
	"status" "attendance_status" NOT NULL,
	"source" text DEFAULT 'upload' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bootcamps" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"venue" text,
	"timezone" text DEFAULT 'Asia/Karachi' NOT NULL,
	"class_start" text DEFAULT '17:30' NOT NULL,
	"class_end" text DEFAULT '21:00' NOT NULL,
	"class_days" integer[] DEFAULT '{1,2,3,4,5}'::integer[] NOT NULL,
	"supervisor_name" text,
	"supervisor_email" text,
	"report_cc" text[] DEFAULT '{}'::text[] NOT NULL,
	"drive_folder_id" text,
	"drive_folder_name" text,
	"warning_threshold" integer DEFAULT 3 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"bootcamp_id" text NOT NULL,
	"date" text NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"topic" text,
	"notes" text,
	"attendance_uploaded_at" timestamp with time zone,
	"attendance_file_name" text,
	"drive_folder_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"id" text PRIMARY KEY NOT NULL,
	"bootcamp_id" text NOT NULL,
	"student_id" text,
	"session_id" text,
	"kind" "template_kind" NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" "email_status" DEFAULT 'DRAFT' NOT NULL,
	"error" text,
	"sent_by_id" text,
	"sent_at" timestamp with time zone,
	"gmail_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"google_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_at" integer,
	"scope" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_accounts_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE "bootcamp_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"bootcamp_id" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"kind" "media_kind" NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"drive_file_id" text NOT NULL,
	"drive_link" text,
	"uploaded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bootcamp_members" (
	"id" text PRIMARY KEY NOT NULL,
	"bootcamp_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'TA' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"to" text NOT NULL,
	"cc" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"sent_by_id" text,
	"gmail_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" text PRIMARY KEY NOT NULL,
	"bootcamp_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"roll_no" text,
	"extra" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"bootcamp_id" text NOT NULL,
	"kind" "template_kind" NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_session_id_class_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_bootcamp_id_bootcamps_id_fk" FOREIGN KEY ("bootcamp_id") REFERENCES "public"."bootcamps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_bootcamp_id_bootcamps_id_fk" FOREIGN KEY ("bootcamp_id") REFERENCES "public"."bootcamps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_session_id_class_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_accounts" ADD CONSTRAINT "google_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootcamp_invites" ADD CONSTRAINT "bootcamp_invites_bootcamp_id_bootcamps_id_fk" FOREIGN KEY ("bootcamp_id") REFERENCES "public"."bootcamps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_session_id_class_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootcamp_members" ADD CONSTRAINT "bootcamp_members_bootcamp_id_bootcamps_id_fk" FOREIGN KEY ("bootcamp_id") REFERENCES "public"."bootcamps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bootcamp_members" ADD CONSTRAINT "bootcamp_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_session_id_class_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_bootcamp_id_bootcamps_id_fk" FOREIGN KEY ("bootcamp_id") REFERENCES "public"."bootcamps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_bootcamp_id_bootcamps_id_fk" FOREIGN KEY ("bootcamp_id") REFERENCES "public"."bootcamps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_session_student" ON "attendance" USING btree ("session_id","student_id");--> statement-breakpoint
CREATE INDEX "attendance_student" ON "attendance" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_bootcamp_date" ON "class_sessions" USING btree ("bootcamp_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "emails_absence_once" ON "emails" USING btree ("session_id","student_id") WHERE "emails"."kind" = 'ABSENCE';--> statement-breakpoint
CREATE INDEX "emails_bootcamp_status" ON "emails" USING btree ("bootcamp_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_bootcamp_email" ON "bootcamp_invites" USING btree ("bootcamp_id","email");--> statement-breakpoint
CREATE INDEX "invites_email" ON "bootcamp_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "media_session" ON "media" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_drive_file" ON "media" USING btree ("drive_file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_bootcamp_user" ON "bootcamp_members" USING btree ("bootcamp_id","user_id");--> statement-breakpoint
CREATE INDEX "members_user" ON "bootcamp_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reports_session" ON "reports" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_bootcamp_email" ON "students" USING btree ("bootcamp_id","email");--> statement-breakpoint
CREATE INDEX "students_bootcamp_roll" ON "students" USING btree ("bootcamp_id","roll_no");--> statement-breakpoint
CREATE INDEX "templates_bootcamp" ON "email_templates" USING btree ("bootcamp_id");