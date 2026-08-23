import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken } from '../utils/auth';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      setToken(token);
      navigate('/dashboard', { replace: true });
    } else {
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
