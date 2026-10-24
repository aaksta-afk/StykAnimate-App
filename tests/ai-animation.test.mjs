import test from 'node:test';
import assert from 'node:assert/strict';
import {storyboardToDocument,validateStoryboard} from '../src/ai-animation.mjs';
import {prepareEditorLoad} from '../src/editor-load.mjs';

const sample = {
  title:'Fight demo',fps:24,
  frames:[
    {duration:12,actors:[{id:1,x:200,y:280,pose:'idle'},{id:2,x:650,y:280,pose:'block',facing:-1}]},
    {duration:12,actors:[{id:1,x:320,y:270,pose:'run1'},{id:2,x:650,y:280,pose:'block',facing:-1}]},
    {duration:1,actors:[{id:1,x:440,y:260,pose:'kick'},{id:2,x:650,y:280,pose:'fall',facing:-1}]},
  ],
};

test('AI storyboard creates editable native project with stable actor identities', () => {
  const project = storyboardToDocument(sample);
  assert.equal(project.fps,24);
  assert.equal(project.keyframes.length,3);
  assert.deepEqual(project.keyframes.map(f=>f.duration_raw),[12,12,1]);
  assert.deepEqual(project.keyframes[0].objects.map(o=>o.unique_id),[1,2]);
  assert.equal(project.keyframes[0]._styk.easing.interpolation,'linear');
  assert.equal(project.keyframes[2].objects[0].root_x,440);
  assert.doesNotThrow(()=>prepareEditorLoad(project));
});

test('rejects malformed model output rather than constructing an unsafe project', () => {
  assert.throws(()=>validateStoryboard({frames:[{duration:12,actors:[]}]}));
  assert.throws(()=>storyboardToDocument({...sample,frames:[...sample.frames.slice(0,1),{duration:5,actors:[{id:1,x:0,y:0,pose:'unknown'}]}]}));
  assert.throws(()=>storyboardToDocument({...sample,frames:[{duration:1,actors:[{id:1,x:0,y:0,pose:'idle',angles:[Infinity]}]},sample.frames[1]]}));
});
