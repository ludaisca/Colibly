document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#beta-form');
  if (!form) return;
  const errorBox = document.querySelector('#form-error');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Enviando solicitud…';
    try {
      const response = await fetch(form.action, { method: 'POST', body: new FormData(form), credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'No pudimos enviar tu solicitud.');
      const done = document.createElement('div');
      done.className = 'application-card';
      done.setAttribute('role', 'status');
      done.innerHTML = '<h3 tabindex="-1">Recibimos tu solicitud</h3><p>Revisaremos si la beta encaja con tu negocio y te escribiremos al correo que nos dejaste para dar el siguiente paso.</p>';
      form.replaceWith(done);
      done.querySelector('h3').focus();
    } catch (error) {
      errorBox.textContent = error.message || 'No pudimos enviar tu solicitud. Escríbenos a contacto@colibly.com.';
      errorBox.hidden = false;
      errorBox.focus();
      button.disabled = false;
      button.textContent = 'Solicitar acceso a la beta';
    }
  });
});
