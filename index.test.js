// Run with: node index.test.js
// No test runner, no dependencies. If it prints a ✕ you have a problem.

import { checkWall, needsHuman, canAutomate, WALL_KINDS } from './index.js';

const failures = [];
function test(name, fn) {
  try { fn(); } catch (e) { failures.push(`${name}: ${e.message}`); }
}
function eq(label, got, want) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${label} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

/**
 * A fake page.
 * @param url   location.href
 * @param text  document.body.innerText
 * @param els   { 'selector fragment': true | {hidden:true} }
 */
function page({ url = 'https://plain.test/', text = '', els = {} } = {}) {
  const make = (hidden) => ({
    getBoundingClientRect: () => (hidden ? { width: 0, height: 0 } : { width: 200, height: 40 }),
    _hidden: hidden,
  });
  return {
    location: { href: url },
    document: {
      body: { innerText: text },
      querySelectorAll: (sel) => {
        for (const [frag, val] of Object.entries(els)) {
          if (sel.includes(frag)) return val ? [make(typeof val === 'object' && val.hidden)] : [];
        }
        return [];
      },
    },
    getComputedStyle: (el) => (el && el._hidden
      ? { visibility: 'hidden', display: 'none', opacity: '0' }
      : { visibility: 'visible', display: 'block', opacity: '1' }),
  };
}
const kindOf = (opts) => checkWall(page(opts)).kind;

// ── captcha ──
test('a visible captcha frame is a captcha', () => {
  eq('kind', kindOf({ els: { recaptcha: true } }), 'captcha');
});
test('a hidden captcha frame is not', () => {
  eq('kind', kindOf({ els: { recaptcha: { hidden: true } } }), null);
});

// ── password ──
test('a visible password field is a password wall', () => {
  eq('kind', kindOf({ els: { 'input[type="password"]': true } }), 'password');
});
test('a hidden password field is not — homepages ship these for autofill', () => {
  eq('kind', kindOf({ els: { 'input[type="password"]': { hidden: true } } }), null);
});

// ── passkey ──
test('a passkey challenge URL is a passkey wall', () => {
  eq('kind', kindOf({ url: 'https://accounts.google.com/v3/signin/challenge/pk?TL=AA' }), 'passkey');
});
test('a webauthn URL is too', () => {
  eq('kind', kindOf({ url: 'https://somewhere.test/webauthn/verify' }), 'passkey');
});
test('"use your passkey" in the page text is too', () => {
  eq('kind', kindOf({ text: 'Verifying... Use your passkey to finish signing in. Try another way' }), 'passkey');
});
test('why() names the body part, so a human knows what to do', () => {
  const { why } = checkWall(page({ url: 'https://x.test/challenge/pk' }));
  if (!/fingerprint|Face ID|security key/i.test(why)) throw new Error(`vague why: ${why}`);
});

// ★ the two tests that matter most
test('★ a visible password field beats a passkey mention', () => {
  // There is a password path, so a credential store can clear this.
  // No reason to wake a human.
  eq('kind', kindOf({
    text: 'Sign in with a passkey, or enter your password',
    els: { 'input[type="password"]': true },
  }), 'password');
});
test('★ a captcha beats a passkey — you cannot reach the passkey past it', () => {
  eq('kind', kindOf({ url: 'https://x.test/challenge/pk', els: { recaptcha: true } }), 'captcha');
});

// ★ false positives. Over-reporting is how a checker gets ignored.
test('★ a blog post explaining passkeys is not a wall', () => {
  eq('kind', kindOf({
    text: 'What is a passkey? How passwordless sign-in works, and why passkey adoption is growing.',
  }), null);
});
test('★ "we support passkeys" marketing copy is not a wall', () => {
  eq('kind', kindOf({ text: 'Our service supports passkeys. Coming soon to all accounts.' }), null);
});

// ── one-time code ──
test('an OTP needs both the phrase and the field', () => {
  eq('kind', kindOf({ text: 'Enter the verification code we sent', els: { otp: true } }), 'otp');
});
test('the phrase alone is not enough — help pages all contain it', () => {
  eq('kind', kindOf({ text: 'Verification code help: how to receive it by SMS' }), null);
});

// ── nothing there ──
test('an ordinary page is not a wall', () => {
  const r = checkWall(page({ text: "Today's weather is clear. 12 degrees." }));
  eq('kind', r.kind, null);
  eq('why', r.why, '');
});

// ── the helpers ──
test('needsHuman is true for a wall, false otherwise', () => {
  eq('wall', needsHuman(page({ els: { recaptcha: true } })), true);
  eq('plain', needsHuman(page({ text: 'hello' })), false);
});
test('canAutomate says yes only to password', () => {
  eq('password', canAutomate('password'), true);
  for (const k of ['captcha', 'passkey', 'otp']) {
    if (canAutomate(k)) throw new Error(`${k} must not be automatable — that is the whole point`);
  }
});
test('every kind this module can return is listed in WALL_KINDS', () => {
  const returned = ['captcha', 'password', 'passkey', 'otp'];
  for (const k of returned) {
    if (!WALL_KINDS.includes(k)) throw new Error(`${k} missing from WALL_KINDS`);
  }
  eq('length', WALL_KINDS.length, returned.length);
});
test('WALL_KINDS order matches the order checked — password before passkey', () => {
  if (!(WALL_KINDS.indexOf('password') < WALL_KINDS.indexOf('passkey'))) {
    throw new Error('password must come before passkey, or a human gets woken for nothing');
  }
});

if (failures.length) {
  console.log(`✕ ${failures.length} failing`);
  for (const f of failures) console.log(`  ✕ ${f}`);
  process.exit(1);
}
console.log('19 tests passed · 0 failing');
