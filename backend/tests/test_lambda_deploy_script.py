from __future__ import annotations

import json
import re

import pytest

from aws.scripts import deploy_lambda


def test_image_tag_uses_validated_build_id() -> None:
    tag = deploy_lambda.image_tag_for_build("release-17.2+cpu_debug")

    assert tag == deploy_lambda.image_tag_for_build("release-17.2+cpu_debug")
    assert re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", tag)
    assert tag != "latest"
    with pytest.raises(ValueError, match="SAFEANES_BUILD_ID"):
        deploy_lambda.image_tag_for_build("release/17")


def test_image_reference_is_not_latest_only() -> None:
    first = deploy_lambda.image_uri_for_build("release-17")
    second = deploy_lambda.image_uri_for_build("release-18")

    assert first.startswith("127091441306.dkr.ecr.ap-southeast-1.amazonaws.com/safeanes-inference:")
    assert not first.endswith(":latest")
    assert first != second


def test_deploy_output_includes_ecr_digest_without_secret_values(monkeypatch, capsys) -> None:
    digest = "sha256:" + ("a" * 64)
    secret = "never-print-this-service-token"
    commands = []

    def fake_run_cmd(command: str, check: bool = True) -> str:
        commands.append(command)
        if "describe-images" in command:
            return json.dumps({"imageDetails": [{"imageDigest": digest}]})
        if "get-function-url-config" in command:
            return json.dumps({"FunctionUrl": "https://safeanes-staging.lambda-url.example/"})
        if "get-function " in command:
            return json.dumps({"Configuration": {"State": "Active"}})
        return ""

    monkeypatch.setattr(deploy_lambda, "run_cmd", fake_run_cmd)
    monkeypatch.setenv("SAFEANES_INFERENCE_SERVICE_TOKEN", secret)

    url = deploy_lambda.deploy("release-17")
    output = capsys.readouterr().out

    assert url == "https://safeanes-staging.lambda-url.example/"
    assert "release-17" in output
    assert digest in output
    assert secret not in output
    assert all(secret not in command for command in commands)
    update_commands = [command for command in commands if "update-function-code" in command]
    assert len(update_commands) == 1
    assert f"--image-uri 127091441306.dkr.ecr.ap-southeast-1.amazonaws.com/safeanes-inference@{digest}" in update_commands[0]
    assert all(":latest" not in command for command in commands)
