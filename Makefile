.PHONY: serve:api test:api

serve:api:
	cd editor && uvicorn treesite_editor.api.main:app --reload --port 8000

test:api:
	cd editor && pytest tests/test_api.py -v

api-schema:
	cd editor && python -c "from treesite_editor.api.main import app; import json; print(json.dumps(app.openapi(), indent=2))" > ../docs/api-schema.json
