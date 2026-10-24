#!/usr/bin/env node
/**
 * StykAnimate local MCP bridge.
 *
 * Claude Code, Codex and Antigravity provide the language model themselves.
 * This server performs bounded, deterministic storyboard -> editable project
 * conversion. It uses only Node built-ins, makes no network requests and does
 * not require an API key or launch the editor.
 *
 * Transport: MCP JSON-RPC 2.0 over newline-delimited stdio.
 */
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {mkdir, readFile, writeFile, readdir, lstat, rename, rm} from 'node:fs/promises';
import {AI_POSES, storyboardToDocument, validateStoryboard} from '../src/ai-animation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.resolve(process.env.STYK_AGENT_DIR || path.join(root, '.styk-agent', 'animations'));
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const actorSchema = {
  type:'object', additionalProperties:false,
  properties:{
    id:{type:'integer',enum:[1,2]},
    x:{type:'number',minimum:0,maximum:960},
    y:{type:'number',minimum:0,maximum:540},
    pose:{type:'string',enum:AI_POSES},
    facing:{type:'integer',enum:[-1,1]},
    angles:{type:'array',minItems:10,maxItems:10,items:{type:'number',minimum:-12.6,maximum:12.6}}
  }, required:['id','x','y','pose']
};
const frameSchema = {
  type:'object', additionalProperties:false,
  properties:{
    duration:{type:'integer',minimum:1,maximum:120},
    actors:{type:'array',minItems:1,maxItems:2,items:actorSchema}
  }, required:['duration','actors']
};
const storyboardSchema = {
  type:'object', additionalProperties:false,
  properties:{
    title:{type:'string',maxLength:100},
    fps:{type:'integer',minimum:1,maximum:60},
    frames:{type:'array',minItems:2,maxItems:80,items:frameSchema}
  }, required:['frames']
};

export const MCP_TOOLS = [
  {
    name:'animation_guide',
    description:'Get the StykAnimate stick-figure coordinate system, poses and an example storyboard. Use this before writing animation keys.',
    inputSchema:{type:'object',properties:{},additionalProperties:false}
  },
  {
    name:'create_animation',
    description:'Generate a NEW editable .styk project from your choreography. You, the coding agent, author the storyboard JSON from the user prompt; this tool converts it deterministically, with no external AI API. The result is an absolute file path to open in StykAnimate (File > Open).',
    inputSchema:{type:'object',properties:{storyboard:storyboardSchema},required:['storyboard'],additionalProperties:false}
  },
  {
    name:'list_animations',
    description:'List the animations this MCP server has written in the designated local output directory.',
    inputSchema:{type:'object',properties:{},additionalProperties:false}
  },
  {
    name:'read_animation',
    description:'Read the editable keyframe storyboard that was used for a previously created animation.',
    inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}
  },
  {
    name:'replace_animation',
    description:'Replace all keyframes in a previously created project. Saves an updated editable .styk file at the same path; reopen that file in StykAnimate to see changes.',
    inputSchema:{type:'object',properties:{id:{type:'string'},storyboard:storyboardSchema},required:['id','storyboard'],additionalProperties:false}
  },
  {
    name:'edit_keyframe',
    description:'Replace one existing keyframe, using a zero-based index. All of that keyframe actors and its duration must be specified. Reopen the updated .styk project.',
    inputSchema:{type:'object',properties:{id:{type:'string'},index:{type:'integer',minimum:0},frame:frameSchema},required:['id','index','frame'],additionalProperties:false}
  },
  {
    name:'append_keyframe',
    description:'Append a keyframe to an existing animation (maximum 80); use this to extend movement. Reopen the updated .styk project.',
    inputSchema:{type:'object',properties:{id:{type:'string'},frame:frameSchema},required:['id','frame'],additionalProperties:false}
  }
];

const example = {
  title:'Two fighters',
  fps:24,
  frames:[
    {duration:12,actors:[
      {id:1,x:230,y:300,pose:'idle',facing:1},
      {id:2,x:650,y:300,pose:'block',facing:-1}
    ]},
    {duration:8,actors:[
      {id:1,x:385,y:270,pose:'jump',facing:1},
      {id:2,x:650,y:300,pose:'block',facing:-1}
    ]},
    {duration:1,actors:[
      {id:1,x:470,y:300,pose:'kick',facing:1},
      {id:2,x:650,y:300,pose:'fall',facing:-1}
    ]}
  ]
};

function pathsFor(id) {
  if (typeof id !== 'string' || !ID_PATTERN.test(id))
    throw new TypeError('Invalid animation id; choose a known id from list_animations.');
  return {
    project:path.join(outputDir, id + '.styk'),
    source:path.join(outputDir, id + '.storyboard.json')
  };
}
function newId(title) {
  const slug = String(title || 'animation').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0,45);
  return (slug || 'animation') + '-' + randomUUID().slice(0,8);
}

async function atomicWrite(filename, content) {
  const tmp = filename + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(tmp, content, {encoding:'utf8',flag:'wx',mode:0o600});
    await rename(tmp, filename);
  } finally {
    await rm(tmp,{force:true});
  }
}
async function safeRead(filename) {
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.size > 600_000)
    throw new Error('Animation source is not a regular, bounded local file.');
  return readFile(filename, 'utf8');
}
async function readStoryboard(id) {
  const {source} = pathsFor(id);
  const value = JSON.parse(await safeRead(source));
  return validateStoryboard(value);
}
async function saveStoryboard(id, storyboard) {
  const validated = validateStoryboard(storyboard);
  const native = storyboardToDocument(validated);
  const paths = pathsFor(id);
  await mkdir(outputDir, {recursive:true});
  // The native file is a legacy JSON .styk format that current StykAnimate
  // accepts. Never emit arbitrary model-provided native project fields.
  await atomicWrite(paths.source, JSON.stringify(validated, null, 2) + '\n');
  await atomicWrite(paths.project, JSON.stringify(native) + '\n');
  return {
    id, file:paths.project, storyboardFile:paths.source,
    title:validated.title, keyframes:validated.frames.length, fps:validated.fps,
    durationTicks:validated.frames.reduce((sum,frame)=>sum+frame.duration,0),
    howToOpen:'Use File > Open in StykAnimate and select the .styk file. If it is already open, reopen to see edits.'
  };
}
async function listAnimations() {
  await mkdir(outputDir,{recursive:true});
  const entries = (await readdir(outputDir)).filter(name=>name.endsWith('.storyboard.json')).sort().slice(0,200);
  const result = [];
  for (const filename of entries) {
    const id = filename.slice(0,-'.storyboard.json'.length);
    if (!ID_PATTERN.test(id)) continue;
    try {
      const storyboard = await readStoryboard(id);
      result.push({id,title:storyboard.title,file:pathsFor(id).project,keyframes:storyboard.frames.length});
    } catch {
      // An incomplete or externally modified file is excluded, not trusted.
    }
  }
  return {outputDir,animations:result};
}

export async function callAnimationTool(name, args = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args))
    throw new TypeError('Tool arguments must be an object.');
  switch (name) {
    case 'animation_guide':
      return {
        frameFormat:'A keyframe specifies actor hip positions and poses; linear interpolation fills intervening ticks.',
        coordinates:'960 x 540 stage; x right, y down; standing hips ~300; jumping reduces y.',
        limits:'1-2 actors (id 1 or 2), 2-80 keyframes, max 1800 total ticks, 1-60 fps, durations 1-120 ticks.',
        poses:AI_POSES,example
      };
    case 'create_animation': {
      const storyboard = validateStoryboard(args.storyboard);
      return saveStoryboard(newId(storyboard.title), storyboard);
    }
    case 'list_animations':
      return listAnimations();
    case 'read_animation':
      return {id:args.id,storyboard:await readStoryboard(args.id)};
    case 'replace_animation': {
      await readStoryboard(args.id);
      return saveStoryboard(args.id,args.storyboard);
    }
    case 'edit_keyframe': {
      const original = await readStoryboard(args.id);
      if (!Number.isInteger(args.index) || args.index < 0 || args.index >= original.frames.length)
        throw new RangeError('Keyframe index is outside this animation.');
      const frames = [...original.frames];
      frames[args.index] = args.frame;
      return saveStoryboard(args.id,{...original,frames});
    }
    case 'append_keyframe': {
      const original = await readStoryboard(args.id);
      return saveStoryboard(args.id,{...original,frames:[...original.frames,args.frame]});
    }
    default:
      throw new Error('Unknown animation tool: ' + String(name));
  }
}
export async function handleMCP(request) {
  const method=request?.method;
  const id=request?.id;
  if (id === undefined || id === null) return null; // Notifications never get responses.
  const reply = result => ({jsonrpc:'2.0',id,result});
  if (method==='initialize') return reply({
    protocolVersion:request.params?.protocolVersion || '2025-06-18',
    capabilities:{tools:{listChanged:false}},
    serverInfo:{name:'stykanimate-local',version:'1.0.0'},
    instructions:'Use animation_guide then create_animation, or edit previously generated files. No API keys, internet or AI model are used by this server. Files must be opened/reopened in StykAnimate.'
  });
  if (method==='ping') return reply({});
  if (method==='tools/list') return reply({tools:MCP_TOOLS});
  if (method==='tools/call') {
    try {
      const data = await callAnimationTool(request.params?.name,request.params?.arguments || {});
      return reply({content:[{type:'text',text:JSON.stringify(data)}]});
    } catch(error) {
      return reply({isError:true,content:[{type:'text',text:String(error?.message || error)}]});
    }
  }
  return {jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found: ' + String(method)}};
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const input=createInterface({input:process.stdin,crlfDelay:Infinity});
  for await (const line of input) {
    if (!line.trim()) continue;
    let response;
    try {
      if (line.length>1_000_000) throw new Error('MCP request too large.');
      const request=JSON.parse(line);
      response=await handleMCP(request);
    } catch(error) {
      response={jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON-RPC request: ' + String(error.message)}};
    }
    if (response) process.stdout.write(JSON.stringify(response)+'\n');
  }
}
