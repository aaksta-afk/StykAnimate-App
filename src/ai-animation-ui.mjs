/** Local agent companion: imports a structured storyboard without any provider API. */
import {storyboardToDocument} from './ai-animation.mjs';

export function installAIAnimationUI({openDocument}) {
  const before = document.querySelector('.band-export');
  if (!before) return null;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ui-button';
  trigger.dataset.variant = 'ghost';
  trigger.textContent = 'Agent Import';
  trigger.title = 'Import editable animation JSON from Claude Code, Codex or Antigravity';
  before.before(trigger);

  const dialog = document.createElement('dialog');
  dialog.id = 'ai-animation-dialog';
  dialog.setAttribute('aria-labelledby','ai-animation-title');
  dialog.style.cssText = 'width:min(540px,calc(100vw - 32px));max-height:90vh;border:1px solid #8994a7;border-radius:12px;padding:22px;color:var(--text-1,#222);background:var(--surface-1,#fff)';
  // Static authored markup only. Never insert user/model content into innerHTML.
  dialog.innerHTML = '<form method="dialog" id="ai-animation-form" style="display:grid;gap:12px">' +
    '<h2 id="ai-animation-title" style="margin:0">Import Agent Animation</h2>' +
    '<p style="margin:0">Claude Code, Codex and Antigravity can create and edit .styk files through the local MCP server. Open those files with File > Open. Or paste storyboard JSON below.</p>' +
    '<label>Storyboard JSON' +
    '<textarea id="ai-json" rows="8" style="box-sizing:border-box;width:100%;padding:9px" placeholder=\'{"title":"Wave","fps":24,"frames":[...]}\'></textarea>' +
    '</label>' +
    '<p id="ai-status" role="status" aria-live="polite" style="min-height:1.5em;margin:0"></p>' +
    '<button type="submit" id="ai-import-json" class="ui-button" data-variant="primary">Open editable animation</button>' +
    '<button type="button" id="ai-cancel" class="ui-button" data-variant="ghost">Close</button>' +
    '</form>';
  document.body.append(dialog);
  const form = dialog.querySelector('#ai-animation-form');
  const status = dialog.querySelector('#ai-status');
  const importButton = dialog.querySelector('#ai-import-json');

  trigger.addEventListener('click', () => {
    status.textContent='';
    dialog.showModal();
    dialog.querySelector('#ai-json').focus();
  });
  dialog.querySelector('#ai-cancel').addEventListener('click',()=>dialog.close());
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    importButton.disabled=true;
    try {
      const source=dialog.querySelector('#ai-json').value.trim()
        .replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
      const report=storyboardToDocument(JSON.parse(source));
      const result=await openDocument(report,report._styk.name);
      if(result!==false) dialog.close();
    } catch(error) {
      status.textContent=error.message;
    } finally {
      importButton.disabled=false;
    }
  });
  return {trigger,dialog,dispose(){if(dialog.open)dialog.close();trigger.remove();dialog.remove();}};
}
