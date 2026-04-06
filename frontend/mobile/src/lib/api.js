const DEFAULT_API_BASE_URL = 'http://localhost:4100/api';

function getEnv() {
	if (typeof process !== 'undefined' && process.env) {
		return process.env;
	}

	return {};
}

export function resolveApiBaseUrl() {
	const env = getEnv();
	return env.VITE_API_BASE_URL || env.EXPO_PUBLIC_API_BASE_URL || env.API_BASE_URL || DEFAULT_API_BASE_URL;
}

function buildQuery(params = {}) {
	const query = new URLSearchParams();

	Object.entries(params).forEach(([key, value]) => {
		if (value === undefined || value === null || value === '') {
			return;
		}

		query.set(key, String(value));
	});

	const queryString = query.toString();
	return queryString ? `?${queryString}` : '';
}

async function requestJson(baseUrl, path, { method = 'GET', token = null, body = null } = {}) {
	const response = await fetch(`${baseUrl}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});

	const text = await response.text();
	let payload = null;
	try {
		payload = text ? JSON.parse(text) : null;
	} catch {
		payload = { raw: text };
	}

	if (!response.ok) {
		const error = new Error(payload?.message || `Request failed for ${path}`);
		error.status = response.status;
		error.payload = payload;
		throw error;
	}

	return payload;
}

export function createRoomRentalClient({ baseUrl = resolveApiBaseUrl(), token = null } = {}) {
	return {
		baseUrl,
		token,
		login: (identifier, password) => requestJson(baseUrl, '/auth/login', {
			method: 'POST',
			body: { identifier, password }
		}),
		register: (payload) => requestJson(baseUrl, '/auth/register', {
			method: 'POST',
			body: payload
		}),
		resendVerification: (identifier) => requestJson(baseUrl, '/auth/resend-verification', {
			method: 'POST',
			body: { identifier }
		}),
		fetchHealth: () => requestJson(baseUrl, '/health'),
		fetchListings: (params = {}) => requestJson(baseUrl, `/listings${buildQuery(params)}`),
		fetchStudentListings: (params = {}) => requestJson(baseUrl, `/students/listings/search${buildQuery(params)}`, { token }),
		fetchLocalityInsights: (params = {}) => requestJson(baseUrl, `/students/localities/insights${buildQuery(params)}`),
		fetchStudentDashboard: () => requestJson(baseUrl, '/dashboard/student/me', { token }),
		fetchLandlordDashboard: () => requestJson(baseUrl, '/dashboard/landlord/me', { token }),
		fetchAdminOverview: () => requestJson(baseUrl, '/dashboard/admin/overview', { token }),
		fetchAdminTrends: (days = 14) => requestJson(baseUrl, `/dashboard/admin/trends${buildQuery({ days })}`, { token }),
		fetchQueueHealth: () => requestJson(baseUrl, '/admin/ops/queues', { token }),
		fetchWorkerHealth: () => requestJson(baseUrl, '/admin/ops/workers', { token }),
		fetchDeadLetters: (params = {}) => requestJson(baseUrl, `/admin/ops/dead-letters${buildQuery(params)}`, { token }),
		fetchAuditLogs: (params = {}) => requestJson(baseUrl, `/admin/audit-logs${buildQuery(params)}`, { token }),
		fetchPlans: () => requestJson(baseUrl, '/memberships/plans'),
		fetchMembership: () => requestJson(baseUrl, '/memberships/me', { token }),
		fetchProfile: () => requestJson(baseUrl, '/profile/me', { token }),
		updateProfile: (payload) => requestJson(baseUrl, '/profile/me', {
			method: 'PUT',
			token,
			body: payload
		}),
		createCheckout: (payload) => requestJson(baseUrl, '/memberships/checkout', {
			method: 'POST',
			token,
			body: payload
		}),
		confirmCheckout: (payload) => requestJson(baseUrl, '/memberships/checkout/confirm', {
			method: 'POST',
			token,
			body: payload
		}),
		fetchSavedSearches: (params = {}) => requestJson(baseUrl, `/students/saved-searches${buildQuery(params)}`, { token }),
		createSavedSearch: (payload) => requestJson(baseUrl, '/students/saved-searches', {
			method: 'POST',
			token,
			body: payload
		}),
		updateSavedSearch: (savedSearchId, payload) => requestJson(baseUrl, `/students/saved-searches/${savedSearchId}`, {
			method: 'PUT',
			token,
			body: payload
		}),
		deleteSavedSearch: (savedSearchId) => requestJson(baseUrl, `/students/saved-searches/${savedSearchId}`, {
			method: 'DELETE',
			token
		}),
		fetchSavedListings: (params = {}) => requestJson(baseUrl, `/engagement/saved-listings${buildQuery(params)}`, { token }),
		fetchStudentAlerts: (params = {}) => requestJson(baseUrl, `/students/alerts${buildQuery(params)}`, { token }),
		fetchConversations: () => requestJson(baseUrl, '/chats/conversations', { token }),
		fetchConversation: (conversationId) => requestJson(baseUrl, `/chats/conversations/${conversationId}`, { token }),
		fetchMessages: (conversationId, params = {}) => requestJson(baseUrl, `/chats/conversations/${conversationId}/messages${buildQuery(params)}`, { token }),
		sendMessage: (conversationId, payload) => requestJson(baseUrl, `/chats/conversations/${conversationId}/messages`, {
			method: 'POST',
			token,
			body: payload
		}),
		createConversation: (payload) => requestJson(baseUrl, '/chats/conversations', {
			method: 'POST',
			token,
			body: payload
		}),
		fetchImmersive: (listingId) => requestJson(baseUrl, `/immersive/listings/${listingId}`),
		fetchRoommates: (params = {}) => requestJson(baseUrl, `/students/roommates/matches${buildQuery(params)}`, { token }),
		fetchRoommateProfile: () => requestJson(baseUrl, '/students/roommates/me', { token }),
		updateRoommateProfile: (payload) => requestJson(baseUrl, '/students/roommates/me', {
			method: 'PUT',
			token,
			body: payload
		}),
		saveListing: (listingId) => requestJson(baseUrl, `/engagement/saved-listings/${listingId}`, {
			method: 'POST',
			token
		}),
		fetchMyInquiries: (params = {}) => requestJson(baseUrl, `/engagement/inquiries/me${buildQuery(params)}`, { token }),
		fetchReceivedInquiries: (params = {}) => requestJson(baseUrl, `/engagement/inquiries/received${buildQuery(params)}`, { token }),
		createInquiry: (listingId, payload = {}) => requestJson(baseUrl, `/engagement/listings/${listingId}/inquiries`, {
			method: 'POST',
			token,
			body: payload
		}),
		createListing: (payload) => requestJson(baseUrl, '/listings', {
			method: 'POST',
			token,
			body: payload
		}),
		addListingImage: (listingId, payload) => requestJson(baseUrl, `/listings/${listingId}/images`, {
			method: 'POST',
			token,
			body: payload
		})
	};
}

export { buildQuery, requestJson };
