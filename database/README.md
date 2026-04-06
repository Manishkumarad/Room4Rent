# Database Setup (PostgreSQL)

This folder contains SQL-first migrations for the Room Rental platform.

## Requirements
- PostgreSQL 14+
- `psql` CLI

## Apply Migrations
From your terminal, run:

```powershell
psql -h localhost -U postgres -d roomrental -f database/migrations/001_init_schema.sql
psql -h localhost -U postgres -d roomrental -f database/migrations/002_seed_reference_data.sql
```

## One-Command Setup (Docker)
If Docker Desktop is installed, run:

```powershell
powershell -ExecutionPolicy Bypass -File database/bootstrap.ps1
```

This command:
- starts PostgreSQL from `docker-compose.yml`
- waits until the database is ready
- applies both migrations

## Core Design Notes
- UUID primary keys (`gen_random_uuid()` from `pgcrypto`)
- Strict constraints for role, status, money fields
- Tenant-safe: business rules enforced with FK + checks
- Fast reads: indexes on listing search, chat, and payments

## Next Step
Create your backend API and point it to this schema using either:
- raw SQL + query builder (Kysely/Knex), or
- Prisma with introspection (`prisma db pull`)
