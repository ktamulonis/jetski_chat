# Repository Guidelines

## Project Structure & Module Organization
This is a Jetski MVC app with the standard layout under `app/`.
- `app/controllers/`: Actions define routes (no `routes.rb`).
- `app/models/`: Models like `chat.rb` and `message.rb`.
- `app/views/`: ERB templates and layout.
- `app/assets/`: CSS, JS, images.
- `test.db`: Local SQLite DB file.

## Build, Test, and Development Commands
- `bundle install`: Install Ruby gem dependencies from `Gemfile`.
- `bundle exec jetski server`: Start the Jetski server locally.
- `bundle exec jetski console`: Open a console with models loaded.

## Coding Style & Naming Conventions
- Indentation: 2 spaces for Ruby/ERB/CSS/JS; Ruby uses `snake_case` and `CamelCase`.
- File naming: controllers plural (`chats_controller.rb`), models singular (`chat.rb`).
- Assets: controller-specific CSS/JS auto-load when named after the controller.
- Keep controller actions small; move data logic into models as it grows.

## Jetski & Kinship Notes
- Routes come from controller actions; non-CRUD actions default to GET unless you
  override with `route` (example: `route :save, path: "my-path"`).
- Jetski serves assets from `app/assets/**` at `/<filename>` (example: `/jetski-logo.png`).
- Streaming helpers (from Jetski tests):
  - `Jetski::Model.patch(id, attrs)` emits stream events and avoids mutating old instances.
  - `Jetski::Model.append(id, field, delta)` appends text, treating `nil` as empty.
  - Instance `#patch` and `#append` delegate to the class methods.
  - `Jetski::Stream.subscribe`, `Jetski::Stream.unsubscribe`, `Jetski::Stream.broadcast`.
  - `Jetski::Events.subscribe(:model_patched)` and `/stream` SSE endpoint.
- Kinship infers relationships from schema columns like `chat_id`. Keep foreign keys
  consistent so it can build a clean graph.
- Kinship API surface used in tests: `Kinship.build(models:, attribute_provider:)`,
  plus `parents(model)`, `children(model)`, `families`, `path(from, to)`, and `to_dot`.
- If you introduce Kinship usage in code, create a shared `KINSHIP` instance during
  boot and reuse it instead of rebuilding per request.

## Testing Guidelines
No app-level automated tests are present. Verify in a browser and include manual
steps; if you add tests, document the command and folder (`test/` or `spec/`).

## Commit & Pull Request Guidelines
Recent history uses short, imperative subjects (e.g., “Add streaming chat MVP”).
- Commits: concise, imperative subject line; add body context if needed.
- PRs: describe changes, list manual test steps, add screenshots for UI changes.

## Configuration & Data Notes
Keep local data in `test.db` and avoid committing secrets. Document new env vars
in `README.md`.
