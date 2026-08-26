import * as k8s from "@kubernetes/client-node";
import logger from "../config/logger.config.js";

async function createPod(podName: string, _projectId: string) {
    const kc = new k8s.KubeConfig();
    kc.loadFromCluster();

    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

    const podManifest: k8s.V1Pod = {
        apiVersion: "v1",
        kind: "Pod",
        metadata: {
            name: podName,
            labels: { app: podName }
        },
        spec: {
            containers: [
                {
                    name: "nextjs-container",
                    image: "nextjs-image:v2",
                    imagePullPolicy: "IfNotPresent",
                    ports: [{ containerPort: 3000 }],
                    resources: {
                        requests: { memory: "1024Mi", cpu: "500m" },
                        limits: { memory: "2048Mi", cpu: "1000m" }
                    }
                }
            ]
        }
    };

    const response = await k8sApi.createNamespacedPod({
        namespace: "default",
        body: podManifest
    });

    logger.info(`Pod ${podName} created successfully in namespace default.`);
    logger.info(`Response: ${JSON.stringify(response)}`);
}

export default createPod;

