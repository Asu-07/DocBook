/**
 * Production build — browser calls the deployed backend directly (no proxy).
 *
 * After deploying the FastAPI backend on Render, replace the URL below with
 * your Render service URL (e.g. https://docbook-backend.onrender.com/api/v1)
 * and commit + push so Vercel rebuilds.
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://docbook-backend.onrender.com/api/v1',
};
