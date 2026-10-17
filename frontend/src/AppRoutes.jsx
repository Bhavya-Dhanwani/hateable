import { Navigate, Outlet, Route, Routes } from 'react-router';
import { useAuth } from './auth/auth-context.js';
import { LoadingScreen } from './components/LoadingScreen.jsx';
import { AnalyticsPage } from './pages/AnalyticsPage.jsx';
import { AuthPage } from './pages/AuthPage.jsx';
import { LandingPage } from './pages/LandingPage.jsx';
import { ProjectsPage } from './pages/ProjectsPage.jsx';
import { WorkspacePage } from './pages/WorkspacePage.jsx';

function ProtectedRoute() {
  const { user, isRestoring } = useAuth();
  if (isRestoring) return <LoadingScreen label="Restoring your session" />;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function GuestRoute() {
  const { user, isRestoring } = useAuth();
  if (isRestoring) return <LoadingScreen label="Checking your session" />;
  return user ? <Navigate to="/projects" replace /> : <Outlet />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:projectId" element={<WorkspacePage />} />
        <Route path="/projects/:projectId/analytics" element={<AnalyticsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
