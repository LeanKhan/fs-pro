CREATE TABLE "Awards" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mongoId" text,
	"Name" text NOT NULL,
	"Type" text NOT NULL,
	"Period" text NOT NULL,
	"Category" text NOT NULL,
	"Recipient" text NOT NULL,
	"Club" text,
	"Remarks" text,
	"Season" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	CONSTRAINT "Awards_mongoId_unique" UNIQUE("mongoId")
);
--> statement-breakpoint
CREATE TABLE "Calendars" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mongoId" text,
	"Name" text NOT NULL,
	"YearString" text NOT NULL,
	"YearDigits" text NOT NULL,
	"CurrentDay" integer,
	"isActive" boolean DEFAULT false NOT NULL,
	"isEnded" boolean DEFAULT false NOT NULL,
	"allSeasonsCompleted" boolean DEFAULT false NOT NULL,
	"Days" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	CONSTRAINT "Calendars_mongoId_unique" UNIQUE("mongoId")
);
--> statement-breakpoint
CREATE TABLE "Clubs" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mongoId" text,
	"Name" text NOT NULL,
	"ClubCode" text NOT NULL,
	"AttackingClass" integer,
	"DefensiveClass" integer,
	"Rating" integer DEFAULT 0 NOT NULL,
	"GK_Rating" integer DEFAULT 0 NOT NULL,
	"ATT_Rating" integer DEFAULT 0 NOT NULL,
	"DEF_Rating" integer DEFAULT 0 NOT NULL,
	"MID_Rating" integer DEFAULT 0 NOT NULL,
	"Manager" text,
	"assets" jsonb,
	"Stats" jsonb,
	"Address" jsonb,
	"Budget" integer,
	"Transactions" jsonb,
	"Records" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"Stadium" jsonb,
	"LeagueCode" text,
	"League" text,
	"Players" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"User" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	CONSTRAINT "Clubs_mongoId_unique" UNIQUE("mongoId"),
	CONSTRAINT "Clubs_Name_unique" UNIQUE("Name"),
	CONSTRAINT "Clubs_ClubCode_unique" UNIQUE("ClubCode")
);
--> statement-breakpoint
CREATE TABLE "Competitions" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mongoId" text,
	"Name" text NOT NULL,
	"Type" text NOT NULL,
	"CompetitionCode" text NOT NULL,
	"CompetitionID" text NOT NULL,
	"League" boolean DEFAULT false NOT NULL,
	"Tournament" boolean DEFAULT false NOT NULL,
	"Cup" boolean DEFAULT false NOT NULL,
	"Division" integer DEFAULT 0 NOT NULL,
	"NumberOfTeams" integer NOT NULL,
	"NumberOfWeeks" integer NOT NULL,
	"TeamsPromoted" integer,
	"TeamsRelegated" integer,
	"Country" text,
	"Clubs" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"Seasons" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	CONSTRAINT "Competitions_mongoId_unique" UNIQUE("mongoId"),
	CONSTRAINT "Competitions_CompetitionCode_unique" UNIQUE("CompetitionCode"),
	CONSTRAINT "Competitions_CompetitionID_unique" UNIQUE("CompetitionID")
);
--> statement-breakpoint
CREATE TABLE "Days" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mongoId" text,
	"Matches" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"isFree" boolean NOT NULL,
	"Day" integer,
	"Year" text NOT NULL,
	"Calendar" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	CONSTRAINT "Days_mongoId_unique" UNIQUE("mongoId")
);
--> statement-breakpoint
CREATE TABLE "Managers" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mongoId" text,
	"Key" text NOT NULL,
	"FirstName" text NOT NULL,
	"LastName" text NOT NULL,
	"Age" integer NOT NULL,
	"Picture" text,
	"Club" text,
	"Nationality" text,
	"NationalTeam" boolean DEFAULT false NOT NULL,
	"Records" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"isEmployed" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	CONSTRAINT "Managers_mongoId_unique" UNIQUE("mongoId"),
	CONSTRAINT "Managers_Key_unique" UNIQUE("Key")
);
--> statement-breakpoint
CREATE TABLE "Places" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mongoId" text,
	"Fullname" text NOT NULL,
	"Name" text NOT NULL,
	"Code" text NOT NULL,
	"Region" text,
	"Type" text,
	"Picture" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	CONSTRAINT "Places_mongoId_unique" UNIQUE("mongoId"),
	CONSTRAINT "Places_Code_unique" UNIQUE("Code")
);
--> statement-breakpoint
CREATE TABLE "Seasons" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mongoId" text,
	"SeasonCode" text NOT NULL,
	"Title" text NOT NULL,
	"StartDate" timestamp (3) NOT NULL,
	"EndDate" timestamp (3) NOT NULL,
	"Winner" text,
	"Promoted" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"Relegated" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"isFinished" boolean DEFAULT false NOT NULL,
	"isStarted" boolean DEFAULT false NOT NULL,
	"Status" text DEFAULT 'Pending' NOT NULL,
	"Year" text,
	"Calendar" text,
	"Competition" text,
	"CompetitionCode" text NOT NULL,
	"Fixtures" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"Standings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"Logs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	CONSTRAINT "Seasons_mongoId_unique" UNIQUE("mongoId"),
	CONSTRAINT "Seasons_SeasonCode_unique" UNIQUE("SeasonCode")
);
--> statement-breakpoint
CREATE TABLE "Users" (
	"_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mongoId" text,
	"FullName" text NOT NULL,
	"Password" text NOT NULL,
	"Age" integer,
	"Username" text NOT NULL,
	"Avatar" text DEFAULT 'default-avatar.png' NOT NULL,
	"Alerts" jsonb,
	"Clubs" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"isAdmin" boolean DEFAULT false NOT NULL,
	"Session" text,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) NOT NULL,
	CONSTRAINT "Users_mongoId_unique" UNIQUE("mongoId"),
	CONSTRAINT "Users_Username_unique" UNIQUE("Username")
);
