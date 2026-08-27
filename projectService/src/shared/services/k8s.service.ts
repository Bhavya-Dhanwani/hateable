import * as k8s from "@kubernetes/client-node";
import logger from "../config/logger.config.js";

const kc = new k8s.KubeConfig();
kc.loadFromCluster();

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

export async function createPod(podName: string, _projectId: string) {

    const podManifest: k8s.V1Pod = {
        apiVersion: "v1",
        kind: "Pod",
        metadata: {
            name: podName,
            labels: { app: podName }
        },
        spec: {
            volumes: [
                {
                    name: "app-volume",
                    emptyDir: {}
                }
            ],
            initContainers: [
                {
                    name: "init-container",
                    image: "nextjs-image",
                    command: ["sh", "-c", "mkdir -p /app-copy && cp -r /app/* /app-copy/"],
                    volumeMounts: [
                        {
                            name: "app-volume",
                            mountPath: "/app-copy"
                        }
                    ]
                }
            ],
            containers: [
                {
                    name: "nextjs-container",
                    image: "nextjs-image",
                    imagePullPolicy: "IfNotPresent",
                    ports: [{ containerPort: 3000 }],
                    resources: {
                        requests: { memory: "1024Mi", cpu: "500m" },
                        limits: { memory: "2048Mi", cpu: "1000m" }
                    },
                    volumeMounts: [
                        {
                            name: "app-volume",
                            mountPath: "/app",
                            // subPath: "app-copy"
                        }
                    ]
                },
                 {
                    name: "express-container",
                    image: "express-image",
                    imagePullPolicy: "IfNotPresent",
                    ports: [{ containerPort: 8080 }],
                    resources: {
                        requests: { memory: "512Mi", cpu: "250m" },
                        limits: { memory: "1024Mi", cpu: "500m" }
                    },
                    volumeMounts: [
                        {
                            name: "app-volume",
                            mountPath: "/app"
                        }
                    ]
                 }
            ]
        }, 
    };

    const response = await k8sApi.createNamespacedPod({
        namespace: "default",
        body: podManifest
    });

    logger.info(`Pod ${podName} created successfully in namespace default.`);
    logger.info(`Response: ${JSON.stringify(response)}`);
}

export async function createService(serviceName: string, podName: string) {

    const serviceManifest: k8s.V1Service = {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
            name: serviceName,
            labels: { app: podName }
        },
        spec: {
            selector: { app: podName },
            ports: [
                { protocol: "TCP", port: 80, targetPort: 3000, name: "preview-port" },
                { protocol: "TCP", port: 8000, targetPort: 8080, name: "file-server-port" }
            ],
            type: "LoadBalancer"
        }
    };

    const response = await k8sApi.createNamespacedService({
        namespace: "default",
        body: serviceManifest
    });

    logger.info(`Service ${serviceName} created successfully in namespace default.`);
    logger.info(`Response: ${JSON.stringify(response)}`);

}

function isNotFound(error: unknown) {
    return (error as { code?: number })?.code === 404
}

export async function deletePod(podName: string) {
    try {
        await k8sApi.deleteNamespacedPod({ namespace: "default", name: podName })
        console.log(`Pod ${podName} deleted`)
    } catch (error) {
        if (isNotFound(error)) return
        throw error
    }
}

export async function deleteService(serviceName: string) {
    try {
        await k8sApi.deleteNamespacedService({ namespace: "default", name: serviceName })
        console.log(`Service ${serviceName} deleted`)
    } catch (error) {
        if (isNotFound(error)) return
        throw error
    }
}