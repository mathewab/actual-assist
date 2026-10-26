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
