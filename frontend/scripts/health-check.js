import { createRoomRentalClient } from '../shared/api.js';

async function main() {
  const client = createRoomRentalClient({
    baseUrl: process.env.HEALTH_CHECK_API_BASE_URL || 'http://localhost:4100/api',
    token: process.env.HEALTH_CHECK_AUTH_TOKEN || null
  });

  const results = {
    health: await client.fetchHealth(),
    plans: await client.fetchPlans(),
    listings: await client.fetchListings({ status: 'active', limit: 1 })
  };

  if (process.env.HEALTH_CHECK_AUTH_TOKEN) {
    try {
      results.dashboard = await client.fetchAdminOverview();
    } catch (error) {
      results.dashboardError = error.message;
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
