// Top navigation bar shown on the dashboard: app branding, the logged-in
// user's avatar/name/email, and a logout button. Used by pages/Dashboard.tsx.
import type { User } from '../types';
import { clearToken } from '../utils/auth';
import { authApi } from '../utils/api';
import Button from './Button';

interface HeaderProps {
  user: User;
  // Called after logout completes so the parent (Dashboard) can navigate away.
  onLogout: () => void;
}

/**
 * App header displaying the current user's identity and a logout control.
 *
 * @param user - The currently authenticated user's profile.
 * @param onLogout - Callback invoked once the token is cleared, so the
 *                    parent can redirect to the login page.
 */
export default function Header({ user, onLogout }: HeaderProps) {
  async function handleLogout() {
    try {
      // Best-effort call to let the server know (useful if/when server-side
      // session invalidation is added later); JWTs are stateless so this
      // isn't required for the client-side logout to work.
      await authApi.logout();
    } catch {
      // best-effort, proceed regardless
    }
    clearToken();
    onLogout();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white px-6 py-3">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-blue-600 px-2.5 py-1.5">
            <span className="text-sm font-bold text-white">RI</span>
          </div>
          <span className="font-semibold text-gray-900">ReachInbox</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="h-8 w-8 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                {user.name[0]?.toUpperCase()}
              </div>
            )}
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleLogout}
          >
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
