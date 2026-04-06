# Backup And Restore Drill

## Frequency
- Run a restore drill at least once per month.
- Run an additional drill after major schema changes.

## Backup Commands
Use a consistent logical backup of the PostgreSQL database:

```bash
pg_dump "$DATABASE_URL" -Fc -f roomrental.backup
```

## Restore Commands
Restore into a clean database first:

```bash
createdb roomrental_restore_test
pg_restore -d roomrental_restore_test roomrental.backup
```

## Verification Steps
1. Confirm schema objects exist.
2. Run application smoke checks against the restored database.
3. Validate counts for core tables:
   - `users`
   - `listings`
   - `payments`
   - `worker_heartbeats`
4. Run the worker once against the restored environment.
5. Confirm health endpoints return success.

## Acceptance Criteria
- Restore completes without manual SQL fixes.
- App starts cleanly on the restored database.
- Core endpoints pass smoke tests.
- Worker jobs can be claimed and completed after restore.
