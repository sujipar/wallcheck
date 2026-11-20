/**
 * wallcheck — tell your browser agent when it has hit a wall only a human can clear.
 *
 * Agents fail quietly at login screens. The run keeps going, the log says
 * nothing useful, and you find out twenty minutes later. This answers one
 * question: *is this a wall, and what kind?*
 *
 * It does NOT solve captchas. The point is the opposite — hand the wall to a
 * person instead of pretending you can get through it.
 */

/** Wall kinds, in the order they are checked. The order carries meaning — see NOTE below. */
export const WALL_KINDS = ['captcha', 'password', 'passkey', 'otp'];

/**
 * @param {object} [env] - injected for testing; defaults to the real page
 * @param {Document} env.document
 * @param {Location} env.location
 * @param {(el: Element) => CSSStyleDeclaration} env.getComputedStyle
 * @returns {{kind: string|null, why: string}}
 */
export function checkWall(env) {
  const doc = env?.document ?? globalThis.document;
  const loc = env?.location ?? globalThis.location;
  const styleOf = env?.getComputedStyle ?? globalThis.getComputedStyle;

  // Only count what a person could actually see and click.
  //
  // NOTE: this guard is the whole reason this library is more than a regex.
  // Hidden password fields are everywhere — plenty of homepages ship one for
  // the browser's autofill. Counting those makes every page look like a login
  // wall, and once your agent cries wolf a few times you stop believing it.
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    const c = styleOf(el);
    return c.visibility !== 'hidden' && c.display !== 'none' && Number(c.opacity) > 0.05;
  };
  const one = (sel) => [...doc.querySelectorAll(sel)].find(visible) || null;

  // 1. Captcha. Usually inside an iframe.
  //    Checked first because a captcha blocks everything behind it — there is
  //    no point reporting a password field the agent will never reach.
  if (one(
    'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare"],'
    + ' .g-recaptcha, .h-captcha, #captcha, [id*="captcha" i], [class*="captcha" i]',
  )) {
    return { kind: 'captcha', why: 'A captcha is on screen.' };
  }

  // 2. Password. A *visible* password field.
  if (one('input[type="password"]')) {
    return { kind: 'password', why: 'There is a password field to fill.' };
  }

  const text = (doc.body?.innerText || '').slice(0, 4000);

  // 3. Passkey — needs a fingerprint, Face ID or a security key. A human body.
  //
  //    NOTE: this sits *after* the password check on purpose, and that order is
  //    the most important line in this file. If a password field is visible,
  //    your agent can fill it from a credential store and carry on. Only when
  //    there is no password path does a human actually have to touch the device.
  //    Put passkey first and you will wake someone up for a wall they did not
  //    need to clear.
  //
  //    We do not match the bare word. "What is a passkey?" in a blog post would
  //    trip it. Either the URL is a passkey challenge, or the page is actually
  //    asking — same reason step 4 insists on both a phrase and a field.
  const url = loc?.href || '';
  const passkeyUrl = /challenge[/]pk|webauthn|[/]passkey/i.test(url);
  const passkeyAsk = /use your passkey|sign in with (a )?passkey|verify (your )?identity with (a )?passkey|touch id to/i.test(text);
  if (passkeyUrl || passkeyAsk) {
    return { kind: 'passkey', why: 'Needs a fingerprint, Face ID or a security key.' };
  }

  // 4. One-time code from SMS or email. Needs BOTH a phrase and a field —
  //    the word "verification" alone matches every help page ever written.
  const otpWord = /verification code|one-time code|2-step verification|two-factor|security code/i.test(text);
  const otpField = one(
    'input[autocomplete*="one-time"], input[name*="otp" i], input[id*="otp" i],'
    + ' input[name*="code" i], input[id*="code" i]',
  );
  if (otpWord && otpField) {
    return { kind: 'otp', why: 'There is a one-time code to enter.' };
  }

  return { kind: null, why: '' };
}

/** Convenience: true when a person has to step in. */
export function needsHuman(env) {
  return checkWall(env).kind !== null;
}

/**
 * Which walls your agent may be able to clear on its own.
 *
 * `password` is listed because a credential store can fill it. The other three
 * need a human — and `canAutomate` returning false is the signal to stop and
 * ask, not to try harder.
 */
export function canAutomate(kind) {
  return kind === 'password';
}
