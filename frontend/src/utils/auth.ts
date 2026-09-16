// Small helper module for storing/reading the JWT issued by the backend
// after Google login, using the browser's localStorage so the session
// survives page reloads. Used by utils/api.ts (attaching the token to
// requests), App.tsx (route guarding), and the auth-related pages.
const TOKEN_KEY = 'reachinbox_token';

/** Reads the stored JWT, or null if the user isn't logged in. */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Persists a freshly issued JWT (called from AuthCallback.tsx after OAuth). */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Removes the stored JWT, effectively logging the user out client-side. */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Convenience check: true if a token is currently stored. */
export function isLoggedIn(): boolean {
  return !!getToken();
}
