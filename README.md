# Room4Rent

Room4Rent is a full-stack room rental platform for students and landlords, with role-based authentication, verified listings, chat, alerts, and deployment-ready infrastructure for Docker and AWS.

## Highlights

- Role-based signup/login for Student and Landlord accounts
- Email verification flow before first login
- Browse rooms with detailed property pages (photos, amenities, owner panel, booking request)
- Saved listings, inquiries, conversations, and dashboard sections
- Backend worker support for queues/observability jobs
- Deployment assets for staging/production Docker Compose and AWS ECS

## Tech Stack

- Frontend Web: React + Vite
- Frontend Mobile: Expo / React Native (workspace package)
- Backend: Node.js + Express + Zod + JWT
- Database: PostgreSQL
- Email (verification/alerts): SMTP and webhook-ready
- Infra: Docker Compose, AWS ECS/Fargate task definition templates

## Monorepo Structure

```text
roomrental/
├─ backend/                  # Express API, controllers, services, workers
├─ frontend/                 # Frontend workspace (web + mobile)
│  ├─ web/                   # Vite web app
│  ├─ mobile/                # Expo mobile app
│  └─ shared/                # Shared API client code
├─ database/                 # SQL migrations and bootstrap scripts
├─ deployment/               # Staging/prod compose + AWS rollout docs/scripts
├─ docker-compose.yml        # Local PostgreSQL + MailHog
└─ README.md
```

## Authentication and Login Flow

### 1) Signup (Student or Landlord)

Student signup includes:

- Full name
- Phone number
- Email
- Password
- Optional academic/profile details (university/course/year/budget/preference)

Landlord signup includes:

- Full name
- Phone number
- Email
- Password
- Optional business name

### 2) Email Verification

- After signup, backend sends verification email (SMTP/webhook config based).
- User must verify email before first successful login.
- If unverified, login response instructs resend verification.

### 3) Login

- Login accepts phone/email identifier + password.
- On success, JWT session is created and user enters the app.

### 4) Post-login Experience

- User can browse listings and open full room details page.
- Room details include image-first layout, amenities, owner contact panel, and request booking action.

## Room Detail Experience (Web)

From Browse Rooms, clicking a listing opens a full detail view:

- Left side: hero image, title/address, room facts, about, amenities, gallery
- Right side: rent panel, furnishing, owner name/phone/email, inquiry/booking input
- Back action returns user to browse section

## Local Development

## Prerequisites

- Node.js 18+
- npm 9+
- Docker Desktop (recommended for local DB)

## 1) Start local infrastructure

```bash
docker compose up -d
```

This starts:

- PostgreSQL on port `5433`
- MailHog SMTP on `1025` and inbox UI on `8025`

## 2) Backend setup

```bash
cd backend
npm install
npm run dev
```

Backend default URL: `http://localhost:4100`

## 3) Frontend setup (web)

```bash
cd frontend
npm install
npm run web
```

Build web app:

```bash
npm run web:build
```

## 4) Mobile setup (optional)

```bash
cd frontend
npm run mobile
```

## Environment Variables

At minimum configure backend with:

- Database URL
- JWT secrets
- App base URL
- Email verification delivery (SMTP or webhook)

Never commit real `.env` secrets to GitHub.

## Docker and Deployment

### Local Docker

- `docker-compose.yml` (root): local PostgreSQL + MailHog

### Staging/Production

- `deployment/docker-compose.staging.yml`
- `deployment/docker-compose.production.yml`

### AWS ECS / Fargate

- `deployment/aws/ecs-task-definition.json`
- `deployment/aws/ecs-task-definition.rendered.json`
- `deployment/scripts/render-ecs-task-definition.js`

Additional operational docs:

- `deployment/ROLLOUT.md`
- `deployment/BLUE_GREEN_CANARY.md`
- `deployment/BACKUP_RESTORE_DRILL.md`
- `deployment/SECRETS_ROTATION.md`

## API Surface (Backend)

Core route groups include:

- Auth: register/login/verify/resend/refresh/logout
- Profile: get/update current user profile
- Listings: public listing discovery + landlord management
- Engagement: saved listings + inquiries
- Chat: conversations + messages
- Dashboard, Membership, Verification, Admin/Observability

Refer to backend API details in `backend/README.md`.

## Quality Checks

Recommended checks before push:

```bash
# web build
npm --prefix frontend run web:build

# backend tests
npm --prefix backend test
```

## Collaboration Workflow

- Create feature branches for each change
- Open Pull Requests into `main`
- Protect `main` with required reviews and checks

## License

No license file is currently configured. Add a license if this repository will be shared publicly.
