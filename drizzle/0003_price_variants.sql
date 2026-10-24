CREATE TABLE "price_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"variant" text NOT NULL,
	"plan_code" "plan_code" NOT NULL,
	"price_idr" integer NOT NULL,
	CONSTRAINT "price_variants_variant_planCode_unique" UNIQUE("variant","plan_code"),
	CONSTRAINT "price_variants_variant_check" CHECK ("price_variants"."variant" in ('A', 'B'))
);
--> statement-breakpoint
ALTER TABLE "price_variants" ADD CONSTRAINT "price_variants_plan_code_plans_code_fk" FOREIGN KEY ("plan_code") REFERENCES "public"."plans"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_variants_plan_code_idx" ON "price_variants" USING btree ("plan_code");