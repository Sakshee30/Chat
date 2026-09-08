from __future__ import annotations

from httpx import AsyncClient


async def test_workspace_profile_and_white_label_are_tenant_scoped(
    client: AsyncClient,
    auth_headers: dict[str, str],
) -> None:
    current = await client.get("/api/v1/workspace", headers=auth_headers)
    assert current.status_code == 200, current.text
    original = current.json()
    assert original["id"]
    assert original["memberCount"] >= 1

    branding = {
        **original["whiteLabel"],
        "companyName": "Example Support",
        "primaryColor": "#123456",
        "secondaryColor": "#654321",
        "customDomain": "chat.example.com",
        "dnsStatus": "pending",
        "removePlatformBranding": True,
    }
    updated = await client.patch(
        "/api/v1/workspace",
        headers=auth_headers,
        json={"whiteLabel": branding},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["whiteLabel"]["companyName"] == "Example Support"
    assert updated.json()["whiteLabel"]["customDomain"] == "chat.example.com"

    invalid = await client.patch(
        "/api/v1/workspace",
        headers=auth_headers,
        json={"whiteLabel": {**branding, "primaryColor": "blue"}},
    )
    assert invalid.status_code == 422

    restored = await client.patch(
        "/api/v1/workspace",
        headers=auth_headers,
        json={"name": original["name"], "slug": original["slug"], "whiteLabel": original["whiteLabel"]},
    )
    assert restored.status_code == 200, restored.text
