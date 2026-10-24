/**
 * Prompt-to-animation UI. API keys remain in the LOCAL Python service process.
 * The standalone JSON path also works in a static/offline browser build.
 */
import {storyboardToDocument} from './ai-animation.mjs';

export function installAIAnimationUI({openDocument, apiToken = ''}) {
  const before = document.querySelector('.band-export');
  if (!before) return null;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ui-button';
  trigger.dataset.variant = 'ghost';
  trigger.textContent = 'AI Animation';
  trigger.title = 'Generate editable keyframes with ChatGPT or Claude';
  before.before(trigger);

  const dialog = document.createElement('dialog');
  dialog.id = 'ai-animation-dialog';
  dialog.setAttribute('aria-labelledby','ai-animation-title');
  dialog.style.cssText = 'width:min(540px,calc(100vw - 32px));max-height:90vh;border:1px solid #8994a7;border-radius:12px;padding:22px;color:var(--text-1,#222);background:var(--surface-1,#fff)';
  // Only static, developer-authored markup is inserted. Model responses use textContent.
  dialog.innerHTML = `
    <form method="dialog" id="ai-animation-form" style="display:grid;gap:12px">
      <h2 id="ai-animation-title" style="margin:0">AI Animation</h2>
      <p style="margin:0">Describe a stick-figure animation. Your prompt will be sent to the selected AI provider only when you press Generate. Existing projects will not be overwritten.</p>
      <label>Provider
        <select id="ai-provider" style="display:block;width:100%;padding:9px">
          <option value="openai">OpenAI (ChatGPT API)</option>
          <option value="anthropic">Anthropic (Claude API)</option>
        </select>
      </label>
      <label>Prompt
        <textarea id="ai-prompt" required maxlength="4000" rows="4" style="box-sizing:border-box;width:100%;padding:9px" placeholder="Two stick figures fight: one runs in, jumps, kicks; the other blocks and counterpunches. 8 seconds."></textarea>
      </label>
      <button type="submit" id="ai-generate" class="ui-button" data-variant="primary">Generate animation</button>
      <details>
        <summary>Or paste a storyboard JSON from ChatGPT / Claude</summary>
        <p>Ask for the JSON format described in docs/AI-ANIMATION.md. This option works without an API key.</p>
        <textarea id="ai-json" rows="5" style="box-sizing:border-box;width:100%;padding:9px" placeholder='{"title":"Wave","frames":[...]}'></textarea>
        <button type="button" id="ai-import-json" class="ui-button">Import storyboard JSON</button>
      </details>
      <p id="ai-status" role="status" aria-live="polite" style="min-height:1.5em;margin:0"></p>
      <button type="button" id="ai-cancel" class="ui-button" data-variant="ghost">Close</button>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('#ai-animation-form');
  const prompt = dialog.querySelector('#ai-prompt');
  const submit = dialog.querySelector('#ai-generate');
  const importButton = dialog.querySelector('#ai-import-json');
  const status = dialog.querySelector('#ai-status');
  const cancel = dialog.querySelector('#ai-cancel');
  let pending = null;

  function busy(value) {
    submit.disabled = value;
    importButton.disabled = value;
    cancel.textContent = value ? 'Cancel request' : 'Close';
  }
  function close() {
    pending?.abort();
    if (dialog.open) dialog.close();
  }
  trigger.addEventListener('click', () => { status.textContent = '';dialog.showModal();prompt.focus(); });
  cancel.addEventListener('click', close);
  dialog.addEventListener('cancel', () => pending?.abort());

  async function open(value) {
    const report = storyboardToDocument(value);
    const opened = await openDocument(report, report._styk.name);
    if (opened !== false) close();
  }
  importButton.addEventListener('click', async () => {
    try {
      const source = dialog.querySelector('#ai-json').value.trim()
        .replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
      await open(JSON.parse(source));
      status.textContent = '';
    } catch(error) { status.textContent = error.message; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending) return;
    const text = prompt.value.trim();
    if (!text) { status.textContent='Enter a prompt.';return; }
    pending = new AbortController();
    busy(true);
    status.textContent = 'Generating storyboard…';
    try {
      const response = await fetch('/api/ai/animate',{
        method:'POST',signal:pending.signal,
        headers:{'Content-Type':'application/json',...(apiToken?{Authorization:`Bearer ${apiToken}`}:{})},
        body:JSON.stringify({provider:dialog.querySelector('#ai-provider').value,prompt:text}),
      });
      const result = await response.json().catch(()=>null);
      if (!response.ok || !result?.ok)
        throw new Error(result?.error || 'Local AI service unavailable. Use the desktop/local development server, or paste storyboard JSON.');
      status.textContent = 'Opening editable animation…';
      await open(result.storyboard);
      status.textContent = '';
    } catch(error) {
      status.textContent = error.name === 'AbortError' ? 'Request cancelled.' : error.message;
    } finally { pending=null;busy(false); }
  });
  return {trigger,dialog,dispose(){close();trigger.remove();dialog.remove();}};
}
