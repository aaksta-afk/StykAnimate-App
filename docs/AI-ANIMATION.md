# Local AI agents: Claude Code, Codex and Antigravity

This fork's **StykAnimate MCP server** lets any of these local coding agents create and revise **editable stick-figure animations** without a separate OpenAI/Anthropic API key. The *agent client* (Claude Code, Codex or Antigravity) supplies language understanding; the local Node server builds native project files deterministically.

There is no model call, API key, credential storage, project upload or internet request inside the MCP server.

## Requirements

- Clone this fork and check out the branch containing this feature.
- Install Node.js 22 or later.
- Open the **StykAnimate-App repository root** as the agent workspace. If it is not the workspace root, adjust the MCP server's file path to an absolute path in the agent configuration.
- Run the editor with \`npm ci\` and then \`npm start\` (desktop), or \`npm run serve\` (local browser). The MCP server itself has **no npm dependency** and can start with \`node scripts/styk-mcp.mjs\`.

## Connecting the agent

This repository includes local MCP configuration files:

| Agent | File in this repository | How to check |
| --- | --- | --- |
| Claude Code | \`.mcp.json\` | Open Claude Code in this repo, approve the project MCP server when asked, check \`/mcp\` |
| Codex CLI / extension | \`.codex/config.toml\` | Trust the repo, then run \`codex mcp list\` |
| Google Antigravity | \`.agents/mcp_config.json\` | Open Antigravity on the repo, look at MCP Servers / \`/mcp\` |

Some client installations require a manual, **absolute-path** registration; use one of these alternatives if the project-local configuration does not load:

**Claude Code**, from this repository:

\`\`\`sh
claude mcp add --scope local stykanimate -- node /ABSOLUTE/PATH/TO/StykAnimate-App/scripts/styk-mcp.mjs
\`\`\`

**Codex CLI**:

\`\`\`sh
codex mcp add stykanimate -- node /ABSOLUTE/PATH/TO/StykAnimate-App/scripts/styk-mcp.mjs
codex mcp list
\`\`\`

**Antigravity** raw custom MCP configuration (replace the path before using):

\`\`\`json
{
  "mcpServers": {
    "stykanimate": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/StykAnimate-App/scripts/styk-mcp.mjs"]
    }
  }
}
\`\`\`

In Antigravity IDE, use **MCP Servers > Manage MCP Servers > View raw config**. In the CLI, workspace configuration is \`.agents/mcp_config.json\`. The location and UI can vary by client release.

On Windows, provide an absolute Windows path such as \`C:\\Users\\you\\StykAnimate-App\\scripts\\styk-mcp.mjs\`. Use \`node\` from the PATH; if it is not found, replace it with your installed \`node.exe\` absolute path.

## Workflow

Tell Claude Code / Codex / Antigravity:

> Use the StykAnimate MCP tools to create a smooth 8-second 24-FPS animation of two stick figures fighting. One runs toward the other, jumps, kicks, gets blocked, and receives a counterpunch. Make it editable and give me the .styk project path.

The agent should:
1. Call \`animation_guide\` to see the permitted poses, keyframes, coordinate system and example.
2. Plan the choreography, choose enough keyframes, then call \`create_animation\` with a structured storyboard.
3. Return a new file path such as \`.styk-agent/animations/two-fighters-a1b2c3d4.styk\`.
4. You open **File > Open** in StykAnimate and select that \`.styk\` file.
5. For revisions, say "Move the kick 80px to the left" or "Add a jump before the last keyframe." The agent calls \`read_animation\`, \`edit_keyframe\`, \`append_keyframe\` or \`replace_animation\`, then you **reopen the .styk file** in StykAnimate to see the modified project.

The generated \`.styk\` file is intentionally stored in the legacy **JSON native project representation** which StykAnimate can read, even though its normal Save operation converts it to a compressed native container.

Output projects and original storyboards are kept under **\`.styk-agent/animations/\`** in the repository. This directory is gitignored to avoid accidentally committing personal animation assets. You can override it with the \`STYK_AGENT_DIR\` environment variable in the MCP process.

## MCP tools

- \`animation_guide\`: keyframe coordinate system, permitted poses and example.
- \`create_animation\`: new editable .styk file; never overwrites an existing animation.
- \`list_animations\`: list generated projects.
- \`read_animation\`: get the current keyframe source JSON.
- \`replace_animation\`: rewrite an existing animation's full storyboard.
- \`edit_keyframe\`: replace a specified keyframe with position, pose and duration.
- \`append_keyframe\`: extend an animation by adding a new keyframe.

A storyboard has 2–80 keyframes, one or two actors, 1–60 FPS, and at most 1,800 timeline ticks. Current rig poses are \`idle\`, \`walk1\`, \`walk2\`, \`run1\`, \`run2\`, \`punch\`, \`kick\`, \`block\`, \`jump\`, \`crouch\` and \`fall\`. Agents can also supply custom joint angles. This is a **simple articulated animation pipeline**, not a text-to-video diffusion model or realistic motion-capture system.

## Alternative: paste JSON directly into StykAnimate

The app also exposes **Agent Import** in the top bar. This lets you paste storyboard JSON generated in an agent chat, without first creating a file. Example:

\`\`\`json
{
  "title": "Jump and kick",
  "fps": 24,
  "frames": [
    {"duration": 12, "actors": [{"id": 1, "x": 250, "y": 300, "pose": "idle", "facing": 1}]},
    {"duration": 8, "actors": [{"id": 1, "x": 380, "y": 270, "pose": "jump", "facing": 1}]},
    {"duration": 1, "actors": [{"id": 1, "x": 490, "y": 300, "pose": "kick", "facing": 1}]}
  ]
}
\`\`\`

## Limits and safety

- This MCP server **edits project files**, not the live stage of an already running editor. It does not move on-screen limbs in real time or reload open projects automatically.
- To update an animation already open in StykAnimate, save your manual edits first, then reopen the agent-generated project. An agent edit rewrites that generated project and may replace manual changes to that same file; there is no automatic merge.
- The server only reads/writes its configured output directory, validates storyboard data and rejects path traversal identifiers.
- Agents can create/delete files using their *own* unrelated filesystem tools depending on permission settings; only the MCP tools described here are restricted.
- Tests: \`node --test tests/ai-animation.test.mjs tests/agent-mcp.test.mjs\`. The normal project checks also cover the included tests. No live agent-client handshake was verified from this environment.
