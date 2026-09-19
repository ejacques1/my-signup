const form = document.querySelector('#unlock-form');
const message = document.querySelector('#form-message');
const button = form.querySelector('button');
const buttonLabel = document.querySelector('#button-label');
const unlocked = document.querySelector('#unlocked');

async function openGuide(scroll = true) {
  const response = await fetch('/api/document', { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) return false;
  const data = await response.json();
  document.querySelector('#document-content').innerHTML = data.html;
  unlocked.hidden = false;
  document.querySelector('#gate-title').textContent = 'Your guide is ready.';
  document.querySelector('.gate-lead').textContent = 'Your signup is saved. Explore your scholarship resources below, or download a copy to keep.';
  form.hidden = true;
  if (scroll) {
    unlocked.focus({ preventScroll: true });
    unlocked.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  return true;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  button.disabled = true;
  form.setAttribute('aria-busy', 'true');
  buttonLabel.textContent = 'Saving your signup…';
  message.textContent = '';
  try {
    const response = await fetch('/api/unlock', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email.value.trim(), website: form.website.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'We couldn’t save your signup. Please try again.');
    if (!await openGuide()) throw new Error('Your signup was saved, but the guide couldn’t open. Please allow cookies and try again.');
  } catch (error) {
    message.textContent = error instanceof TypeError ? 'We couldn’t connect. Check your internet connection and try again.' : error.message;
  } finally {
    button.disabled = false;
    buttonLabel.textContent = 'Unlock the free guide';
    form.removeAttribute('aria-busy');
  }
});

// The server checks the signed HttpOnly cookie. Browser state cannot unlock the guide.
openGuide(false).catch(() => {});
