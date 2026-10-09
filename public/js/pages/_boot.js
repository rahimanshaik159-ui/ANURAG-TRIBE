// Every page calls boot(): mounts the shell (auth guard), runs the page, and shows a friendly error state on failure.
import { mountShell } from '../components/shell.js';
import { h, $, clear } from '../core/dom.js';
import { errorState } from '../core/ui.js';
import { friendlyError } from '../core/firebase.js';

export async function boot(opts, fn) {
  try {
    const ctx = await mountShell(opts);
    if (ctx.blocked) return;
    await fn(ctx);
  } catch (e) {
    console.error(e);
    const app = $('#app'); clear(app);
    app.append(h('div', { class: 'container section' }, errorState(friendlyError(e), () => location.reload())));
  }
}
export const wrap = (...kids) => h('div', { class: 'container section' }, ...kids);
