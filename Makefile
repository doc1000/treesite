.PHONY: serve:api serve:mcp test:api test:mcp test:integration test:all

serve:api:
	cd editor && uvicorn treesite_editor.api.main:app --reload --port 8000

serve:mcp:
	cd editor && python -m treesite_editor.mcp.server

test:api:
	cd editor && pytest tests/test_api.py -v

test:mcp:
	cd editor && pytest tests/test_mcp.py -v

test:integration:
	cd editor && pytest tests/test_integration.py -v

test:all:
	npm run test:tools && cd editor && pytest tests -v

api-schema:
	cd editor && python -c "from treesite_editor.api.main import app; import json; print(json.dumps(app.openapi(), indent=2))" > ../docs/api-schema.json
