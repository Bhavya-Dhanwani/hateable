[CmdletBinding()]
param(
    [string[]]$WorkerNodes = @("desktop-worker", "desktop-worker2", "desktop-worker3")
)

$ErrorActionPreference = "Stop"
$workspaceRoot = Split-Path -Parent $PSCommandPath

function Invoke-CheckedCommand {
    param(
        [string]$Description,
        [scriptblock]$Command
    )

    Write-Host $Description
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed with exit code $LASTEXITCODE."
    }
}

Push-Location $workspaceRoot
try {
    # Keep these image names aligned with k8s/auth-deployment.yml,
    # k8s/project-deployment.yml, and k8s.service.ts.
    $imageBuilds = @(
        @{ ImageName = "auth-image"; Context = ".\authService" },
        @{ ImageName = "project-image"; Context = ".\projectService" },
        @{ ImageName = "nextjs-image:v2"; Context = ".\nextjsboilerplate" }
    )

    foreach ($imageBuild in $imageBuilds) {
        $imageName = $imageBuild.ImageName
        $buildContext = $imageBuild.Context

        Invoke-CheckedCommand "Building $imageName from $buildContext..." {
            docker build -t $imageName $buildContext
        }

        foreach ($workerNode in $WorkerNodes) {
            # PowerShell text pipelines corrupt Docker's binary image archive, so use cmd.exe here.
            Invoke-CheckedCommand "Loading $imageName into $workerNode..." {
                cmd.exe /c "docker save $imageName | docker exec -i $workerNode ctr -n k8s.io images import -"
            }
        }
    }

    Invoke-CheckedCommand "Applying Kubernetes manifests..." {
        kubectl apply -f .\k8s
    }

    Invoke-CheckedCommand "Restarting auth-deployment..." {
        kubectl rollout restart deployment/auth-deployment
    }

    Invoke-CheckedCommand "Restarting project-deployment..." {
        kubectl rollout restart deployment/project-deployment
    }

    Invoke-CheckedCommand "Waiting for auth-deployment..." {
        kubectl rollout status deployment/auth-deployment --timeout=180s
    }

    Invoke-CheckedCommand "Waiting for project-deployment..." {
        kubectl rollout status deployment/project-deployment --timeout=180s
    }

    Write-Host "Done. All application images were rebuilt and deployments were recreated."
}
finally {
    Pop-Location
}

