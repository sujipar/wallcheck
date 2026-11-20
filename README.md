# wallcheck

Tell your browser agent when it has hit a wall only a human can clear.

```js
import { checkWall, canAutomate } from 'wallcheck';

const { kind, why } = checkWall();     // runs in the page
if (kind && !canAutomate(kind)) {
  await askAHuman(why);                // "Needs a fingerprint, Face ID or a security key."
}
```

No dependencies. One file, ~100 lines. Works in any page context — Playwright,
Puppeteer, CDP, a content script.

## Why

Agents fail quietly at login screens. The run keeps going, the log says nothing
useful, and you find out twenty minutes later that nothing happened.

I hit this with a passkey prompt. My own wall checker had four cases — captcha,
password field, one-time code, and "nothing" — and a passkey screen has **no
password field**, so it fell through to "nothing". The agent reported *no wall
found* and stopped doing anything, and the path that hands the wall to a person
never opened. The failure was invisible: no error, no log line, just silence.

**This library does not solve captchas.** The point is the opposite. It tells
you to stop and ask someone, because a captcha you defeated is a captcha you
were not supposed to defeat.

## What it returns

```js
{ kind: 'captcha' | 'password' | 'passkey' | 'otp' | null, why: string }
```

| kind | means | your agent can clear it? |
|---|---|---|
| `captcha` | a captcha is on screen | no |
| `password` | a visible password field | **yes** — fill from a credential store |
| `passkey` | fingerprint / Face ID / security key | no — needs a body |
| `otp` | a code from SMS or email | no — unless you can read that inbox |

`canAutomate(kind)` returns true only for `password`. When it returns false,
that is the signal to stop and ask — not to try harder.

## Two decisions worth stealing

**1. Order carries meaning: password is checked before passkey.**

If a password field is visible, your agent can fill it from a credential store
and carry on. Only when there is *no* password path does a human actually have
to touch the device. Check passkey first and you wake someone up for a wall
they did not need to clear.

The test suite enforces this ordering, because it is the kind of thing that
gets quietly reversed during a refactor.

**2. Only visible elements count.**

Hidden password fields are everywhere — plenty of homepages ship one for the
browser's autofill. Count those and every page looks like a login wall. Once
your checker cries wolf a few times, you stop believing it, and then it is
worse than not having one.

Same reason `otp` needs **both** a phrase and a field: the word "verification"
alone matches every help page ever written. And `passkey` does not match the
bare word — "What is a passkey?" in a blog post is not a wall.

## Tests

```sh
node index.test.js    # 19 tests, no runner, no dependencies
```

Each test was checked by reverting the thing it tests and confirming it fails:

| revert | tests that catch it |
|---|---|
| put passkey before password | 2 |
| drop the visibility guard | 3 |
| widen passkey to the bare word | 3 |
| let `otp` fire on the phrase alone | 2 |
| let `canAutomate` accept captcha | 2 |

A test that still passes when you break the thing it tests is worse than no
test, so they are all verified this way.

## Install

```sh
npm i wallcheck
```

Or copy `index.js`. It is one file and it has no dependencies — vendoring it is
a reasonable choice.

## Where this came from

Extracted from [MINEA](https://minea.minea.workers.dev/en), a Mac assistant that
drives the browser headlessly so it never takes over your cursor. Running an
agent in the background for long stretches is exactly how you discover that
"quiet failure at a login wall" is the default, not the exception.

MIT.
