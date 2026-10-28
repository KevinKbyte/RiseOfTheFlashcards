// Companion paste page logic; external so the page runs under a no-inline-script CSP (RELAY-012).
// Crockford base32 without I, L, O, U; the relay re-checks everything server-side.
const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{6}$/;
const MESSAGES = {
  400: 'The deck or code was rejected',
  404: 'Unknown or expired code. Ask the headset for a new one.',
  409: 'A deck was already sent for this code.',
  413: 'The deck is too large (200 KB maximum).',
  429: 'Too many attempts. Wait a minute and try again.',
  503: 'Deck import is currently unavailable.',
};

const form = document.getElementById('send-form');
const statusLine = document.getElementById('status');

function show(text, kind) {
  statusLine.textContent = text;
  statusLine.className = kind;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = document.getElementById('code').value.trim().toUpperCase();
  const deck = document.getElementById('deck').value;
  if (!CODE_PATTERN.test(code)) {
    show('The code is 6 characters: digits and letters except I, L, O and U.', 'error');
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  show('Sending...', '');
  try {
    const res = await fetch('/pair/' + code, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: deck,
    });
    if (res.ok) {
      show('Sent. Your headset will pick up the deck within a few seconds.', 'ok');
      return;
    }
    let detail = '';
    try {
      detail = (await res.json()).error || '';
    } catch {
      // Non-JSON error bodies fall back to the generic message.
    }
    const base = MESSAGES[res.status] || 'Sending failed (HTTP ' + res.status + ').';
    show(res.status === 400 && detail ? base + ': ' + detail : base, 'error');
  } catch {
    show('Network error. Check your connection and try again.', 'error');
  } finally {
    button.disabled = false;
  }
});
