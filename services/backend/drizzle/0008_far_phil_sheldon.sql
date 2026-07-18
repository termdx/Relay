CREATE TABLE "branding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_name" text,
	"logo" text,
	"accent_color" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
