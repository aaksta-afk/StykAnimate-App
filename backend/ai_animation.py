"""Bounded local proxy from a natural-language prompt to an editable stick-animation storyboard.

No project data is uploaded. API credentials are read only from the local
server process environment and never sent to the editor or persisted.
"""
from __future__ import annotations

import json
import math
import os
import urllib.error
import urllib.request


class AIAnimationError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code = status, code


SYSTEM = """You are a keyframe choreographer for a 2D stick-figure animation editor.
Return ONLY one valid JSON object, with no Markdown and no explanations:
{
  "title": "Short descriptive title",
  "fps": 24,
  "frames": [
    {"duration": 12, "actors": [
      {"id": 1, "x": 270, "y": 295, "pose": "idle", "facing": 1}
    ]}
  ]
}
Coordinate system: 960x540 pixels, x rightward, y downward. x/y are actor hips.
Resting hips are near y=290-310, feet near y=430. A jump reduces y.
A scene may contain one or two actors: use actor IDs 1 and/or 2 consistently.
For two actors use ID 1 on left, ID 2 on right initially. To face left use -1.
Each frame describes a pose KEY, NOT all intermediate rendered frames.
Every actor visible at a keyframe should be included (max two).
Choose ONLY these pose names: idle, walk1, walk2, run1, run2, punch,
kick, block, jump, crouch, fall. Alternate run1/run2 or walk1/walk2 while moving.
A 'duration' is the number of 1/fps seconds before the next key (1-120).
Generate 4-24 meaningful keyframes, maximum 80, total duration <= 1800 ticks.
Include a final keyframe with duration 1; the editor interpolates between keys.
Use clear dramatic motion and plausible contact spacing. Do not generate code.
"""

MAX_REPLY = 512 * 1024
API_ENDPOINTS = {
    "openai": "https://api.openai.com/v1/chat/completions",
    "anthropic": "https://api.anthropic.com/v1/messages",
}


def validate_storyboard(value):
    """Reject unbounded, malformed or unexpected remote keyframe data."""
    if not isinstance(value, dict):
        raise AIAnimationError(502, "ai_invalid_output", "AI returned an invalid storyboard object.")
    frames = value.get("frames")
    if not isinstance(frames, list) or not 2 <= len(frames) <= 80:
        raise AIAnimationError(502, "ai_invalid_output", "AI must return between 2 and 80 keyframes.")
    fps = value.get("fps", 24)
    if type(fps) is not int or not 1 <= fps <= 60:
        raise AIAnimationError(502, "ai_invalid_output", "Invalid AI frame rate.")
    title = value.get("title", "AI animation")
    if not isinstance(title, str) or len(title) > 100:
        raise AIAnimationError(502, "ai_invalid_output", "Invalid AI animation title.")
    poses = {"idle", "walk1", "walk2", "run1", "run2", "punch",
             "kick", "block", "jump", "crouch", "fall"}
    total = 0
    for frame in frames:
        if not isinstance(frame, dict):
            raise AIAnimationError(502, "ai_invalid_output", "Invalid frame.")
        duration = frame.get("duration")
        if type(duration) is not int or not 1 <= duration <= 120:
            raise AIAnimationError(502, "ai_invalid_output", "Invalid frame duration.")
        total += duration
        if total > 1800:
            raise AIAnimationError(502, "ai_invalid_output", "Animation is too long.")
        actors = frame.get("actors")
        if not isinstance(actors, list) or not 1 <= len(actors) <= 2:
            raise AIAnimationError(502, "ai_invalid_output", "A frame must contain one or two actors.")
        seen = set()
        for actor in actors:
            if not isinstance(actor, dict):
                raise AIAnimationError(502, "ai_invalid_output", "Invalid actor.")
            uid = actor.get("id")
            if type(uid) is not int or uid not in (1, 2) or uid in seen:
                raise AIAnimationError(502, "ai_invalid_output", "Invalid actor id.")
            seen.add(uid)
            if actor.get("pose") not in poses:
                raise AIAnimationError(502, "ai_invalid_output", "Unknown animation pose.")
            for axis, hi in (("x", 960), ("y", 540)):
                coord = actor.get(axis)
                if type(coord) not in (float, int) or not math.isfinite(coord) or not 0 <= coord <= hi:
                    raise AIAnimationError(502, "ai_invalid_output", "Actor is outside the stage.")
            facing = actor.get("facing", 1)
            if type(facing) is not int or facing not in (-1, 1):
                raise AIAnimationError(502, "ai_invalid_output", "Invalid actor orientation.")
            angles = actor.get("angles")
            if angles is not None and (not isinstance(angles, list) or len(angles) != 10 or
                    any(type(value) not in (float, int) or not math.isfinite(value) or
                        not -12.6 <= value <= 12.6 for value in angles)):
                raise AIAnimationError(502, "ai_invalid_output", "Invalid custom joint angles.")
    return {"title": title, "fps": fps, "frames": frames}


def _parse_response(provider, response):
    try:
        if provider == "openai":
            content = response["choices"][0]["message"]["content"]
        else:
            content = "".join(item.get("text", "") for item in response["content"]
                              if item.get("type") == "text")
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return validate_storyboard(json.loads(content))
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        if isinstance(exc, AIAnimationError):
            raise
        raise AIAnimationError(502, "ai_invalid_output", "The AI response was not valid storyboard JSON.") from None


def generate_storyboard(request):
    if not isinstance(request, dict):
        raise AIAnimationError(400, "invalid_request", "Expected a JSON object.")
    provider = request.get("provider")
    if provider not in API_ENDPOINTS:
        raise AIAnimationError(400, "invalid_provider", "Choose OpenAI or Anthropic.")
    prompt = request.get("prompt")
    if not isinstance(prompt, str) or not 1 <= len(prompt.strip()) <= 4000:
        raise AIAnimationError(400, "invalid_prompt", "Enter a prompt of 1–4000 characters.")
    if provider == "openai":
        api_key = os.environ.get("OPENAI_API_KEY", "")
        model = os.environ.get("STYK_OPENAI_MODEL", "gpt-4o-mini")
        payload = {"model": model, "temperature": 0.5, "max_tokens": 6000,
                   "messages": [{"role": "system", "content": SYSTEM},
                                {"role": "user", "content": prompt}]}
        headers = {"Authorization": "Bearer " + api_key}
    else:
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        model = os.environ.get("STYK_ANTHROPIC_MODEL", "claude-sonnet-4-5")
        payload = {"model": model, "max_tokens": 6000,
                   "system": SYSTEM, "messages": [{"role": "user", "content": prompt}]}
        headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
    if not api_key:
        raise AIAnimationError(503, "ai_not_configured",
                               f"{provider.title()} API key is missing from the local server environment.")
    headers["Content-Type"] = "application/json"
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    message = urllib.request.Request(API_ENDPOINTS[provider], data=body,
                                     headers=headers, method="POST")
    try:
        with urllib.request.urlopen(message, timeout=60) as response:
            data = response.read(MAX_REPLY + 1)
        if len(data) > MAX_REPLY:
            raise AIAnimationError(502, "ai_reply_too_large", "AI returned too much data.")
        output = json.loads(data)
    except urllib.error.HTTPError as exc:
        status = exc.code
        if status in (401, 403):
            reason = "AI provider rejected the API key or account permissions."
        elif status == 429:
            reason = "AI provider rate limit or quota reached."
        else:
            reason = f"AI provider request failed (HTTP {status})."
        raise AIAnimationError(502, "ai_provider_error", reason) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise AIAnimationError(504, "ai_network_error", "Could not reach the AI provider.") from None
    except (ValueError, UnicodeDecodeError):
        raise AIAnimationError(502, "ai_invalid_output", "AI provider returned malformed JSON.") from None
    return _parse_response(provider, output)
