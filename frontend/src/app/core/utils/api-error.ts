import { HttpErrorResponse } from '@angular/common/http';

/** FastAPI returns `detail` as a string, or a list of validation errors for 422. */
export function formatApiError(err: HttpErrorResponse, fallback: string): string {
  if (err.status === 0) {
    return 'Cannot reach the server. Start the backend (uvicorn on port 8000) and check your network / CORS.';
  }
  const d = err.error?.detail;
  if (typeof d === 'string') {
    return d;
  }
  if (Array.isArray(d)) {
    return d
      .map((item: { msg?: string; loc?: unknown[] }) => item.msg ?? JSON.stringify(item))
      .join(' ');
  }
  if (d && typeof d === 'object' && 'message' in d) {
    return String((d as { message: string }).message);
  }
  return fallback;
}
