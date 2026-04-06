$ErrorActionPreference = 'Stop'

Write-Host 'Starting PostgreSQL container...'
docker compose up -d postgres

Write-Host 'Waiting for PostgreSQL to become ready...'
for ($i = 1; $i -le 30; $i++) {
	docker exec roomrental-postgres pg_isready -U postgres -d roomrental | Out-Null
	if ($LASTEXITCODE -eq 0) {
		break
	}

	if ($i -eq 30) {
		throw 'PostgreSQL did not become ready in time.'
	}

	Start-Sleep -Seconds 1
}

Write-Host 'Applying migrations...'
$baseSchemaExists = docker exec roomrental-postgres psql -U postgres -d roomrental -tAc "SELECT to_regclass('public.users') IS NOT NULL;"
if ($LASTEXITCODE -ne 0) {
	throw 'Failed to inspect database schema state'
}

if ($baseSchemaExists.Trim() -eq 'f') {
	Get-Content -Raw database/migrations/001_init_schema.sql | docker exec -i roomrental-postgres psql -v ON_ERROR_STOP=1 -U postgres -d roomrental
	if ($LASTEXITCODE -ne 0) {
		throw 'Failed to apply 001_init_schema.sql'
	}

	Get-Content -Raw database/migrations/002_seed_reference_data.sql | docker exec -i roomrental-postgres psql -v ON_ERROR_STOP=1 -U postgres -d roomrental
	if ($LASTEXITCODE -ne 0) {
		throw 'Failed to apply 002_seed_reference_data.sql'
	}
}

$authSchemaExists = docker exec roomrental-postgres psql -U postgres -d roomrental -tAc "SELECT to_regclass('public.refresh_sessions') IS NOT NULL;"
if ($LASTEXITCODE -ne 0) {
	throw 'Failed to inspect auth session schema state'
}

if ($authSchemaExists.Trim() -eq 'f') {
	Get-Content -Raw database/migrations/003_auth_sessions.sql | docker exec -i roomrental-postgres psql -v ON_ERROR_STOP=1 -U postgres -d roomrental
	if ($LASTEXITCODE -ne 0) {
		throw 'Failed to apply 003_auth_sessions.sql'
	}
}

$savedSearchSchemaExists = docker exec roomrental-postgres psql -U postgres -d roomrental -tAc "SELECT to_regclass('public.saved_searches') IS NOT NULL;"
if ($LASTEXITCODE -ne 0) {
	throw 'Failed to inspect saved search schema state'
}

if ($savedSearchSchemaExists.Trim() -eq 'f') {
	Get-Content -Raw database/migrations/004_saved_searches_alerts.sql | docker exec -i roomrental-postgres psql -v ON_ERROR_STOP=1 -U postgres -d roomrental
	if ($LASTEXITCODE -ne 0) {
		throw 'Failed to apply 004_saved_searches_alerts.sql'
	}
}

$alertDeliverySchemaExists = docker exec roomrental-postgres psql -U postgres -d roomrental -tAc "SELECT to_regclass('public.alert_deliveries') IS NOT NULL;"
if ($LASTEXITCODE -ne 0) {
	throw 'Failed to inspect alert delivery schema state'
}

if ($alertDeliverySchemaExists.Trim() -eq 'f') {
	Get-Content -Raw database/migrations/005_alert_delivery_channels.sql | docker exec -i roomrental-postgres psql -v ON_ERROR_STOP=1 -U postgres -d roomrental
	if ($LASTEXITCODE -ne 0) {
		throw 'Failed to apply 005_alert_delivery_channels.sql'
	}
}

$paymentContextExists = docker exec roomrental-postgres psql -U postgres -d roomrental -tAc "SELECT COUNT(*) > 0 FROM information_schema.columns WHERE table_name='payments' AND column_name='membership_plan_id';"
if ($LASTEXITCODE -ne 0) {
	throw 'Failed to inspect payments membership context state'
}

if ($paymentContextExists.Trim() -eq 'f') {
	Get-Content -Raw database/migrations/006_payments_membership_context.sql | docker exec -i roomrental-postgres psql -v ON_ERROR_STOP=1 -U postgres -d roomrental
	if ($LASTEXITCODE -ne 0) {
		throw 'Failed to apply 006_payments_membership_context.sql'
	}
}

$asyncJobsSchemaExists = docker exec roomrental-postgres psql -U postgres -d roomrental -tAc "SELECT to_regclass('public.immersive_generation_jobs') IS NOT NULL;"
if ($LASTEXITCODE -ne 0) {
	throw 'Failed to inspect async jobs schema state'
}

if ($asyncJobsSchemaExists.Trim() -eq 'f') {
	Get-Content -Raw database/migrations/007_async_job_queues.sql | docker exec -i roomrental-postgres psql -v ON_ERROR_STOP=1 -U postgres -d roomrental
	if ($LASTEXITCODE -ne 0) {
		throw 'Failed to apply 007_async_job_queues.sql'
	}
}

$workerOpsSchemaExists = docker exec roomrental-postgres psql -U postgres -d roomrental -tAc "SELECT to_regclass('public.worker_heartbeats') IS NOT NULL;"
if ($LASTEXITCODE -ne 0) {
	throw 'Failed to inspect worker observability schema state'
}

if ($workerOpsSchemaExists.Trim() -eq 'f') {
	Get-Content -Raw database/migrations/008_worker_observability.sql | docker exec -i roomrental-postgres psql -v ON_ERROR_STOP=1 -U postgres -d roomrental
	if ($LASTEXITCODE -ne 0) {
		throw 'Failed to apply 008_worker_observability.sql'
	}
}

$listingVideosSchemaExists = docker exec roomrental-postgres psql -U postgres -d roomrental -tAc "SELECT to_regclass('public.listing_videos') IS NOT NULL;"
if ($LASTEXITCODE -ne 0) {
	throw 'Failed to inspect listing videos schema state'
}

if ($listingVideosSchemaExists.Trim() -eq 'f') {
	Get-Content -Raw database/migrations/009_listing_videos.sql | docker exec -i roomrental-postgres psql -v ON_ERROR_STOP=1 -U postgres -d roomrental
	if ($LASTEXITCODE -ne 0) {
		throw 'Failed to apply 009_listing_videos.sql'
	}
}

$emailVerificationSchemaExists = docker exec roomrental-postgres psql -U postgres -d roomrental -tAc "SELECT to_regclass('public.email_verification_tokens') IS NOT NULL;"
if ($LASTEXITCODE -ne 0) {
	throw 'Failed to inspect email verification schema state'
}

if ($emailVerificationSchemaExists.Trim() -eq 'f') {
	Get-Content -Raw database/migrations/010_email_verification_tokens.sql | docker exec -i roomrental-postgres psql -v ON_ERROR_STOP=1 -U postgres -d roomrental
	if ($LASTEXITCODE -ne 0) {
		throw 'Failed to apply 010_email_verification_tokens.sql'
	}
}

$rlsEnabledOnUsers = docker exec roomrental-postgres psql -U postgres -d roomrental -tAc "SELECT relrowsecurity FROM pg_class WHERE oid = 'public.users'::regclass;"
if ($LASTEXITCODE -ne 0) {
	throw 'Failed to inspect RLS state for public.users'
}

if ($rlsEnabledOnUsers.Trim() -eq 'f') {
	Get-Content -Raw database/migrations/011_enable_rls_public.sql | docker exec -i roomrental-postgres psql -v ON_ERROR_STOP=1 -U postgres -d roomrental
	if ($LASTEXITCODE -ne 0) {
		throw 'Failed to apply 011_enable_rls_public.sql'
	}
}

Write-Host 'Database setup complete.'
