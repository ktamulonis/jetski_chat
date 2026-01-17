# Jetski Chat

Jetski Chat is a living showcase for the brand-new Jetski framework. It is the
first production-style app built on Jetski, and it doubles as a proving ground
for new ideas, streaming UX, and experimental gems like Kinship.

## Why This App Is Special
- First chat app built on Jetski, used to validate core framework features.
- Designed to test streaming UI patterns in a real app, not just demos.
- Acts as a sandbox for new gems and framework APIs.

## Jetski vs Rails (Quick Contrast)
- No `routes.rb`: routes are inferred from controller actions.
- No `has_many` / `belongs_to`: Kinship infers relationships from schema columns.
- Fewer moving parts: controllers, models, views, assets, and you are done.

## Streaming + Append (Built for This App)
Jetski now supports streaming message updates using Server-Sent Events (SSE).
This app drove two key features:
- **Append streaming**: `append` updates a single field incrementally (token by
  token) without reloading the full model. This keeps long responses smooth,
  responsive, and low-bandwidth.
- **Patch streaming**: `patch` updates fields with minimal payloads, emitting
  stream events for the UI to react to in real time.

## Kinship (Automatic Relationships)
Kinship is a new gem that builds a relationship graph from your schema. Instead
of hand-writing associations, it discovers parent/child links from columns like
`chat_id` or `message_id`.

Why it matters:
- Less duplicated knowledge in model code.
- A graph view of your domain for debugging and planning.
- Cleaner models with fewer macros.

## Project Layout
- `app/controllers/`: Jetski controllers and actions (routes inferred here).
- `app/models/`: Data models for `Chat` and `Message`.
- `app/views/`: ERB templates for the chat UI.
- `app/assets/`: CSS, JS, and images.

## Development
```sh
bundle install
bundle exec jetski server
```

Open `http://localhost:8000` and start a chat.

## Local AI (Ollama + Llama 3.2)
This app is built to use Ollama running locally with the `llama3.2` model.
Download Ollama here: https://ollama.com/download
In another terminal, make sure Ollama is installed and the model is available:
```sh
ollama pull llama3.2
ollama run llama3.2
```

If Ollama is already running, you can skip the commands above and just start the app.
