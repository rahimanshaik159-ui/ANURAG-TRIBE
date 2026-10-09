// "I NEED SOMEONE" request composer, reused from profiles, discovery and the help page.
import { h } from '../core/dom.js';
import { field, input, textarea, counter, openModal, toast } from '../core/ui.js';
import { skillPicker } from './skillPicker.js';
import { createRequest } from '../services/helpRequests.js';
import { friendlyError } from '../core/firebase.js';
import { cleanText } from '../lib/validators.js';

/** @param target a user object to send to, or null to post on the open board */
export function openHelpModal({ me, target = null, tax, tribeId = null, skills = [], onDone }) {
  const title = input({ placeholder: target ? 'e.g. Need an editor for our short film' : 'e.g. I need a video editor', maxlength: 100 });
  const desc = textarea({ placeholder: 'What are you building and what do you need help with? Mention timing, effort and anything useful.', rows: 4 });
  const picker = skillPicker({ tax, value: skills, max: 8, compact: true });
  const body = h('div', {}, target ? h('p', { class: 'muted' }, 'Your request goes to ', h('strong', {}, target.name), ' and they can accept or decline. If they accept, you can chat and send files directly.') : h('p', { class: 'muted' }, 'Your request is posted to the Open Board where students with matching skills can offer help.'),
    field('What do you need?', title, { required: true }), field('Details', desc, { required: true }), counter(desc, 800), h('div', { class: 'label', style: { margin: '10px 0 6px' } }, 'Skills needed'), picker);
  openModal({ title: target ? `Request help from ${target.name}` : 'I need someone', body, size: 'lg', actions: [
    { label: 'Cancel', onClick: (c) => c() },
    { label: 'Send request', variant: 'btn-primary', onClick: async (close) => {
      if (cleanText(title.value, 100).length < 4 || cleanText(desc.value, 800).length < 10) { toast('Add a title (4+ chars) and some details (10+ chars).', 'error'); return; }
      try {
        const id = await createRequest(me.uid, { title: title.value, description: desc.value, skillsNeeded: picker.getValue(), targetUid: target ? target.uid || target.id : null, tribeId });
        toast('Request sent.', 'success'); close(); if (onDone) onDone(id); else location.href = `help-requests.html?id=${id}`;
      } catch (e) { toast(friendlyError(e), 'error'); }
    } },
  ] });
}
