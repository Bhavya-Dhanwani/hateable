// projectService hands out port-80 URLs (previews, deployments); in dev the ingress is
// port-forwarded to 8088 instead (skaffold.yaml), so point links there. Empty in prod.
const INGRESS_PORT = import.meta.env.VITE_PREVIEW_PORT ?? '8088';

export function withIngressPort(url) {
  if (!url || !INGRESS_PORT) return url;
  const parsed = new URL(url);
  parsed.port = INGRESS_PORT;
  return parsed.toString().replace(/\/$/, '');
}
