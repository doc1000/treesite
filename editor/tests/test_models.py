from __future__ import annotations

from uuid import UUID

import pytest
from pydantic import ValidationError

from treesite_editor.models import ArtifactMeta, ContentItem


def test_content_item_valid_uuid() -> None:
    item = ContentItem.model_validate(
        {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "name": "Card",
            "slug": "card",
            "section": "Home",
            "type": "text",
        }
    )
    assert isinstance(item.id, UUID)


def test_content_item_invalid_uuid() -> None:
    with pytest.raises(ValidationError):
        ContentItem.model_validate(
            {
                "id": "not-a-uuid",
                "name": "Card",
                "slug": "card",
                "section": "Home",
                "type": "text",
            }
        )


def test_content_item_requires_id() -> None:
    with pytest.raises(ValidationError):
        ContentItem.model_validate(
            {
                "name": "Card",
                "slug": "card",
                "section": "Home",
                "type": "text",
            }
        )


def test_artifact_meta_requires_schema_version() -> None:
    with pytest.raises(ValidationError):
        ArtifactMeta.model_validate(
            {
                "name": "x",
                "displayName": "X",
                "tagline": "t",
                "defaultSchemeId": "content-default",
            }
        )
