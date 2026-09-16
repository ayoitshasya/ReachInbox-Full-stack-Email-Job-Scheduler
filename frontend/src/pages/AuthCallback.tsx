// Landing page for the Google OAuth redirect (/auth/callback). The backend
// (backend/src/routes/auth.ts) sends the browser here with a signed JWT in
// the query string after a successful login; this page just needs to pick
// that token up, store it, and continue on to the dashboard.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken } from '../utils/auth';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      // Persist the JWT (see utils/auth.ts) so future API calls (utils/api.ts's
      // request interceptor) can attach it automatically.
      setToken(token);
      navigate('/dashboard', { replace: true });
    } else {
      // Reaching this page without a token means the OAuth flow didn't
      // complete as expected — send the user back to try again.
      navigate('/login?error=no_token', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center text-gray-500">
      <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
        <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Signing you in...
    </div>
  );
}
