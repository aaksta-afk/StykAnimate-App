import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const temp = await mkdtemp(path.join(os.tmpdir(),'styk-agent-test-'));
process.env.STYK_AGENT_DIR=temp;
const {callAnimationTool,handleMCP,MCP_TOOLS} = await import('../scripts/styk-mcp.mjs');
const {prepareEditorLoad} = await import('../src/editor-load.mjs');
const sample={
  title:'Two actors',fps:24,
  frames:[
    {duration:12,actors:[{id:1,x:240,y:300,pose:'idle'},{id:2,x:640,y:300,pose:'block',facing:-1}]},
    {duration:1,actors:[{id:1,x:460,y:300,pose:'kick'},{id:2,x:640,y:300,pose:'fall',facing:-1}]}
  ]
};
test.after(async()=>{await rm(temp,{recursive:true,force:true});});
test('offline MCP creates editable JSON .styk and edits keyframes',async()=>{
  const created=await callAnimationTool('create_animation',{storyboard:sample});
  assert.ok(created.file.startsWith(temp));
  assert.match(created.file,/\.styk$/);
  const native=JSON.parse(await readFile(created.file,'utf8'));
  assert.equal(native.keyframes.length,2);
  assert.equal(native._styk.name,'Two actors');
  assert.deepEqual(native.keyframes[0].objects.map(x=>x.unique_id),[1,2]);
  assert.doesNotThrow(()=>prepareEditorLoad(native));
  const edit=await callAnimationTool('edit_keyframe',{
    id:created.id,index:1,frame:{duration:1,actors:[{id:1,x:550,y:290,pose:'punch'}]}
  });
  assert.equal(edit.file,created.file);
  const updated=JSON.parse(await readFile(created.file,'utf8'));
  assert.equal(updated.keyframes[1].objects[0].root_x,550);
  const loaded=await callAnimationTool('read_animation',{id:created.id});
  assert.equal(loaded.storyboard.frames[1].actors[0].pose,'punch');
  const list=await callAnimationTool('list_animations',{});
  assert.equal(list.animations.length,1);
  assert.equal(list.animations[0].id,created.id);
});
test('MCP initialize and tool discovery work without API credentials',async()=>{
  assert.ok(MCP_TOOLS.some(t=>t.name==='create_animation'));
  const init=await handleMCP({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}});
  assert.equal(init.result.serverInfo.name,'stykanimate-local');
  assert.equal(init.result.protocolVersion,'2025-06-18');
  const listed=await handleMCP({jsonrpc:'2.0',id:2,method:'tools/list'});
  assert.equal(listed.result.tools.length,MCP_TOOLS.length);
  assert.equal(await handleMCP({jsonrpc:'2.0',method:'notifications/initialized'}),null);
});
test('rejects traversal ids and malformed edits',async()=>{
  await assert.rejects(()=>callAnimationTool('read_animation',{id:'../../etc/passwd'}),/Invalid animation id/);
  const created=await callAnimationTool('create_animation',{storyboard:sample});
  await assert.rejects(()=>callAnimationTool('edit_keyframe',{id:created.id,index:100,frame:sample.frames[0]}),/outside/);
  await assert.rejects(()=>callAnimationTool('replace_animation',{id:created.id,storyboard:{frames:[]}}),/2–80/);
  const err=await handleMCP({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'read_animation',arguments:{id:'../secret'}}});
  assert.equal(err.result.isError,true);
});
