import { Navigate, Outlet, Route, Routes, useParams } from 'react-router';
import { useAuth } from './auth/auth-context.js';
import { LoadingScreen } from './components/LoadingScreen.jsx';
import { AnalyticsPage } from './pages/deployment/AnalyticsPage.jsx';
import { DeploymentLayout } from './pages/deployment/DeploymentLayout.jsx';
import { DomainsPage } from './pages/deployment/DomainsPage.jsx';
import { OverviewPage } from './pages/deployment/OverviewPage.jsx';
import { AssistantPage, EnvironmentPage, LogsPage } from './pages/deployment/SimplePages.jsx';
import { AuthPage } from './pages/AuthPage.jsx';
import { LandingPage } from './pages/LandingPage.jsx';
import { ProjectsPage } from './pages/ProjectsPage.jsx';
import { WorkspacePage } from './pages/WorkspacePage.jsx';
import { MembersPage } from './pages/MembersPage.jsx';

function OldAnalyticsRedirect() {
  const { projectId } = useParams();
  return <Navigate to={`/projects/${projectId}/deployment/analytics`} replace />;
}

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
        <Route path="/workspaces/:workspaceId" element={<MembersPage />} />
        <Route path="/projects/:projectId/deployment" element={<DeploymentLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="domains" element={<DomainsPage />} />
          <Route path="environment" element={<EnvironmentPage />} />
          <Route path="assistant" element={<AssistantPage />} />
        </Route>
        {/* the old single-page dashboard URL */}
        <Route path="/projects/:projectId/analytics" element={<OldAnalyticsRedirect />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
