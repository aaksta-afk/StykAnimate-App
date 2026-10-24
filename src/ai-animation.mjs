/**
 * Small, validated AI storyboard -> editable native Pivot document adapter.
 * The model never supplies a native project or arbitrary application metadata.
 */
import {emptyDocument, defaultFigure, createObject, createFrame} from './demo.mjs';

const POSES = Object.freeze({
  idle:  [-1.57,-1.57, 1.12,1.32, 2.02,1.82, 1.22,1.55, 1.92,1.55],
  walk1: [-1.57,-1.57, 0.9,1.8, 2.2,1.6, 0.65,1.0, 2.45,1.8],
  walk2: [-1.57,-1.57, 2.2,1.5, 0.9,1.8, 2.45,1.8, 0.65,1.0],
  run1:  [-1.57,-1.57, 0.45,1.8, 2.6,1.5, 0.4,1.1, 2.75,1.5],
  run2:  [-1.57,-1.57, 2.6,1.5, 0.45,1.8, 2.75,1.5, 0.4,1.1],
  punch: [-1.57,-1.57, 0.05,0.0, 2.2,1.8, 1.2,1.6, 1.95,1.6],
  kick:  [-1.57,-1.57, 1.2,1.1, 2.0,1.9, 0.10,0.0, 2.15,1.65],
  block: [-1.57,-1.57,-0.35,-1.0, 3.45,4.1, 1.3,1.5, 1.85,1.55],
  jump:  [-1.57,-1.57,-0.65,-1.4, 3.8,4.7, 0.7,2.3, 2.45,0.9],
  crouch:[-1.57,-1.57, 1.0,1.8, 2.1,1.3, 0.55,2.7, 2.6,0.3],
  fall:  [0,0, -0.5,-0.3, 0.7,0.3, -0.7,0.9, 0.6,-0.9],
});
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const plain = value => value && typeof value === 'object' && !Array.isArray(value);

export function validateStoryboard(input) {
  const value = plain(input) && plain(input.storyboard) ? input.storyboard : input;
  if (!plain(value)) throw new TypeError('Storyboard must be a JSON object.');
  if (!Array.isArray(value.frames) || value.frames.length < 2 || value.frames.length > 80)
    throw new RangeError('Storyboard must contain 2–80 keyframes.');
  if (value.fps !== undefined && (!Number.isInteger(value.fps) || value.fps < 1 || value.fps > 60))
    throw new RangeError('Frame rate must be 1–60 FPS.');
  if (value.title !== undefined && (typeof value.title !== 'string' || value.title.length > 100))
    throw new TypeError('Animation title must be short text.');
  let total = 0;
  const frames = value.frames.map((frame, index) => {
    if (!plain(frame) || !Number.isInteger(frame.duration) || frame.duration < 1 || frame.duration > 120)
      throw new RangeError(`Keyframe ${index + 1}: duration must be 1–120 ticks.`);
    total += frame.duration;
    if (total > 1800) throw new RangeError('Animation may not exceed 1800 ticks.');
    if (!Array.isArray(frame.actors) || frame.actors.length < 1 || frame.actors.length > 2)
      throw new TypeError(`Keyframe ${index + 1}: expected 1 or 2 actors.`);
    const seen = new Set();
    const actors = frame.actors.map(actor => {
      if (!plain(actor) || !Number.isInteger(actor.id) || ![1,2].includes(actor.id) || seen.has(actor.id))
        throw new TypeError(`Keyframe ${index + 1}: actor id must be unique (1 or 2).`);
      seen.add(actor.id);
      if (!finite(actor.x, 0, 960) || !finite(actor.y, 0, 540))
        throw new RangeError(`Keyframe ${index + 1}: actor coordinates must fit the 960×540 stage.`);
      if (!Object.hasOwn(POSES, actor.pose)) throw new TypeError(`Unknown pose: ${String(actor.pose)}.`);
      if (actor.facing !== undefined && ![-1,1].includes(actor.facing))
        throw new TypeError('Facing must be -1 or 1.');
      if (actor.angles !== undefined &&
          (!Array.isArray(actor.angles) || actor.angles.length !== 10 ||
           !actor.angles.every(n => finite(n,-12.6,12.6))))
        throw new TypeError('Custom angles must contain ten finite radian values.');
      return {
        id:actor.id, x:actor.x, y:actor.y, pose:actor.pose,
        facing:actor.facing ?? 1,
        ...(actor.angles ? {angles:[...actor.angles]} : {}),
      };
    });
    return {duration:frame.duration, actors};
  });
  return {title:(value.title || 'AI animation').trim() || 'AI animation',fps:value.fps ?? 24,frames};
}

/** Returns an independent, fully editable project; never mutates the open one. */
export function storyboardToDocument(input) {
  const storyboard = validateStoryboard(input);
  const document = emptyDocument();
  const figure = defaultFigure(1);
  document.figure_types = [figure];
  document.fps = storyboard.fps;
  document._styk.name = storyboard.title;
  const last = new Map();
  const ids = new Set(storyboard.frames.flatMap(frame => frame.actors.map(actor => actor.id)));
  document.keyframes = storyboard.frames.map((frame, index) => {
    for (const actor of frame.actors) last.set(actor.id,actor);
    const objects = [...ids].sort().filter(id=>last.has(id)).map(id => {
      const actor = last.get(id);
      const angles = actor.angles ?? POSES[actor.pose];
      const item = createObject(figure,id,actor.x,actor.y);
      item.angles = actor.facing === -1 ? angles.map(a => Math.PI-a) : [...angles];
      return item;
    });
    const key = createFrame(objects,index === storyboard.frames.length - 1 ? 1 : frame.duration);
    key._styk = {easing:{interpolation:'linear'}};
    return key;
  });
  return document;
}

export const AI_POSES = Object.keys(POSES);
