# Secrets Rotation Policy

## Goals
- Limit blast radius of leaked secrets.
- Rotate deploy and runtime secrets on a predictable cadence.
- Keep staging and production isolated.

## Rotation Cadence
- JWT signing secrets: every 90 days or immediately after suspicion of exposure.
- Database credentials: every 90 days.
- Webhook secrets: every 180 days.
- Third-party API keys: per vendor guidance, but not less than every 180 days.

## Rotation Procedure
1. Generate a new secret value.
2. Update staging first.
3. Run staging health gate and smoke tests.
4. Update production.
5. Redeploy API and workers.
6. Validate key endpoints:
   - `GET /api/health`
   - `GET /api/memberships/plans`
   - `GET /api/admin/ops/workers`

## Dual-Secret Strategy
- For short migration windows, allow old and new JWT keys to coexist in validation logic if the runtime supports multiple verification keys.
- Remove the old secret only after all active sessions expire.

## Access Control
- Store production secrets only in the deployment platform secret store.
- Never commit secrets to `.env` files.
- Use separate secrets for staging and production.

## Emergency Rotation
- If a secret is exposed, rotate immediately.
- Trigger rollback if health gates fail after rotation.
- Record the incident and the exact affected scope.
