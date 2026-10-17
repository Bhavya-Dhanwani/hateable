import * as k8s from '@kubernetes/client-node';
import logger from '../config/logger.config.js';
import env from '../config/env.config.js';

const kc = new k8s.KubeConfig();
kc.loadFromCluster();

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

// function to build the init and app containers of a project type, shared by previews and deployments
function buildAppContainers(projectType: string) {
  let appImage = '';
  let appPort = 3000;
  let appCommand: string[] | undefined = undefined;

  let initContainers: k8s.V1Container[] = [];
  let appContainers: k8s.V1Container[] = [];

  if (projectType === 'next-js') {
    appImage = 'next-image-js';
    appPort = 3000;
  } else if (projectType === 'next-ts') {
    appImage = 'next-image-ts';
    appPort = 3000;
  } else if (projectType === 'node-js') {
    appImage = 'node-image-js';
    appPort = 5000;
  } else if (projectType === 'node-ts') {
    appImage = 'node-image-ts';
    appPort = 5000;
  } else if (projectType === 'react-js') {
    appImage = 'react-image-js';
    appPort = 5173;
    appCommand = ['npm', 'run', 'dev', '--', '--host'];
  } else if (projectType === 'react-ts') {
    appImage = 'react-image-ts';
    appPort = 5173;
    appCommand = ['npm', 'run', 'dev', '--', '--host'];
  }

  if (projectType === 'mern-js' || projectType === 'mern-ts') {
    const isTs = projectType === 'mern-ts';
    const clientImg = isTs ? 'mern-image-ts-client' : 'mern-image-js-client';
    const serverImg = isTs ? 'mern-image-ts-server' : 'mern-image-js-server';

    initContainers = [
      {
        name: 'init-client',
        image: clientImg,
        command: ['sh', '-c', 'mkdir -p /app-copy/client && cp -r /app/* /app-copy/client/'],
        volumeMounts: [
          {
            name: 'app-volume',
            mountPath: '/app-copy'
          }
        ]
      },
      {
        name: 'init-server',
        image: serverImg,
        command: ['sh', '-c', 'mkdir -p /app-copy/server && cp -r /app/* /app-copy/server/'],
        volumeMounts: [
          {
            name: 'app-volume',
            mountPath: '/app-copy'
          }
        ]
      }
    ];

    appContainers = [
      {
        name: 'client-container',
        image: clientImg,
        imagePullPolicy: 'IfNotPresent',
        ports: [{ containerPort: 5173 }],
        command: ['npm', 'run', 'dev', '--', '--host'],
        resources: {
          requests: { memory: '512Mi', cpu: '250m' },
          limits: { memory: '1024Mi', cpu: '500m' }
        },
        volumeMounts: [
          {
            name: 'app-volume',
            mountPath: '/app',
            subPath: 'client'
          }
        ]
      },
      {
        name: 'server-container',
        image: serverImg,
        imagePullPolicy: 'IfNotPresent',
        ports: [{ containerPort: 5000 }],
        command: ['npm', 'run', 'dev'],
        resources: {
          requests: { memory: '512Mi', cpu: '250m' },
          limits: { memory: '1024Mi', cpu: '500m' }
        },
        volumeMounts: [
          {
            name: 'app-volume',
            mountPath: '/app',
            subPath: 'server'
          }
        ]
      }
    ];
  } else {
    initContainers = [
      {
        name: 'init-container',
        image: appImage,
        command: ['sh', '-c', 'mkdir -p /app-copy && cp -r /app/* /app-copy/'],
        volumeMounts: [
          {
            name: 'app-volume',
            mountPath: '/app-copy'
          }
        ]
      }
    ];

    appContainers = [
      {
        name: 'app-container',
        image: appImage,
        imagePullPolicy: 'IfNotPresent',
        ports: [{ containerPort: appPort }],
        command: appCommand,
        resources: {
          requests: { memory: '1024Mi', cpu: '500m' },
          limits: { memory: '2048Mi', cpu: '1000m' }
        },
        volumeMounts: [
          {
            name: 'app-volume',
            mountPath: '/app'
          }
        ]
      }
    ];
  }

  return { initContainers, appContainers };
}

// function to build the env a sync container needs to reach the project files in S3
function syncEnv(projectId: string): k8s.V1EnvVar[] {
  return [
    {
      name: 'PROJECT_ID',
      value: projectId
    },
    {
      name: 'AWS_ACCESS_KEY_ID',
      valueFrom: {
        secretKeyRef: {
          name: 'aws',
          key: 'AWS_ACCESS_KEY_ID'
        }
      }
    },
    {
      name: 'AWS_SECRET_ACCESS_KEY',
      valueFrom: {
        secretKeyRef: {
          name: 'aws',
          key: 'AWS_SECRET_ACCESS_KEY'
        }
      }
    },
    {
      name: 'S3_BUCKET_NAME',
      value: env.S3_BUCKET_NAME
    },
    {
      name: 'AWS_REGION',
      value: env.AWS_REGION
    },
    {
      name: 'S3_ENDPOINT',
      value: env.S3_ENDPOINT // in-cluster S3 (k8s/s3-*.yml)
    }
  ];
}

export async function createPod(podName: string, projectId: string, projectType: string) {
  const { initContainers, appContainers } = buildAppContainers(projectType);

  const podManifest: k8s.V1Pod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: podName,
      labels: { app: podName }
    },
    spec: {
      volumes: [
        {
          name: 'app-volume',
          emptyDir: {}
        }
      ],
      initContainers: initContainers,
      containers: [
        ...appContainers,
        {
          name: 'express-container',
          image: 'express-image',
          imagePullPolicy: 'IfNotPresent',
          ports: [{ containerPort: 8080 }],
          resources: {
            requests: { memory: '512Mi', cpu: '250m' },
            limits: { memory: '1024Mi', cpu: '500m' }
          },
          volumeMounts: [
            {
              name: 'app-volume',
              mountPath: '/app'
            }
          ]
        },
        {
          name: 'sync-container',
          image: 'sync-image',
          imagePullPolicy: 'IfNotPresent',
          resources: {
            requests: { memory: '256Mi', cpu: '100m' },
            limits: { memory: '512Mi', cpu: '250m' }
          },
          volumeMounts: [
            {
              name: 'app-volume',
              mountPath: '/app'
            }
          ],
          env: syncEnv(projectId)
        }
      ]
    }
  };

  const response = await k8sApi.createNamespacedPod({
    namespace: 'default',
    body: podManifest
  });

  logger.info(`Pod ${podName} created successfully in namespace default.`);
  logger.info(`Response: ${JSON.stringify(response)}`);
}

/**
 * Creates the pod that serves a deployment.
 *
 * Unlike a preview it has no file server and no live sync: an extra init container
 * runs the sync image once (`SYNC_ONCE`) to restore the frozen snapshot from
 * `deployments/<slug>/` over the boilerplate, so the app starts on the deployed files.
 */
export async function createDeploymentPod(
  podName: string,
  snapshotId: string,
  projectType: string
) {
  const { initContainers, appContainers } = buildAppContainers(projectType);

  const podManifest: k8s.V1Pod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: podName,
      labels: { app: podName, 'hateable/role': 'deployment' }
    },
    spec: {
      volumes: [
        {
          name: 'app-volume',
          emptyDir: {}
        }
      ],
      initContainers: [
        ...initContainers,
        {
          name: 'restore-snapshot',
          image: 'sync-image',
          // untagged => default pull policy Always, so nodes never run a stale sync image without SYNC_ONCE
          volumeMounts: [
            {
              name: 'app-volume',
              mountPath: '/app'
            }
          ],
          env: [...syncEnv(snapshotId), { name: 'SYNC_ONCE', value: 'true' }]
        }
      ],
      containers: appContainers
    }
  };

  await k8sApi.createNamespacedPod({
    namespace: 'default',
    body: podManifest
  });

  logger.info(`Deployment pod ${podName} created successfully in namespace default.`);
}

export async function createService(serviceName: string, podName: string, projectType: string) {
  let targetPort = 3000;
  if (projectType === 'next-js' || projectType === 'next-ts') {
    targetPort = 3000;
  } else if (projectType === 'node-js' || projectType === 'node-ts') {
    targetPort = 5000;
  } else if (
    projectType === 'react-js' ||
    projectType === 'react-ts' ||
    projectType === 'mern-js' ||
    projectType === 'mern-ts'
  ) {
    targetPort = 5173;
  }

  const ports: k8s.V1ServicePort[] = [
    { protocol: 'TCP', port: 80, targetPort: targetPort, name: 'preview-port' },
    { protocol: 'TCP', port: 8000, targetPort: 8080, name: 'file-server-port' }
  ];

  if (
    projectType === 'mern-js' ||
    projectType === 'mern-ts' ||
    projectType === 'node-js' ||
    projectType === 'node-ts'
  ) {
    ports.push({ protocol: 'TCP', port: 5000, targetPort: 5000, name: 'backend-port' });
  }

  const serviceManifest: k8s.V1Service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: serviceName,
      labels: { app: podName }
    },
    spec: {
      selector: { app: podName },
      ports: ports,
      type: 'ClusterIP'
    }
  };

  const response = await k8sApi.createNamespacedService({
    namespace: 'default',
    body: serviceManifest
  });

  logger.info(`Service ${serviceName} created successfully in namespace default.`);
  logger.info(`Response: ${JSON.stringify(response)}`);
}

function isNotFound(error: unknown) {
  return (error as { code?: number })?.code === 404;
}

// Pod deletion is graceful (async): resolve only once the pod is really gone, otherwise a
// relaunch that recreates the same pod name right away fails with 409 "object is being deleted".
export async function deletePod(podName: string, timeoutMs = 90_000) {
  try {
    await k8sApi.deleteNamespacedPod({ namespace: 'default', name: podName });
  } catch (error) {
    if (isNotFound(error)) return;
    throw error;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await k8sApi.readNamespacedPod({ namespace: 'default', name: podName });
    } catch (error) {
      if (isNotFound(error)) {
        console.log(`Pod ${podName} deleted`);
        return;
      }
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for pod ${podName} to be deleted`);
}

export async function deleteService(serviceName: string) {
  try {
    await k8sApi.deleteNamespacedService({ namespace: 'default', name: serviceName });
    console.log(`Service ${serviceName} deleted`);
  } catch (error) {
    if (isNotFound(error)) return;
    throw error;
  }
}
