# Content Factory demo

A multi-tenant content-generation demo. The Node server serves the dashboard and the Hook Lab API from one service.

## Run locally

1. Copy `.env.example` to `.env` and add an OpenAI API key.
2. Run `npm start`.
3. Open `http://localhost:3000`.

The browser keeps the setup progress, Hook Lab keepers, and carousel-editor changes in local storage. They remain on the same browser/device; clearing site data resets the demo.

## Railway deployment

1. In Railway, create a new project and select **Deploy from GitHub repo**.
2. Select `Guiltyme212/content-engine` and the branch you want to deploy (the first release uses `agent/content-factory-demo-release`).
3. Railway reads `railway.toml`, uses Railpack, and runs `npm start`.
4. Before testing Hook Lab, add `OPENAI_API_KEY` in the service's **Variables** tab. Optional defaults are `MODEL_PROVIDER=openai` and `MODEL_NAME=gpt-4o`.
5. Generate a Railway domain from **Settings > Networking** and verify the home page and Hook Lab.

`.env` stays local and is ignored by Git.
