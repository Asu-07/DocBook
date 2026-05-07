/**
 * Production build — browser calls the deployed backend directly (no proxy).
 * Backend is hosted on Railway.
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://docbook-production-ae8f.up.railway.app/api/v1',
};
