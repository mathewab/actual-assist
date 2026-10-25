"""Render-only regression check: environment changes must replace running pods."""
import re
import subprocess


def checksum(*values):
    command = [
        "helm", "template", "fixture", "charts/actual-assist",
        "--show-only", "templates/deployment.yaml",
        "--set", "secrets.create=false",
        "--set", "secrets.existingSecretName=fixture-secret",
    ]
    for value in values:
        command.extend(["--set", value])
    manifest = subprocess.check_output(command, text=True)
    match = re.search(r'checksum/config: "([a-f0-9]{64})"', manifest)
    assert match, "Deployment pod template must carry a config checksum"
    return match.group(1)


disabled = checksum("integrations.enabled=false")
enabled = checksum("integrations.enabled=true")
origin = checksum("integrations.enabled=true", "integrations.allowedOrigins[0]=https://fixture.invalid")
assert len({disabled, enabled, origin}) == 3, "Enable/origin changes must change the pod template"
assert checksum("integrations.enabled=false") == disabled, "Config rendering must be deterministic"
print("Integration enable/disable/origin rollout checksums verified")
