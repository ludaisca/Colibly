// Comportamiento del sitio de cPanel, sin dependencias. Las reglas de validación
// y los textos repiten los de la beta en Next (lib/beta-application.ts y
// app/(beta)/beta/_application-form.tsx): cámbialos juntos. El servidor
// (solicitud.php) vuelve a validar todo.
document.addEventListener('DOMContentLoaded', () => {
  initStickyCta();
  initApplicationForm();
});

// Barra inferior solo para móvil: aparece cuando el botón del hero ya salió por
// arriba y se esconde sobre el formulario y el pie.
function initStickyCta() {
  const bar = document.querySelector('#sticky-cta');
  const hero = document.querySelector('#hero-cta');
  if (!bar || !hero || !('IntersectionObserver' in window)) return;
  let heroScrolledPast = false;
  const covering = new Set();
  const update = () => {
    const visible = heroScrolledPast && covering.size === 0;
    bar.classList.toggle('visible', visible);
    bar.inert = !visible;
  };
  new IntersectionObserver(([entry]) => {
    heroScrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    update();
  }).observe(hero);
  const coverObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) covering.add(entry.target);
      else covering.delete(entry.target);
    }
    update();
  });
  document.querySelectorAll('#solicitar, footer').forEach((el) => coverObserver.observe(el));
}

function initApplicationForm() {
  const form = document.querySelector('#beta-form');
  if (!form) return;
  const errorBox = document.querySelector('#form-error');
  const button = form.querySelector('button[type="submit"]');
  const contact = form.dataset.contact || '';
  const SUBMIT_TIMEOUT_MS = 20000;
  const DRAFT_KEY = 'colibly_beta_draft';
  const TEXT_FIELDS = ['name', 'businessName', 'email', 'phone', 'description'];
  const ORDER = ['name', 'businessName', 'email', 'phone', 'description', 'privacyAccepted'];
  const digits = (value) => value.replace(/\D/g, '').length;

  const rules = {
    name: (v) => (v.length < 2 ? 'Escribe tu nombre' : v.length > 80 ? 'Usa 80 caracteres o menos' : ''),
    businessName: (v) => (v.length < 2 ? 'Escribe el nombre de tu negocio' : v.length > 100 ? 'Usa 100 caracteres o menos' : ''),
    email: (v) => (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Escribe un correo válido' : ''),
    phone: (v) => {
      if (!v) return 'Escribe tu WhatsApp de contacto';
      if (v.length > 30) return 'Escribe un número válido';
      if (!/^[+()\d\s.-]+$/.test(v)) return 'Usa solo números y los signos + ( ) . -';
      if (digits(v) < 8 || digits(v) > 15) return 'Revisa el número: incluye la lada, por ejemplo 55 1234 5678';
      return '';
    },
    description: (v) => (v.length > 400 ? 'Usa 400 caracteres o menos' : ''),
  };

  const field = (name) => form.elements[name];
  const errorEl = (name) => form.querySelector('#err-' + name);

  function setError(name, message) {
    const input = field(name);
    const box = errorEl(name);
    if (!input || !box) return;
    box.textContent = message;
    box.hidden = !message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function check(name) {
    if (name === 'privacyAccepted') {
      const message = field(name).checked ? '' : 'Marca la casilla de aceptación para enviar tu solicitud';
      setError(name, message);
      return message;
    }
    const message = rules[name](field(name).value.trim());
    setError(name, message);
    return message;
  }

  // Borrador por pestaña: sobrevive a un refresco o a abrir el aviso de privacidad
  // y se borra al enviar. No guarda la casilla de consentimiento ni el campo trampa.
  let draft = {};
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      for (const name of TEXT_FIELDS) {
        if (typeof saved[name] === 'string' && saved[name]) {
          field(name).value = saved[name];
          draft[name] = saved[name];
        }
      }
    }
  } catch {
    // Sin sessionStorage (modo privado o datos bloqueados): funciona igual, sin borrador.
  }
  const remember = (name, value) => {
    draft[name] = value;
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* sin borrador */ }
  };

  for (const name of TEXT_FIELDS) {
    const input = field(name);
    input.addEventListener('input', () => {
      remember(name, input.value);
      // Un error visible se corrige en vivo.
      if (errorEl(name) && !errorEl(name).hidden) check(name);
    });
    // Un campo vacío no se marca al pasar por él con el tabulador (eso se avisa al enviar).
    input.addEventListener('blur', () => { if (input.value.trim()) check(name); });
  }
  field('privacyAccepted').addEventListener('change', () => {
    if (field('privacyAccepted').checked) setError('privacyAccepted', '');
  });

  function showFormError(message) {
    errorBox.textContent = message + ' ';
    if (contact) {
      const link = document.createElement('a');
      link.href = 'mailto:' + contact;
      link.textContent = 'También puedes escribirnos.';
      errorBox.appendChild(link);
    }
    errorBox.hidden = false;
    // El botón se vuelve a habilitar y recupera el foco; el aviso queda a la vista y role="alert" lo anuncia.
    button.disabled = false;
    button.textContent = 'Solicitar acceso a la beta';
    button.focus({ preventScroll: true });
    errorBox.scrollIntoView({ block: 'nearest' });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    errorBox.hidden = true;

    const invalid = ORDER.filter((name) => check(name));
    if (invalid.length) {
      field(invalid[0]).focus();
      return;
    }

    button.disabled = true;
    button.textContent = 'Enviando solicitud…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
    try {
      const body = new FormData(form);
      for (const name of TEXT_FIELDS) body.set(name, field(name).value.trim());
      const response = await fetch(form.action, { method: 'POST', body, credentials: 'same-origin', headers: { 'Accept': 'application/json' }, signal: controller.signal });
      // Un 502 o una página de error del proxy no traen JSON: no mostrar el SyntaxError del navegador.
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || !data.success) {
        showFormError(data && typeof data.error === 'string' ? data.error : 'No pudimos enviar tu solicitud.');
        return;
      }
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* sin borrador */ }
      const email = field('email').value.trim();
      const done = document.createElement('div');
      done.className = 'application-card';
      done.setAttribute('role', 'status');
      const title = document.createElement('h3');
      title.tabIndex = -1;
      title.textContent = 'Recibimos tu solicitud';
      const text = document.createElement('p');
      text.textContent = 'Revisaremos si la beta encaja con tu negocio y te responderemos por correo a ' + email + '. Si necesitas añadir algo, escríbenos a ' + contact + '.';
      done.append(title, text);
      form.replaceWith(done);
      title.focus();
    } catch (error) {
      // fetch lanza en inglés ("Failed to fetch", "Load failed") sin conexión o al agotar el tiempo.
      showFormError(error && error.name === 'AbortError'
        ? 'La solicitud tardó demasiado. Revisa tu conexión e inténtalo de nuevo; lo que escribiste sigue aquí.'
        : 'No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo; lo que escribiste sigue aquí.');
    } finally {
      clearTimeout(timer);
    }
  });
}
