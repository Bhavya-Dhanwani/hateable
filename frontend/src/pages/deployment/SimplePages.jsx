import { useParams } from 'react-router';
import { DeploymentLogs } from '../../components/deployment/DeploymentLogs.jsx';
import { EnvEditor } from '../../components/deployment/EnvEditor.jsx';
import { SiteAssistant } from '../../components/deployment/SiteAssistant.jsx';
import { PageHeader } from './DeploymentLayout.jsx';

// The deployment pages that are one component each: a title plus that component.

export function LogsPage() {
  const { projectId } = useParams();
  return (
    <>
      <PageHeader
        title="Logs"
        description="What happened to the site, and what it printed. Dev-server noise is filtered out."
      />
      <div className="mt-8">
        <DeploymentLogs projectId={projectId} />
      </div>
    </>
  );
}

export function EnvironmentPage() {
  const { projectId } = useParams();
  return (
    <>
      <PageHeader
        title="Environment"
        description="Variables your site reads at start-up, like API keys and database URLs."
      />
      <div className="mt-8">
        <EnvEditor projectId={projectId} />
      </div>
    </>
  );
}

export function AssistantPage() {
  const { projectId } = useParams();
  return (
    <>
      <PageHeader
        title="Ask AI"
        description="Answers from your site's own logs, activity and analytics."
      />
      <div className="mt-8">
        <SiteAssistant projectId={projectId} />
      </div>
    </>
  );
}
