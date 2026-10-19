// Menú móvil: botón con aria-expanded; Escape y clic fuera lo cierran (el foco vuelve al botón).
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.querySelector('#menu-movil');
  if (!toggle || !menu) return;
  const set = (open, focusToggle) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    menu.dataset.open = String(open);
    if (open) menu.querySelector('a').focus();
    else if (focusToggle) toggle.focus();
  };
  toggle.addEventListener('click', () => set(menu.dataset.open !== 'true', false));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false, false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.dataset.open === 'true') set(false, true); });
  document.addEventListener('pointerdown', (e) => { if (menu.dataset.open === 'true' && !menu.contains(e.target) && !toggle.contains(e.target)) set(false, false); });
  window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => { if (e.matches) set(false, false); });
});
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
      done.innerHTML = '<h3 tabindex="-1">Recibimos tu solicitud</h3><p>Te escribiremos al correo que nos dejaste. Mientras tanto, puedes crear tu cuenta gratis y empezar tu prueba cuando quieras.</p>';
      form.replaceWith(done);
      done.querySelector('h3').focus();
    } catch (error) {
      errorBox.textContent = error.message || 'No pudimos enviar tu solicitud. Escríbenos a contacto@colibly.com.';
      errorBox.hidden = false;
      errorBox.focus();
      button.disabled = false;
      button.textContent = 'Quiero que me contacten';
    }
  });
});
