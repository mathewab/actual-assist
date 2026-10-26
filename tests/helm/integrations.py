"""Render-only regressions for configuration rollout and single-writer storage."""
import re
import subprocess


def render(template, *values, success=True):
    command = [
        "helm", "template", "fixture", "charts/actual-assist",
        "--show-only", f"templates/{template}.yaml",
        "--set", "secrets.create=false",
        "--set", "secrets.existingSecretName=fixture-secret",
    ]
    for value in values:
        command.extend(["--set", value])
    result = subprocess.run(command, text=True, capture_output=True)
    if success:
        assert result.returncode == 0, result.stderr
        return result.stdout
    assert result.returncode != 0, "Invalid values must fail chart validation"
    return result.stderr


def checksum(*values):
    manifest = render("deployment", *values)
    match = re.search(r'checksum/config: "([a-f0-9]{64})"', manifest)
    assert match, "Deployment pod template must carry a config checksum"
    return match.group(1)


disabled = checksum("integrations.enabled=false")
enabled = checksum("integrations.enabled=true")
origin = checksum("integrations.enabled=true", "integrations.allowedOrigins[0]=https://fixture.invalid")
scheduler_disabled = checksum("env.scheduledSyncEnabled=false")
assert len({disabled, enabled, origin, scheduler_disabled}) == 4, "Environment changes must alter the pod template"
assert checksum("integrations.enabled=false") == disabled, "Config rendering must be deterministic"

original_pvc = render("pvc")
restored = "storage.existingClaim=fixture-restored-copy"
assert render("pvc", restored) == original_pvc, "External claims must not remove/change the original managed PVC"
assert original_pvc.count("kind: PersistentVolumeClaim") == 1
assert re.search(r'^  name: fixture-actual-assist-data$', original_pvc, re.M)
assert re.search(r'^    - ReadWriteOnce$', original_pvc, re.M)
for values, claim in [((), "fixture-actual-assist-data"), ((restored,), "fixture-restored-copy")]:
    deployment = render("deployment", *values)
    assert re.search(r'^  replicas: 1$', deployment, re.M)
    assert re.search(r'^  strategy:\n    type: Recreate$', deployment, re.M)
    assert re.search(rf'^          claimName: "{claim}"$', deployment, re.M)
    assert "rollingUpdate:" not in deployment
assert "  replicas: 0\n" in render("deployment", "app.replicaCount=0")
for invalid in ["2", "-1", "1.5"]:
    assert "replicaCount" in render("deployment", f"app.replicaCount={invalid}", success=False)
assert '  SCHEDULED_SYNC_ENABLED: "true"' in render("configmap")
assert '  SCHEDULED_SYNC_ENABLED: "false"' in render("configmap", "env.scheduledSyncEnabled=false")
print("Configuration rollouts, preserved PVC, external claim, Recreate and replica constraints verified")

# Tunnel support is opt-in and cannot be enabled on the UI listener.
assert "mcp-tunnel" not in render("deployment")
assert '  INTEGRATIONS_LISTENER: "shared"' in render("configmap")
assert "loopback" in render("deployment", "tunnel.enabled=true", success=False)
private = ["integrations.enabled=true", "integrations.listener=loopback"]
assert "verified" in render("deployment", *private, "tunnel.enabled=true", success=False)
tunnel = private + [
    "tunnel.enabled=true", "tunnel.image=ghcr.io/openai/tunnel-client@sha256:" + "a" * 64,
    "tunnel.tunnelId=tunnel_fixture", "tunnel.existingSecretName=fixture-tunnel-secret",
]
manifest = render("deployment", *tunnel)
assert 'name: mcp-tunnel' in manifest
assert 'args: ["--config", "/etc/tunnel/config.yaml"]' in manifest
assert 'name: "fixture-tunnel-secret"' in manifest
assert 'key: "runtime-api-key"' in manifest
assert 'key: "actual-authorization-header"' in manifest
assert "containerPort: 3001" not in manifest and "containerPort: 8080" not in manifest
assert "hostPort:" not in manifest and "hostNetwork:" not in manifest
assert manifest.count("mountPath: /data") == 1, "Tunnel must not mount budget storage"
assert render("service", *tunnel) == render("service"), "No new Service port"
config = render("tunnel-configmap", *tunnel)
assert "http://127.0.0.1:3001/integrations/mcp" in config
assert "listen_addr: 127.0.0.1:8080" in config
assert "Authorization: env:ACTUAL_MCP_AUTHORIZATION" in config
assert "poll_channels: [main]" in config
assert render("pvc", *tunnel) == original_pvc
assert "reserved" in render("deployment", *tunnel, "integrations.port=8080", success=False)
assert "differ" in render("deployment", *private, "integrations.port=3000", success=False)
assert "tunnelId" in render("deployment", *tunnel, "tunnel.tunnelId=", success=False)
assert "existingSecretName" in render("deployment", *tunnel, "tunnel.existingSecretName=", success=False)
assert "verified" in render("deployment", *tunnel, "tunnel.image=ghcr.io/openai/tunnel-client:latest", success=False)
def tunnel_checksum(*extra):
    return re.search(r'checksum/tunnel: "([a-f0-9]{64})"', render("deployment", *tunnel, *extra)).group(1)
assert tunnel_checksum() != tunnel_checksum("tunnel.tunnelId=tunnel_fixture_two")
print("Private listener, tunnel guards, scoped secret refs and unchanged Service/PVC verified")

for key in ["runtimeKeyKey", "authorizationHeaderKey"]:
    assert key in render("deployment", *tunnel, f"tunnel.{key}=", success=False)
