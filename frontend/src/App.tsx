// Root component of the ReachInbox frontend. Sets up client-side routing
// (login, OAuth callback, and the main dashboard) and the global toast
// notification host. Rendered into the DOM by frontend/src/main.tsx.
// Closely related to: utils/auth.ts (login-state check used to gate the
// dashboard route), pages/Login.tsx, pages/Dashboard.tsx, pages/AuthCallback.tsx.
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AuthCallback from './pages/AuthCallback';
import { isLoggedIn } from './utils/auth';
import type { ReactNode } from 'react';

/**
 * Route guard that only renders its children when the user has a stored
 * auth token; otherwise redirects to the login page. Used to protect the
 * /dashboard route below.
 *
 * @param children - The protected page content to render when logged in.
 */
function PrivateRoute({ children }: { children: ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: { fontSize: '14px' },
        }}
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
