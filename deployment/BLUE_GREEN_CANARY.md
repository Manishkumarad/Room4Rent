# Blue-Green And Canary Deployment Guide

## Strategy
- **Blue-green**: deploy the new release beside the active one, validate it, then switch traffic.
- **Canary**: direct a small share of traffic to the new release, verify health, then promote.

## Recommended Inputs
- Environment: `staging` or `production`
- Strategy: `blue-green` or `canary`
- Canary traffic percentage: `10`, `25`, or `50`

## Required Gates
1. Application health endpoint.
2. Membership plans endpoint.
3. Admin overview endpoint.
4. Worker heartbeat freshness.
5. Queue lag below alert threshold.

## Rollback Criteria
- Health gate failure.
- Worker heartbeat stale.
- Queue lag above threshold for two consecutive checks.
- Elevated dead-letter growth during rollout.

## Execution Order
1. Deploy inactive slot or canary target.
2. Run health gate script.
3. Promote traffic.
4. Re-run health gate script.
5. If any gate fails, trigger rollback webhook.

## Operational Notes
- Keep the previous image tag available until the deployment is stable.
- Freeze schema changes during rollout windows unless explicitly coordinated.
