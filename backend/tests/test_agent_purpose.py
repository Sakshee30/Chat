from __future__ import annotations

from httpx import AsyncClient


async def test_agent_purpose_is_backward_compatible_and_round_trips(
    client: AsyncClient, auth_headers: dict[str, str]
) -> None:
    legacy_create = await client.post(
        "/api/v1/agents",
        headers=auth_headers,
        json={"name": "Legacy Purpose Default", "description": "Created without purpose"},
    )
    assert legacy_create.status_code == 201, legacy_create.text
    assert legacy_create.json()["purpose"] == "support"

    education_create = await client.post(
        "/api/v1/agents",
        headers=auth_headers,
        json={
            "name": "Education Purpose Agent",
            "description": "Education metadata test",
            "template": "education",
            "purpose": "education",
        },
    )
    assert education_create.status_code == 201, education_create.text
    education_agent = education_create.json()
    assert education_agent["purpose"] == "education"

    updated = await client.patch(
        f"/api/v1/agents/{education_agent['id']}",
        headers=auth_headers,
        json={"purpose": "lead_generation"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["purpose"] == "lead_generation"

    duplicate = await client.post(
        f"/api/v1/agents/{education_agent['id']}/duplicate",
        headers=auth_headers,
        json={"name": "Purpose Duplicate", "deploymentChannel": "whatsapp"},
    )
    assert duplicate.status_code == 201, duplicate.text
    assert duplicate.json()["purpose"] == "lead_generation"

    invalid = await client.patch(
        f"/api/v1/agents/{education_agent['id']}",
        headers=auth_headers,
        json={"purpose": "sales"},
    )
    assert invalid.status_code == 422
