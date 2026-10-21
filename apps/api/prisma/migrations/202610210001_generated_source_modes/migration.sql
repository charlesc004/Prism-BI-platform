BEGIN;

ALTER TABLE "DataSourceConnection" ALTER COLUMN "mode" SET DEFAULT 'GENERATED';

UPDATE "DataSourceConnection"
SET "mode" = 'GENERATED'
WHERE "mode" <> 'LIVE';

UPDATE "SyncRun"
SET "error" = 'Historical provider rate limit exhausted. A later run recovered.'
WHERE "error" LIKE 'Historical %provider rate limit exhausted. A later run recovered.';

COMMIT;
