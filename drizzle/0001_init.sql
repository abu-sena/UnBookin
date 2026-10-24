CREATE TYPE "public"."action_status" AS ENUM('planned', 'done', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."badge_tier" AS ENUM('bronze', 'silver', 'gold');--> statement-breakpoint
CREATE TYPE "public"."bloom_level" AS ENUM('remember', 'understand', 'apply', 'analyze', 'evaluate', 'create');--> statement-breakpoint
CREATE TYPE "public"."byok_connection" AS ENUM('oauth', 'manual');--> statement-breakpoint
CREATE TYPE "public"."byok_provider" AS ENUM('openrouter');--> statement-breakpoint
CREATE TYPE "public"."content_layer" AS ENUM('eli5', 'practitioner', 'expert');--> statement-breakpoint
CREATE TYPE "public"."domain_level" AS ENUM('novice', 'advanced_beginner', 'competent', 'proficient', 'expert');--> statement-breakpoint
CREATE TYPE "public"."experience_level" AS ENUM('novice', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."mentor_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."mission_type" AS ENUM('learn', 'review', 'apply');--> statement-breakpoint
CREATE TYPE "public"."module_status" AS ENUM('not_started', 'reading', 'read');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('subscription', 'original');--> statement-breakpoint
CREATE TYPE "public"."plan_code" AS ENUM('free', 'pro_monthly', 'pro_yearly', 'byok_monthly', 'byok_yearly');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('mcq', 'multi_select', 'case_mcq', 'short_answer');--> statement-breakpoint
CREATE TYPE "public"."review_result" AS ENUM('again', 'hard', 'good');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('uploaded', 'extracting', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('pdf', 'epub', 'url', 'text');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'canceled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."unbook_status" AS ENUM('queued', 'outlining', 'generating', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text,
	"job_role" text,
	"goal" text,
	"experience_level" "experience_level" DEFAULT 'novice' NOT NULL,
	"daily_goal_minutes" integer DEFAULT 10 NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"locale" text DEFAULT 'id' NOT NULL,
	"onboarded_at" timestamp with time zone,
	CONSTRAINT "profiles_userId_unique" UNIQUE("user_id"),
	CONSTRAINT "profiles_daily_goal_check" CHECK ("profiles"."daily_goal_minutes" in (5, 10, 20))
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"interest_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "domains_interestId_slug_unique" UNIQUE("interest_id","slug")
);
--> statement-breakpoint
CREATE TABLE "interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"color_token" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "interests_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"interest_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_interests_userId_interestId_unique" UNIQUE("user_id","interest_id")
);
--> statement-breakpoint
CREATE TABLE "source_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"chapter_title" text,
	"page_from" integer,
	"page_to" integer,
	"text" text NOT NULL,
	"token_count" integer NOT NULL,
	"embedding" vector(1536)
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "source_type" NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"year" integer,
	"file_key" text,
	"url" text,
	"mime_type" text,
	"size_bytes" bigint,
	"page_count" integer,
	"word_count" integer,
	"language" text,
	"status" "source_status" DEFAULT 'uploaded' NOT NULL,
	"error_code" text,
	"rights_confirmed_at" timestamp with time zone NOT NULL,
	"file_deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "module_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"module_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	"confidence" real NOT NULL,
	CONSTRAINT "module_domains_moduleId_domainId_unique" UNIQUE("module_id","domain_id")
);
--> statement-breakpoint
CREATE TABLE "module_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"status" "module_status" DEFAULT 'not_started' NOT NULL,
	"deepest_layer" "content_layer" DEFAULT 'eli5' NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "module_progress_userId_moduleId_unique" UNIQUE("user_id","module_id")
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unbook_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content" jsonb,
	"estimated_minutes" integer,
	"source_page_from" integer,
	"source_page_to" integer
);
--> statement-breakpoint
CREATE TABLE "unbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"source_id" uuid,
	"original_id" uuid,
	"title" text NOT NULL,
	"big_idea" text,
	"interest_id" uuid NOT NULL,
	"status" "unbook_status" DEFAULT 'queued' NOT NULL,
	"progress_pct" integer DEFAULT 0 NOT NULL,
	"current_stage" text,
	"module_count" integer DEFAULT 0 NOT NULL,
	"used_byok" boolean DEFAULT false NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "card_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"box" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_result" "review_result",
	"reviewed_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "card_states_userId_cardId_unique" UNIQUE("user_id","card_id"),
	CONSTRAINT "card_states_box_check" CHECK ("card_states"."box" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"quiz_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"score_pct" real,
	"passed" boolean,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"bloom_level" "bloom_level" NOT NULL,
	"type" "question_type" NOT NULL,
	"prompt" text NOT NULL,
	"options" jsonb,
	"correct" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"rubric" jsonb,
	"chunk_refs" uuid[] DEFAULT '{}'::uuid[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"module_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"module_id" uuid NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"chunk_ref" uuid
);
--> statement-breakpoint
CREATE TABLE "action_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action_id" uuid NOT NULL,
	"what_i_did" text NOT NULL,
	"result" text NOT NULL,
	"reflection" text NOT NULL,
	"evidence_url" text,
	"ai_feedback" text,
	"quality_score" integer,
	"verified" boolean DEFAULT false NOT NULL,
	CONSTRAINT "action_reports_quality_check" CHECK ("action_reports"."quality_score" between 1 and 4),
	CONSTRAINT "action_reports_verified_check" CHECK ("action_reports"."verified" = coalesce("action_reports"."quality_score" >= 3, false))
);
--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"module_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone,
	"status" "action_status" DEFAULT 'planned' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL,
	"rule" jsonb NOT NULL,
	"tier" "badge_tier" NOT NULL,
	CONSTRAINT "badges_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "domain_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" "domain_level" DEFAULT 'novice' NOT NULL,
	"verified_actions" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "domain_progress_userId_domainId_unique" UNIQUE("user_id","domain_id")
);
--> statement-breakpoint
CREATE TABLE "mission_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"type" "mission_type" NOT NULL,
	"target" integer NOT NULL,
	"xp_reward" integer NOT NULL,
	CONSTRAINT "mission_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"badge_id" uuid NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_badges_userId_badgeId_unique" UNIQUE("user_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "user_missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "user_missions_userId_templateId_weekStart_unique" UNIQUE("user_id","template_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"streak_freezes" integer DEFAULT 0 NOT NULL,
	"last_active_date" date,
	CONSTRAINT "user_stats_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"domain_id" uuid,
	"ref_type" text NOT NULL,
	"ref_id" uuid NOT NULL,
	CONSTRAINT "xp_events_userId_type_refType_refId_unique" UNIQUE("user_id","type","ref_type","ref_id")
);
--> statement-breakpoint
CREATE TABLE "mentor_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" "mentor_role" NOT NULL,
	"content" text NOT NULL,
	"citations" jsonb,
	"input_tokens" integer,
	"output_tokens" integer
);
--> statement-breakpoint
CREATE TABLE "mentor_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"unbook_id" uuid NOT NULL,
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "original_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"original_id" uuid NOT NULL,
	"payment_id" uuid
);
--> statement-breakpoint
CREATE TABLE "originals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"author_name" text NOT NULL,
	"cover_key" text,
	"description" text,
	"interest_id" uuid NOT NULL,
	"price_idr" integer NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"unbook_id" uuid,
	"sample_module_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "originals_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"ref_id" uuid,
	"amount_idr" integer NOT NULL,
	"midtrans_order_id" text NOT NULL,
	"midtrans_status" text DEFAULT 'pending' NOT NULL,
	"payment_type" text,
	"paid_at" timestamp with time zone,
	"raw" jsonb,
	CONSTRAINT "payments_midtransOrderId_unique" UNIQUE("midtrans_order_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" "plan_code" NOT NULL,
	"name" text NOT NULL,
	"price_idr" integer NOT NULL,
	"interval" text NOT NULL,
	"limits" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_code" "plan_code" NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"period" text NOT NULL,
	"unbooks_used" integer DEFAULT 0 NOT NULL,
	"mentor_messages_used" integer DEFAULT 0 NOT NULL,
	"pages_processed" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counters_userId_period_unique" UNIQUE("user_id","period")
);
--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"task" text NOT NULL,
	"model" text NOT NULL,
	"byok" boolean DEFAULT false NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric(12, 6),
	"latency_ms" integer,
	"status" text NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "ai_task_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"task" text NOT NULL,
	"model" text NOT NULL,
	"fallback_model" text,
	"temperature" real DEFAULT 0.7 NOT NULL,
	"max_output_tokens" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "ai_task_configs_task_unique" UNIQUE("task")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "byok_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "byok_provider" DEFAULT 'openrouter' NOT NULL,
	"encrypted_key" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"last4" text NOT NULL,
	"connected_via" "byok_connection" NOT NULL,
	"verified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "byok_keys_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"email_review_due" boolean DEFAULT true NOT NULL,
	"email_streak_risk" boolean DEFAULT true NOT NULL,
	"email_weekly_summary" boolean DEFAULT true NOT NULL,
	"push_enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "notification_prefs_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "takedown_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reporter_name" text NOT NULL,
	"reporter_email" text NOT NULL,
	"work_title" text NOT NULL,
	"description" text NOT NULL,
	"target_ref" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"interest_slug" text,
	"price_variant" text,
	"referral_code" text NOT NULL,
	"referred_by" uuid,
	"source_utm" text,
	CONSTRAINT "waitlist_email_unique" UNIQUE("email"),
	CONSTRAINT "waitlist_referralCode_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_chunks" ADD CONSTRAINT "source_chunks_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_domains" ADD CONSTRAINT "module_domains_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_domains" ADD CONSTRAINT "module_domains_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_progress" ADD CONSTRAINT "module_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_progress" ADD CONSTRAINT "module_progress_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_unbook_id_unbooks_id_fk" FOREIGN KEY ("unbook_id") REFERENCES "public"."unbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unbooks" ADD CONSTRAINT "unbooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unbooks" ADD CONSTRAINT "unbooks_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unbooks" ADD CONSTRAINT "unbooks_original_id_originals_id_fk" FOREIGN KEY ("original_id") REFERENCES "public"."originals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unbooks" ADD CONSTRAINT "unbooks_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_states" ADD CONSTRAINT "card_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_states" ADD CONSTRAINT "card_states_card_id_review_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."review_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cards" ADD CONSTRAINT "review_cards_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cards" ADD CONSTRAINT "review_cards_chunk_ref_source_chunks_id_fk" FOREIGN KEY ("chunk_ref") REFERENCES "public"."source_chunks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_reports" ADD CONSTRAINT "action_reports_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_progress" ADD CONSTRAINT "domain_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_progress" ADD CONSTRAINT "domain_progress_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_missions" ADD CONSTRAINT "user_missions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_missions" ADD CONSTRAINT "user_missions_template_id_mission_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."mission_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_messages" ADD CONSTRAINT "mentor_messages_thread_id_mentor_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."mentor_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_threads" ADD CONSTRAINT "mentor_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_threads" ADD CONSTRAINT "mentor_threads_unbook_id_unbooks_id_fk" FOREIGN KEY ("unbook_id") REFERENCES "public"."unbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "original_purchases" ADD CONSTRAINT "original_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "original_purchases" ADD CONSTRAINT "original_purchases_original_id_originals_id_fk" FOREIGN KEY ("original_id") REFERENCES "public"."originals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "original_purchases" ADD CONSTRAINT "original_purchases_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "originals" ADD CONSTRAINT "originals_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "originals" ADD CONSTRAINT "originals_unbook_id_unbooks_id_fk" FOREIGN KEY ("unbook_id") REFERENCES "public"."unbooks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_code_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."plans"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "byok_keys" ADD CONSTRAINT "byok_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_interest_slug_interests_slug_fk" FOREIGN KEY ("interest_slug") REFERENCES "public"."interests"("slug") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_referred_by_waitlist_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."waitlist"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "users_deleted_at_idx" ON "users" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "interests_active_sort_idx" ON "interests" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "user_interests_interest_id_idx" ON "user_interests" USING btree ("interest_id");--> statement-breakpoint
CREATE INDEX "source_chunks_source_id_idx" ON "source_chunks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_chunks_embedding_hnsw_idx" ON "source_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "source_chunks_text_gin_idx" ON "source_chunks" USING gin (to_tsvector('simple', "text"));--> statement-breakpoint
CREATE INDEX "sources_user_id_idx" ON "sources" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sources_status_idx" ON "sources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "module_domains_domain_id_idx" ON "module_domains" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "module_progress_module_id_idx" ON "module_progress" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "module_progress_status_idx" ON "module_progress" USING btree ("status");--> statement-breakpoint
CREATE INDEX "modules_unbook_sort_idx" ON "modules" USING btree ("unbook_id","sort_order");--> statement-breakpoint
CREATE INDEX "unbooks_user_id_idx" ON "unbooks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "unbooks_source_id_idx" ON "unbooks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "unbooks_original_id_idx" ON "unbooks" USING btree ("original_id");--> statement-breakpoint
CREATE INDEX "unbooks_interest_id_idx" ON "unbooks" USING btree ("interest_id");--> statement-breakpoint
CREATE INDEX "unbooks_status_idx" ON "unbooks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "card_states_card_id_idx" ON "card_states" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "card_states_user_due_idx" ON "card_states" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "card_states_due_at_idx" ON "card_states" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "quiz_attempts_user_id_idx" ON "quiz_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_quiz_id_idx" ON "quiz_attempts" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "quiz_questions_quiz_sort_idx" ON "quiz_questions" USING btree ("quiz_id","sort_order");--> statement-breakpoint
CREATE INDEX "quizzes_module_id_idx" ON "quizzes" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "quizzes_active_idx" ON "quizzes" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "review_cards_module_id_idx" ON "review_cards" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "review_cards_chunk_ref_idx" ON "review_cards" USING btree ("chunk_ref");--> statement-breakpoint
CREATE INDEX "action_reports_action_id_idx" ON "action_reports" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "actions_user_id_idx" ON "actions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "actions_module_id_idx" ON "actions" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "actions_status_idx" ON "actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "actions_due_at_idx" ON "actions" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "domain_progress_domain_id_idx" ON "domain_progress" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "mission_templates_type_idx" ON "mission_templates" USING btree ("type");--> statement-breakpoint
CREATE INDEX "user_badges_badge_id_idx" ON "user_badges" USING btree ("badge_id");--> statement-breakpoint
CREATE INDEX "user_missions_template_id_idx" ON "user_missions" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "user_missions_user_week_idx" ON "user_missions" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "xp_events_domain_id_idx" ON "xp_events" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "mentor_messages_thread_id_idx" ON "mentor_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "mentor_threads_user_id_idx" ON "mentor_threads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mentor_threads_unbook_id_idx" ON "mentor_threads" USING btree ("unbook_id");--> statement-breakpoint
CREATE INDEX "original_purchases_user_id_idx" ON "original_purchases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "original_purchases_original_id_idx" ON "original_purchases" USING btree ("original_id");--> statement-breakpoint
CREATE INDEX "original_purchases_payment_id_idx" ON "original_purchases" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "originals_interest_id_idx" ON "originals" USING btree ("interest_id");--> statement-breakpoint
CREATE INDEX "originals_unbook_id_idx" ON "originals" USING btree ("unbook_id");--> statement-breakpoint
CREATE INDEX "originals_published_idx" ON "originals" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "payments_user_id_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payments_ref_id_idx" ON "payments" USING btree ("ref_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("midtrans_status");--> statement-breakpoint
CREATE INDEX "plans_is_active_idx" ON "plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_code_idx" ON "subscriptions" USING btree ("plan_code");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_period_end_idx" ON "subscriptions" USING btree ("current_period_end");--> statement-breakpoint
CREATE INDEX "ai_calls_user_id_idx" ON "ai_calls" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_calls_task_idx" ON "ai_calls" USING btree ("task");--> statement-breakpoint
CREATE INDEX "ai_calls_status_idx" ON "ai_calls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "takedown_requests_status_idx" ON "takedown_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "waitlist_interest_slug_idx" ON "waitlist" USING btree ("interest_slug");--> statement-breakpoint
CREATE INDEX "waitlist_referred_by_idx" ON "waitlist" USING btree ("referred_by");