require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const migrationsDir = path.resolve(__dirname, '../../database/migrations');

const migrationFiles = {
  m1: '001_init_schema.sql',
  m2: '002_seed_reference_data.sql',
  m3: '003_auth_sessions.sql',
  m4: '004_saved_searches_alerts.sql',
  m5: '005_alert_delivery_channels.sql',
  m6: '006_payments_membership_context.sql',
  m7: '007_async_job_queues.sql',
  m8: '008_worker_observability.sql',
  m9: '009_listing_videos.sql',
  m10: '010_email_verification_tokens.sql',
  m11: '011_enable_rls_public.sql'
};

async function applyMigration(client, fileName) {
  const sql = fs.readFileSync(path.join(migrationsDir, fileName), 'utf8');
  await client.query(sql);
  console.log(`APPLIED ${fileName}`);
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set in backend/.env');
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const firstRow = async (sql) => (await client.query(sql)).rows[0];

  try {
    const baseSchema = await firstRow("SELECT to_regclass('public.users') IS NOT NULL AS ok;");
    if (!baseSchema.ok) {
      await applyMigration(client, migrationFiles.m1);
      await applyMigration(client, migrationFiles.m2);
    } else {
      console.log(`SKIP ${migrationFiles.m1}`);
      console.log(`SKIP ${migrationFiles.m2}`);
    }

    const authSchema = await firstRow("SELECT to_regclass('public.refresh_sessions') IS NOT NULL AS ok;");
    if (!authSchema.ok) {
      await applyMigration(client, migrationFiles.m3);
    } else {
      console.log(`SKIP ${migrationFiles.m3}`);
    }

    const savedSearchSchema = await firstRow("SELECT to_regclass('public.saved_searches') IS NOT NULL AS ok;");
    if (!savedSearchSchema.ok) {
      await applyMigration(client, migrationFiles.m4);
    } else {
      console.log(`SKIP ${migrationFiles.m4}`);
    }

    const alertDeliverySchema = await firstRow("SELECT to_regclass('public.alert_deliveries') IS NOT NULL AS ok;");
    if (!alertDeliverySchema.ok) {
      await applyMigration(client, migrationFiles.m5);
    } else {
      console.log(`SKIP ${migrationFiles.m5}`);
    }

    const paymentContext = await firstRow("SELECT COUNT(*) > 0 AS ok FROM information_schema.columns WHERE table_name='payments' AND column_name='membership_plan_id';");
    if (!paymentContext.ok) {
      await applyMigration(client, migrationFiles.m6);
    } else {
      console.log(`SKIP ${migrationFiles.m6}`);
    }

    const asyncJobsSchema = await firstRow("SELECT to_regclass('public.immersive_generation_jobs') IS NOT NULL AS ok;");
    if (!asyncJobsSchema.ok) {
      await applyMigration(client, migrationFiles.m7);
    } else {
      console.log(`SKIP ${migrationFiles.m7}`);
    }

    const workerOpsSchema = await firstRow("SELECT to_regclass('public.worker_heartbeats') IS NOT NULL AS ok;");
    if (!workerOpsSchema.ok) {
      await applyMigration(client, migrationFiles.m8);
    } else {
      console.log(`SKIP ${migrationFiles.m8}`);
    }

    const listingVideosSchema = await firstRow("SELECT to_regclass('public.listing_videos') IS NOT NULL AS ok;");
    if (!listingVideosSchema.ok) {
      await applyMigration(client, migrationFiles.m9);
    } else {
      console.log(`SKIP ${migrationFiles.m9}`);
    }

    const emailVerificationSchema = await firstRow("SELECT to_regclass('public.email_verification_tokens') IS NOT NULL AS ok;");
    if (!emailVerificationSchema.ok) {
      await applyMigration(client, migrationFiles.m10);
    } else {
      console.log(`SKIP ${migrationFiles.m10}`);
    }

    const rlsEnabledOnUsers = await firstRow("SELECT relrowsecurity AS ok FROM pg_class WHERE oid = 'public.users'::regclass;");
    if (!rlsEnabledOnUsers.ok) {
      await applyMigration(client, migrationFiles.m11);
    } else {
      console.log(`SKIP ${migrationFiles.m11}`);
    }

    console.log('MIGRATIONS_DONE');
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
