-- RF-04 / RF-06 / RF-70 : préférences de profil, suppression logique et
-- sécurité des sessions.
CREATE TYPE "WeekStart" AS ENUM ('MONDAY', 'SUNDAY');
CREATE TYPE "TimeFormat" AS ENUM ('H24', 'H12');
CREATE TYPE "ThemePreference" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

ALTER TABLE "User"
  ADD COLUMN "weekStartsOn" "WeekStart" NOT NULL DEFAULT 'MONDAY',
  ADD COLUMN "timeFormat" "TimeFormat" NOT NULL DEFAULT 'H24',
  ADD COLUMN "theme" "ThemePreference" NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "deletionRequestedAt" TIMESTAMPTZ(3);

ALTER TABLE "Session"
  ADD COLUMN "platform" VARCHAR(20),
  ADD COLUMN "deviceName" VARCHAR(80);

-- RF-01 : verrouillage progressif par e-mail (citext, comme User.email).
CREATE TABLE "LoginAttempt" (
  "email" CITEXT NOT NULL,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "lockLevel" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMPTZ(3),
  "lastFailedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("email")
);

-- RF-02 : jeton haché, 30 minutes, usage unique.
CREATE TABLE "PasswordResetToken" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "usedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasswordResetToken_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");