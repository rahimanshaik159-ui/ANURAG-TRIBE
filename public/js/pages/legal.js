import { boot } from './_boot.js';
import { h, clear } from '../core/dom.js';
import { pageHero, field, input, textarea, counter, banner } from '../core/ui.js';
import { session } from '../core/auth.js';

const section = (title, ...children) => h('section', { class: 'legal-section' }, h('h2', {}, title), ...children);
const para = (text) => h('p', {}, text);
const list = (items) => h('ul', {}, items.map((item) => h('li', {}, item)));
const copy = {
  privacy: {
    title: 'Privacy Policy', sub: 'How ANURAG TRIBE handles information while you connect, build and share.',
    body: [
      section('Scope and contact', para('This policy describes the current ANURAG TRIBE student community platform. It should be reviewed by the project owner before publication and updated when the service or legal requirements change. For privacy questions or deletion requests, use Contact Us and select a clear subject.')),
      section('Information we process', para('When you register, we process your email address, authentication status and account security information. Your profile may include your name, username, department, skills, interests, learning goals, bio, avatar and social links. We also process Tribe memberships, invitations, messages, projects, applications, help requests, comments, showcase submissions, reports and community activity that you choose to provide.'), para('Contact form submissions include the name, email address, subject and message you submit. Internal notifications and email notifications contain only the information needed to deliver the relevant alert. Technical information such as device/browser details, timestamps, network and connection metadata may be processed for security, debugging and application functionality.')),
      section('How we use information', list(['Provide authentication, profiles, discovery, Tribes, chat, voice meetings, projects, help requests, notifications and moderation.', 'Protect the service, investigate abuse, enforce rules and maintain reliability.', 'Send transactional or internal notifications when enabled by the relevant feature or user preference.', 'Respond to support, privacy and moderation requests. The Contact Us page prepares a message in your email application; the website itself does not receive or store that handoff. We do not sell personal information.'])),
      section('Cookies, storage and advertising', para('The current site uses Firebase authentication and browser storage/cookies as needed for authentication persistence, sessions, security and preferences. The project does not currently enable Google AdSense, analytics, advertising cookies or personalized tracking based on the implementation reviewed for this policy. No advertising scripts should be added without updating this policy and implementing any required consent choices. You can manage browser storage and cookie settings through your browser; disabling essential storage can prevent sign-in or core functionality.')),
      section('File sharing and WebRTC', para('Large files are transferred directly between browsers using WebRTC when network connectivity permits. ANURAG TRIBE does not introduce permanent file storage for these transfers. Firestore may process temporary signaling information and transfer metadata, and network infrastructure may process connection metadata, including IP-address information where applicable. Transfers can fail when network conditions prevent a direct connection, and direct transfer does not guarantee absolute privacy or connectivity.')),
      section('Retention, security and deletion', para('We retain information for as long as needed to operate the platform, provide safety and meet legitimate administrative or legal needs. Temporary signaling and transfer records are cleaned up by scheduled server processes. We use Firebase security rules, server-side authorization and restricted server functions, but no internet service can promise absolute security. You may request correction or deletion of information through Contact Us; some records may need to be retained for security, dispute resolution or legal obligations.')),
      section('Services and external links', para('The current implementation uses Firebase Authentication, Firestore, Cloud Functions and Firebase Hosting, plus Resend for configured transactional email notifications. Contact Us uses a local mailto handoff to your email application and does not use an email API. WebRTC and network providers are involved in direct transfers. External profile links and other links shared by users lead to third-party sites with their own policies; review them before sharing information.')),
      section('Your choices and updates', para('You may update eligible profile information, control available email notification preferences, and request access, correction or deletion through the official support contact. We may update this policy when the platform changes. The effective date and contact method should be confirmed by the project owner before publication.')),
    ],
  },
  terms: {
    title: 'Terms of Service', sub: 'Simple rules for using ANURAG TRIBE responsibly.',
    body: [
      section('Acceptance and eligibility', para('By using ANURAG TRIBE, you agree to these terms and the Community Guidelines. ANURAG TRIBE is an unofficial student community and must not be presented as formally authorized to represent a college unless the project owner has that authorization. Use the service only if you are legally able to do so and meet any applicable campus requirements.')),
      section('Accounts and profiles', para('Provide accurate information, keep your credentials secure, and do not share your account. You are responsible for activity from your account and should report suspected compromise promptly. Do not impersonate another person or create a misleading profile.')),
      section('Acceptable use', para('Use Tribes, messaging, voice meetings, projects, help requests, comments and contact forms for genuine student collaboration. Do not harass, threaten, scam, phish, spam, distribute malware, violate privacy, upload prohibited material, abuse invitations or meetings, misuse help requests, or submit content that infringes rights or confidentiality.')),
      section('Tribes and community content', para('Tribe creators manage invitations and membership within the platform. You keep ownership of original content you submit. By submitting content, you give ANURAG TRIBE permission to display and process it within the platform for the feature you used, including moderation and collaboration. You must have the rights and permissions needed to submit it.')),
      section('Intellectual property and links', para('Respect copyright, confidential information and another student’s work. Send copyright or intellectual-property complaints through Contact Us with enough information to investigate. User-posted external links and third-party services are not controlled or guaranteed by ANURAG TRIBE.')),
      section('File sharing and technical limits', para('File transfers use direct browser-to-browser WebRTC after recipient acceptance. Do not transfer malware, illegal, abusive, confidential or unauthorized copyrighted material. Files are not permanently stored by ANURAG TRIBE, but connection metadata and temporary signaling may be processed. Transfers may fail because of NAT, firewall, browser, device or network limitations, and the service does not guarantee delivery or connectivity.')),
      section('Moderation, suspension and termination', para('Users can report content or behavior through the existing reporting flow. Authorized administrators review reports and may remove content, restrict features, suspend Tribes or suspend/terminate accounts based on evidence and severity. We may also act to protect users, the service or legal rights.')),
      section('Availability, changes and owner review', para('Features may change, be interrupted or become unavailable. These terms do not provide legal, academic, employment or safety guarantees. The project owner must review and replace any placeholders, legal notices and contact details before publication. We may update these terms by posting a revised version. Questions and complaints should be sent through Contact Us.')),
    ],
  },
  guidelines: {
    title: 'Community Guidelines', sub: 'Help make ANURAG TRIBE useful, welcoming and safe for students.',
    body: [
      section('What we expect', list(['Speak respectfully. Disagree with ideas without attacking people.', 'Give constructive feedback and collaborate across skills and departments.', 'Respect intellectual property and ask for consent before featuring someone’s work.', 'Report harmful behavior, suspicious links or unsafe content to the existing report flow or an administrator.'])),
      section('Not allowed', list(['Harassment, bullying, threats, hate or abusive behavior.', 'Impersonation, deceptive identities or misleading profiles.', 'Spam, scams, phishing, malicious links or attempts to steal credentials.', 'Sharing private information without permission, including screenshots or contact details.', 'Unauthorized distribution of copyrighted, confidential, harmful or prohibited material.', 'Malicious file transfers, or abuse of Tribe invitations, voice meetings and messaging.', 'Misusing help requests, collaboration opportunities or contact forms for spam.', 'Using another student’s work without permission or presenting it as your own.'])),
      section('Reports and moderation', para('1. A user reports content or behavior using the existing reports flow. 2. Authorized administrators review the report and available evidence. 3. Appropriate action is taken based on evidence and severity, using the existing Admin and Super Admin moderation functionality. 4. Users can contact support about moderation decisions where an appeal process is available. Do not retaliate against someone who makes a good-faith report.')),
      section('File and collaboration safety', para('Only share files you are allowed to share. Direct WebRTC transfer does not make prohibited content acceptable and may fail because of network conditions. Confirm consent before recording, featuring or redistributing student work, and use help requests and invitations for real collaboration.')),
    ],
  },
};

function contactPage(app, ctx) {
  const name = input({ autocomplete: 'name', maxlength: 100, value: ctx.profile?.name || ctx.user?.displayName || '' });
  const email = input({ type: 'email', autocomplete: 'email', inputmode: 'email', maxlength: 254, value: ctx.user?.email || '' });
  const subject = input({ maxlength: 160 });
  const message = textarea({ maxlength: 5000, rows: 7 });
  const fields = [field('Full name', name, { required: true }), field('Email address', email, { required: true }), field('Subject', subject, { required: true }), field('Message', message, { required: true, hint: '10 to 5,000 characters.' }), counter(message, 5000)];
  const status = h('div', { 'aria-live': 'polite' }, banner('Your email app will open with your message prepared. Please review it and press Send to deliver your message to ANURAG TRIBE.', 'info'));
  const fallback = textarea({ rows: 7, readonly: true, 'aria-label': 'Copyable contact message' });
  const copyFallback = h('button', { class: 'btn btn-outline', type: 'button', onclick: async (event) => {
    try {
      await navigator.clipboard.writeText(fallback.value);
      event.currentTarget.textContent = 'Copied';
      setTimeout(() => { if (event.currentTarget.isConnected) event.currentTarget.textContent = 'Copy message details'; }, 1800);
    } catch (_) {
      fallback.focus(); fallback.select();
      status.replaceChildren(banner('Copy was not available automatically. The message details are selected; press Ctrl+C or use your device copy command.', 'warn'));
    }
  } }, 'Copy message details');
  const fallbackPanel = h('div', { class: 'contact-fallback card' }, h('h3', {}, 'If your email app does not open'), h('p', { class: 'muted' }, 'Copy the prepared recipient, subject and message below into your preferred email app.'), fallback, copyFallback);
  const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Send Message');
  const updateFallback = () => {
    const values = [name, email, subject, message].map((control) => control.value.trim());
    const authStatus = session.user ? `Signed-in authentication status: signed in (${session.user.email || 'verified account'})` : 'Signed-in authentication status: signed out';
    fallback.value = `To: ${RECIPIENT}\nSubject: ${values[2]}\n\n${values[3]}\n\nName: ${values[0]}\nSender email: ${values[1]}\n${authStatus}`;
  };
  const RECIPIENT = 'anuragtribe@gmail.com';
  const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (event) => {
    event.preventDefault(); status.replaceChildren();
    const values = [name, email, subject, message].map((control) => control.value.trim());
    const errors = [values[0].length < 2 ? 'Enter your full name.' : '', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[1]) ? 'Enter a valid email address.' : '', values[2].length < 2 ? 'Enter a subject.' : '', values[3].length < 10 ? 'Message must be at least 10 characters.' : ''];
    [name, email, subject, message].forEach((control, i) => control.closest('.field')?.setError(errors[i]));
    if (errors.some(Boolean)) return;
    updateFallback();
    const authStatus = session.user ? `Signed-in authentication status: signed in (${session.user.email || 'verified account'})` : 'Signed-in authentication status: signed out';
    const body = `${values[3]}\n\nName: ${values[0]}\nSender email: ${values[1]}\n${authStatus}`;
    window.location.href = `mailto:${RECIPIENT}?subject=${encodeURIComponent(values[2])}&body=${encodeURIComponent(body)}`;
    status.append(banner('Your email app should now have the message prepared. The website cannot confirm delivery; review it and press Send in your email app.', 'ok'));
  } }, ...fields, submit);
  [name, email, subject, message].forEach((control) => control.addEventListener('input', updateFallback));
  updateFallback();
  app.append(pageHero('Contact Us', 'Have a question, privacy request or community concern? We are here to help.', { eyebrow: 'ANURAG TRIBE support' }), h('section', { class: 'section' }, h('div', { class: 'container contact-layout' }, h('div', { class: 'card stack-lg' }, h('h2', {}, 'Send us a message'), h('p', { class: 'muted' }, 'This form opens your default email application. ANURAG TRIBE does not receive a delivery confirmation from this handoff.'), status, form), h('aside', { class: 'stack' }, fallbackPanel, h('div', { class: 'card' }, h('h2', {}, 'Before you write'), h('p', {}, 'For harmful content or urgent community issues, use the existing report tools when signed in so authorized administrators can review the relevant context.'))))));
}

boot({ require: 'public' }, async (ctx) => {
  const app = ctx.main; clear(app);
  if (location.pathname.endsWith('contact.html')) return contactPage(app, ctx);
  const key = location.pathname.endsWith('privacy.html') ? 'privacy' : location.pathname.endsWith('terms.html') ? 'terms' : 'guidelines';
  const page = copy[key];
  app.append(pageHero(page.title, page.sub, { eyebrow: 'ANURAG TRIBE information' }), h('article', { class: 'section legal-page' }, h('div', { class: 'container legal-content' }, ...page.body)));
});
