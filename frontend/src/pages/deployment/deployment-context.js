import { useOutletContext } from 'react-router';

// deployment pages read the shared summary DeploymentLayout loads: { info, reload, url }
export const useDeployment = () => useOutletContext();
