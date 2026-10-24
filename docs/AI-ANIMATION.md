# AI Animation — editable keyframes from ChatGPT or Claude

This feature belongs to the **aaksta-afk/StykAnimate-App fork**. It is not part of the upstream official application.

## Setup

In the repository, install the normal app dependencies (see README) and launch from a terminal that has an API key set **before** launch.

For OpenAI:

```sh
export OPENAI_API_KEY="your-api-key"
npm run serve
```

For Anthropic:

```sh
export ANTHROPIC_API_KEY="your-api-key"
npm run serve
```

Windows PowerShell equivalents:

```powershell
$env:OPENAI_API_KEY="your-api-key"
npm run serve
```

or `$env:ANTHROPIC_API_KEY="your-api-key"`. To use the desktop application instead, run `npm start` from the same environment. Do not put keys in Git, frontend code, saved projects, or screenshots.

Optional model override: `STYK_OPENAI_MODEL` (default `gpt-4o-mini`) and `STYK_ANTHROPIC_MODEL` (default `claude-sonnet-4-5`).

Click **AI Animation** in the top toolbar; choose a provider; describe the motion; click **Generate animation**. The app opens a **new, editable project** (existing unsaved work is protected by the normal project transition). Inspect and edit poses/keyframes before exporting video.

**Important:** The assistant's ChatGPT/Claude subscription is not equivalent to API credits. Provider API usage requires a separately provisioned API key, account access, and may incur charges.

Only your entered prompt is sent to the selected external provider. The native project, other tabs and assets stay local. The proxy runs on the loopback Python codec host, checks the existing desktop token, bounds inputs and output, and uses only official provider endpoints. The browser's independently deployed/offline build has no built-in AI provider backend; use the JSON option or run the local server.

## Paste storyboard JSON without an API key

Ask ChatGPT or Claude for JSON with these constraints, then select **Or paste a storyboard JSON** in AI Animation:

```json
{
  "title": "Two fighters",
  "fps": 24,
  "frames": [
    {"duration": 12, "actors": [
      {"id": 1, "x": 270, "y": 300, "pose": "idle", "facing": 1},
      {"id": 2, "x": 660, "y": 300, "pose": "block", "facing": -1}
    ]},
    {"duration": 10, "actors": [
      {"id": 1, "x": 425, "y": 275, "pose": "jump", "facing": 1},
      {"id": 2, "x": 660, "y": 300, "pose": "block", "facing": -1}
    ]},
    {"duration": 1, "actors": [
      {"id": 1, "x": 480, "y": 300, "pose": "kick", "facing": 1},
      {"id": 2, "x": 660, "y": 300, "pose": "fall", "facing": -1}
    ]}
  ]
}
```

Each frame is a **keyframe**, not a rendered frame. `duration` is a number of ticks until the next key; the last key is held for one tick. Poses: `idle`, `walk1`, `walk2`, `run1`, `run2`, `punch`, `kick`, `block`, `jump`, `crouch`, `fall`. Actor IDs are 1 and 2. Each actor has an `x`/`y` hip position within a 960×540 stage and a facing direction (+1 or -1).

Optional `angles` may contain exactly ten finite segment angles in radians, overriding a preset; these are for expert usage. Automatic interpolation is linear. The adapter supports at most 80 keyframes, two actors, 1800 total ticks, and 1–60 FPS. The scene is currently designed for **simple stick-figure choreography**, not AI video/image generation, lip sync, multi-layer VFX, or complex physical simulation.

## Developer notes

- `backend/ai_animation.py`: provider HTTP requests, validation, fixed official endpoints, bound response bytes and timeout. No API key ever reaches the renderer.
- `backend/server.py`: authenticated `POST /api/ai/animate` endpoint.
- `src/ai-animation.mjs`: pure storyboard validation and editable native report construction.
- `src/ai-animation-ui.mjs`: prompt dialog, local service call, and pasted JSON fallback.
- `src/app.mjs`: opens a new tab using `openProject` and `editor.loadAsync`.

Run `node --test tests/ai-animation.test.mjs` and `python -m unittest discover -s backend -p "test_ai_animation.py"`. Live API calls are not part of automated tests and must be tested separately with your own provider credentials. An offline/browser build can use JSON import but not direct provider generation.
