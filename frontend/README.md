# RoomRental Frontend

This workspace contains a responsive web app and a mobile app shell that integrate with the RoomRental backend.

## Structure
- `web`: React + Vite web app
- `mobile`: Expo / React Native mobile app
- `shared`: API client and shared design tokens

## Backend Integration
Set the API base URL in:
- `frontend/web/.env.example`
- `frontend/mobile/.env.example`

Default backend target:
- `http://localhost:4100/api`

## Run
From `frontend/`:
- `npm run web`
- `npm run mobile`
- `npm run health-check`

## Design Notes
- The web app uses a dense, premium dashboard layout for students and landlords in Tier 2/Tier 3 cities.
- The mobile app uses a simplified tab-based experience with the same backend API client.
- Shared API methods live in `shared/api.js` so both platforms stay in sync.
