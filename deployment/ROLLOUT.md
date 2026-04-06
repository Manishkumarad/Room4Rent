# Rollout Strategy

## Environments
- `staging`: pre-production validation
- `production`: live traffic

## Standard Rollout
1. Merge to `develop` and let CI pass.
2. Trigger `Backend Deploy` workflow with `environment=staging` and `strategy=blue-green`.
3. Validate staging smoke tests, worker heartbeats, queue lag, and dead-letter counts.
4. Promote by triggering `Backend Deploy` with `environment=production`.
5. Prefer `strategy=canary` for higher-risk releases and promote only after health gates pass twice.
6. Monitor health endpoint, error logs, queue lag, and worker heartbeats for 15 minutes.

## Secrets Required
- `DEPLOY_WEBHOOK_STAGING`
- `DEPLOY_WEBHOOK_PRODUCTION`
- `DEPLOY_ROLLBACK_WEBHOOK`
- `HEALTH_GATE_BASE_URL`
- `HEALTH_GATE_AUTH_TOKEN` (optional)

## Secrets Rotation
- Follow `SECRETS_ROTATION.md` for cadence and procedure.

## Backup And Restore Drills
- Follow `BACKUP_RESTORE_DRILL.md` monthly.

## Rollout Assets
- `BLUE_GREEN_CANARY.md`
- `scripts/health-gate.js`
- `scripts/post-deploy-rollback.js`

## Rollback
1. Trigger rollback webhook.
2. Re-point runtime to previous known-good image tag.
3. Re-run health check and key smoke requests:
   - `GET /api/health`
   - `GET /api/memberships/plans`
   - `GET /api/dashboard/admin/overview`

## Notes
- Database migrations should be applied before production deploy.
- Worker should be deployed alongside API to avoid job backlog.
- Rollback should be automated when the health gate fails; do not rely on manual intervention during release windows.
