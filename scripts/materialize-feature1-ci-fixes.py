from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def replace(path: str, old: str, new: str) -> None:
    target = ROOT / path
    source = target.read_text(encoding="utf-8")
    if new in source:
        return
    if old not in source:
        raise SystemExit(f"Expected patch target was not found in {path}: {old[:80]!r}")
    target.write_text(source.replace(old, new, 1), encoding="utf-8")


# Agent Purpose compatibility for Agents synthesized from the public widget bootstrap.
replace(
    "frontend/src/lib/api.ts",
    "description: 'Grounded AI assistant', instructions: '', status: 'active', tone: 'friendly', language,",
    "description: 'Grounded AI assistant', instructions: '', status: 'active', purpose: 'support', tone: 'friendly', language,",
)

# Respect an input that React already auto-focused instead of moving focus to the close button.
replace(
    "frontend/src/components/ui.tsx",
    "      const first = dialogRef.current?.querySelector<HTMLElement>(focusableSelector);\n      (first ?? dialogRef.current)?.focus();",
    "      if (!dialogRef.current?.contains(document.activeElement)) {\n        const first = dialogRef.current?.querySelector<HTMLElement>(focusableSelector);\n        (first ?? dialogRef.current)?.focus();\n      }",
)

# Give the Help search input the semantic role its accessible label/tests expect.
replace(
    "frontend/src/components/help/HelpSearchBox.tsx",
    '<input id="help-search-input" autoFocus={autoFocus}',
    '<input id="help-search-input" type="search" autoFocus={autoFocus}',
)

# Associate Help support labels with their controls.
replace(
    "frontend/src/pages/HelpSupportPage.tsx",
    '<Field label="Category"><select value={category}',
    '<Field label="Category" htmlFor="help-support-category"><select id="help-support-category" value={category}',
)
replace(
    "frontend/src/pages/HelpSupportPage.tsx",
    '<Field label="Subject"><input value={subject}',
    '<Field label="Subject" htmlFor="help-support-subject"><input id="help-support-subject" value={subject}',
)
replace(
    "frontend/src/pages/HelpSupportPage.tsx",
    '<Field label="Description" hint="Do not include passwords, tokens, API keys, Meta credentials, full conversations, or customer knowledge."><textarea rows={7}',
    '<Field label="Description" htmlFor="help-support-description" hint="Do not include passwords, tokens, API keys, Meta credentials, full conversations, or customer knowledge."><textarea id="help-support-description" rows={7}',
)

# Help pages depend directly on helpApi. Mock that boundary instead of replacing lib/api
# and accidentally removing ApiError/apiConfig exports used by help-api itself.
for test_path in (
    "frontend/src/components/help/HelpSearchBox.test.tsx",
    "frontend/src/pages/HelpArticlePage.test.tsx",
    "frontend/src/pages/HelpCenterPage.test.tsx",
    "frontend/src/pages/HelpSearchPage.test.tsx",
    "frontend/src/pages/HelpSupportPage.test.tsx",
):
    replace(
        test_path,
        "vi.mock('@/lib/api', () => ({ api: { help: apiMocks } }));",
        "vi.mock('@/lib/help-api', () => ({ helpApi: apiMocks }));",
    )

# Strict mypy fixes in the existing Help search/content and chat services.
replace(
    "backend/src/northstar_api/services/help_search.py",
    "def _visible(role: Role):",
    "def _visible(role: Role) -> str:",
)
replace(
    "backend/src/northstar_api/services/help_search.py",
    "            article, cat = by_id.get(article_id, (None, None))\n            if article is None or cat is None:\n                continue",
    "            pair = by_id.get(article_id)\n            if pair is None:\n                continue\n            article, cat = pair",
)

# Rename only the portable semantic-search accumulator; its PostgreSQL sibling intentionally keeps `best`.
search_path = ROOT / "backend/src/northstar_api/services/help_search.py"
search_source = search_path.read_text(encoding="utf-8")
portable_marker = "\n        chunks = ("
if "portable_best: dict[UUID, tuple[float, str]]" not in search_source:
    if portable_marker not in search_source:
        raise SystemExit("Expected portable Help semantic-search block was not found")
    prefix, suffix = search_source.split(portable_marker, 1)
    replacements = (
        ("        best: dict[UUID, tuple[float, str]] = {}", "        portable_best: dict[UUID, tuple[float, str]] = {}"),
        ("previous = best.get(chunk.article_id)", "previous = portable_best.get(chunk.article_id)"),
        ("best[chunk.article_id] = (score, chunk.content)", "portable_best[chunk.article_id] = (score, chunk.content)"),
        ("best.items()", "portable_best.items()"),
    )
    for old, new in replacements:
        if old not in suffix:
            raise SystemExit(f"Expected portable Help semantic-search patch target was not found: {old!r}")
        suffix = suffix.replace(old, new, 1)
    search_path.write_text(prefix + portable_marker + suffix, encoding="utf-8")

replace(
    "backend/src/northstar_api/services/help_content.py",
    "import yaml\n",
    "import yaml  # type: ignore[import-untyped]\n",
)
replace(
    "backend/src/northstar_api/services/help_content.py",
    "        vectors = await nvidia_adapter.embed_documents(texts)\n        return vectors, get_settings().nvidia_embedding_model",
    "        vectors = await nvidia_adapter.embed_documents(texts)\n        typed_vectors: list[list[float] | None] = [vector for vector in vectors]\n        return typed_vectors, get_settings().nvidia_embedding_model",
)
replace(
    "backend/src/northstar_api/services/help_content.py",
    "    for article in existing_rows:\n        if article.slug not in active_slugs and article.status != HelpArticleStatus.ARCHIVED:\n            article.status = HelpArticleStatus.ARCHIVED",
    "    for existing_article in existing_rows:\n        if (\n            existing_article.slug not in active_slugs\n            and existing_article.status != HelpArticleStatus.ARCHIVED\n        ):\n            existing_article.status = HelpArticleStatus.ARCHIVED",
)
replace(
    "backend/src/northstar_api/services/chat.py",
    "            return await translator(question, agent.language, agent.model_profile)",
    "            return str(await translator(question, agent.language, agent.model_profile))",
)
