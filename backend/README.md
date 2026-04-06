# RoomRental Backend

Separate backend service for authentication, role-based registration, and profile management.

## Tech Stack
- Node.js + Express
- PostgreSQL (connected to project database)
- JWT auth
- Zod validation

## Run
1. Install dependencies:
   - `npm install`
2. Set environment:
   - copy `.env.example` to `.env` if needed
3. Start server:
   - `npm start`

Background workers:
- `npm run worker`
- `npm run worker:once`

Automated tests:
- `npm test`
- `npm run test:watch`

Default server: `http://localhost:4100`

## API Endpoints

### Health
- `GET /api/health/`

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/resend-verification`
- `GET /api/auth/verify-email?token=...`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/request-phone-otp`
- `POST /api/auth/verify-phone-otp`

Email verification delivery setup (required for real email inbox delivery):
- Option 1 (webhook): set `EMAIL_VERIFICATION_WEBHOOK_URL`
- Option 2 (SMTP): set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, optional `SMTP_SECURE`
- Set `APP_BASE_URL` so verification links point to your running backend domain

If no provider is configured, the API returns `verificationEmailSent: false` and `verificationDeliveryReason` in auth responses.

Local dev inbox setup (no external provider required):
- Start MailHog with docker compose (`mailhog` service in root `docker-compose.yml`).
- MailHog SMTP: `localhost:1025`
- MailHog web inbox: `http://localhost:8025`
- Backend local `.env` can use:
  - `APP_BASE_URL=http://localhost:4100`
  - `SMTP_HOST=localhost`
  - `SMTP_PORT=1025`
  - `SMTP_FROM=Room4Rent <no-reply@room4rent.local>`
  - `SMTP_SECURE=false`

### Profile (Auth required)
- `GET /api/profile/me`
- `PUT /api/profile/me`

### Listings
- `GET /api/listings`
- `GET /api/listings/:id`
- `POST /api/listings` (landlord)
- `PUT /api/listings/:id` (landlord)
- `DELETE /api/listings/:id` (landlord)
- `POST /api/listings/:id/images` (landlord)
- `POST /api/listings/:id/amenities` (landlord)
- `GET /api/listings/me` (landlord)

### Membership And Billing
- `GET /api/memberships/plans`
- `GET /api/memberships/me` (landlord)
- `POST /api/memberships/checkout` (landlord)
- `POST /api/memberships/checkout/confirm` (landlord)
- `POST /api/memberships/webhooks/:provider`

Razorpay-ready config:
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Use `provider: "mock"` for local testing and `provider: "razorpay"` for live order creation.

### Membership And Billing
- `GET /api/memberships/plans`
- `GET /api/memberships/me` (landlord)
- `POST /api/memberships/checkout` (landlord)
- `POST /api/memberships/checkout/confirm` (landlord)
- `POST /api/memberships/webhooks/:provider`

Razorpay-ready config:
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Use `provider: "mock"` for local testing and `provider: "razorpay"` for live order creation.

### Verification Workflow
- `POST /api/verifications/documents` (landlord)
- `GET /api/verifications/documents/me` (landlord)
- `POST /api/verifications/listings/:id/submit` (landlord)

### Admin Verification Review
- `GET /api/admin/verifications/documents` (admin)
- `PATCH /api/admin/verifications/documents/:id` (admin)
- `GET /api/admin/verifications/listings` (admin)
- `PATCH /api/admin/verifications/listings/:id` (admin)

### Admin Observability
- `GET /api/admin/audit-logs` (admin)
- `GET /api/admin/payments/webhooks` (admin)
- `GET /api/admin/ops/queues` (admin)
- `GET /api/admin/ops/workers` (admin)
- `GET /api/admin/ops/dead-letters` (admin)

### Dashboards And Analytics
- `GET /api/dashboard/admin/overview` (admin)
- `GET /api/dashboard/admin/trends?days=14` (admin)
- `GET /api/dashboard/landlord/me` (landlord)
- `GET /api/dashboard/student/me` (student)

### Student Discovery
- `GET /api/students/listings/search` (student)
  - Supports filters: `minBudget`, `maxBudget`, `city`, `localityId`, `roomType`, `furnishingType`, `tenantGenderPreference`, `search`, pagination
- `GET /api/students/localities/insights`
  - Supports filters: `city`, `state`, `minSafetyScore`, `minTransportScore`, `maxAvgRent`, pagination

### Saved Searches And Alerts
- `POST /api/students/saved-searches` (student)
- `GET /api/students/saved-searches` (student)
- `PUT /api/students/saved-searches/:id` (student)
- `DELETE /api/students/saved-searches/:id` (student)
- `GET /api/students/alerts` (student)
  - Supports: `unreadOnly=true|false`, `page`, `limit`
- `GET /api/students/alerts/stream` (student, SSE realtime)
- `PATCH /api/students/alerts/:id/read` (student)
- `PATCH /api/students/alerts/read-all` (student)

Instant alerts are generated automatically when a new listing is created or updated to `active` and matches any active saved search filters.

Delivery channels implemented:
- Email webhook delivery (configure `EMAIL_ALERT_WEBHOOK_URL`)
- WhatsApp delivery with provider modes:
  - `webhook` mode: configure `WHATSAPP_ALERT_WEBHOOK_URL`
  - `twilio` mode: configure `WHATSAPP_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`
  - `meta` mode: configure `WHATSAPP_PROVIDER=meta`, `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, optional `META_WHATSAPP_API_VERSION`
- In-app realtime delivery over SSE (`/api/students/alerts/stream`)

Delivery tracking:
- Channel attempts are logged in `alert_deliveries` table with statuses: `sent`, `skipped`, `failed`.

### Roommate Matching
- `GET /api/students/roommates/me` (student)
- `PUT /api/students/roommates/me` (student)
- `GET /api/students/roommates/matches` (student)
  - Query params: `minScore`, `limit`

### Chat (Student + Landlord)
- `POST /api/chats/conversations`
- `GET /api/chats/conversations`
- `GET /api/chats/conversations/:id`
- `GET /api/chats/conversations/:id/messages`
- `POST /api/chats/conversations/:id/messages`
- `PATCH /api/chats/conversations/:id/read`

Conversation rules:
- Only `student` and `landlord` participants are allowed.
- Optional `listingId` can be passed when creating a conversation.
- If the same two participants already have a conversation for that listing, it is reused.

### Engagement (Saved Listings + Inquiries)
- `POST /api/engagement/saved-listings/:listingId` (student)
- `DELETE /api/engagement/saved-listings/:listingId` (student)
- `GET /api/engagement/saved-listings` (student)
- `POST /api/engagement/listings/:listingId/inquiries` (student)
- `GET /api/engagement/inquiries/me` (student)
- `GET /api/engagement/inquiries/received` (landlord)
- `PATCH /api/engagement/inquiries/:id/status` (landlord)

### Immersive Listing Assets (3D/360)
- `GET /api/immersive/listings/:listingId`
- `POST /api/immersive/listings/:listingId/generate` (landlord)
- `PATCH /api/immersive/listings/:listingId/status` (admin)

Status lifecycle:
- `pending` -> `processing` -> `ready` or `failed`
- `assetUrl` is required when marking status as `ready`

## Register Payload
```json
{
  "role": "student",
  "fullName": "Ananya Gupta",
  "phone": "9000000002",
  "email": "ananya.student@example.com",
  "password": "StrongPass123!",
  "profile": {
    "universityName": "IET Indore",
    "courseName": "B.Tech CSE",
    "yearOfStudy": 2,
    "budgetMin": 5000,
    "budgetMax": 9000,
    "preferredGender": "female"
  }
}
```

For landlord, use:
```json
{
  "role": "landlord",
  "fullName": "Ravi Sharma",
  "phone": "9000000001",
  "email": "ravi.owner@example.com",
  "password": "StrongPass123!",
  "profile": {
    "businessName": "Sharma Properties"
  }
}
```

## Notes
- Registration is transaction-safe and supports multiple users concurrently.
- `users.phone` and `users.email` uniqueness is enforced by database constraints.
- Duplicate registration returns HTTP 409 conflict.
- Role-specific profile rows are created automatically:
  - `students` for student role
  - `landlords` for landlord role

## Async Workers
- Immersive generation requests are queued in `immersive_generation_jobs`.
- Membership checkout reconciliation is queued in `payment_reconciliation_jobs`.
- Failed jobs are persisted in `dead_letter_jobs` for operator review.
- Worker liveness is tracked in `worker_heartbeats`.
- Worker polling and batch sizes are configured via:
  - `WORKER_POLL_INTERVAL_MS`
  - `IMMERSIVE_JOB_BATCH_SIZE`
  - `PAYMENT_RECONCILIATION_BATCH_SIZE`
  - `PAYMENT_RECONCILIATION_CAPTURE_AFTER_MINUTES`
- Reliability alert controls:
  - `WORKER_ALERT_WEBHOOK_URL`
  - `WORKER_QUEUE_LAG_ALERT_THRESHOLD_SECONDS`
  - `WORKER_FAILED_JOBS_ALERT_THRESHOLD`
  - `WORKER_ALERT_COOLDOWN_MINUTES`
  - `WORKER_HEARTBEAT_STALE_AFTER_SECONDS`

## CI/CD And Deployment
- CI workflow: `.github/workflows/backend-ci.yml`
- Deploy workflow: `.github/workflows/backend-deploy.yml`
- AWS ECS deploy workflow: `.github/workflows/backend-deploy-aws.yml`
- Docker image: `backend/Dockerfile`
- Staging/production env templates:
  - `backend/.env.staging.example`
  - `backend/.env.production.example`
- Rollout guide: `deployment/ROLLOUT.md`
- Blue-green/canary guide: `deployment/BLUE_GREEN_CANARY.md`
- Secrets rotation policy: `deployment/SECRETS_ROTATION.md`
- Backup/restore drill: `deployment/BACKUP_RESTORE_DRILL.md`

AWS ECS requirements:
- `AWS_ROLE_TO_ASSUME`
- `AWS_REGION`
- `AWS_ACCOUNT_ID`
- `AWS_ECR_REPOSITORY`
- `AWS_ECS_CLUSTER`
- `AWS_ECS_SERVICE`
- `HEALTH_GATE_BASE_URL`
- `HEALTH_GATE_AUTH_TOKEN` (optional)
