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
  const onlyDigits = (value) => value.replace(/\D/g, '');
  const field = (name) => form.elements[name];
  const errorEl = (name) => form.querySelector('#err-' + name);
  const countries = Array.isArray(window.COLIBLY_PHONE_COUNTRIES) ? window.COLIBLY_PHONE_COUNTRIES : [];
  const countryByIso = new Map(countries.map((country) => [country.iso, country]));
  const countrySelect = field('phoneCountry');
  const phoneInput = field('phone');
  const regionNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['es'], { type: 'region' }) : null;
  const countryName = (country) => regionNames?.of(country.iso) || country.name;
  const flagOf = (iso) => String.fromCodePoint(...[...iso].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
  const preferredCountries = ['MX', 'CO', 'AR', 'US', 'ES'];

  if (countrySelect && countries.length) {
    const sorted = [...countries].sort((a, b) => countryName(a).localeCompare(countryName(b), 'es'));
    const preferred = preferredCountries.map((iso) => countryByIso.get(iso)).filter(Boolean);
    const all = sorted.filter((country) => !preferredCountries.includes(country.iso));
    countrySelect.replaceChildren(...[...preferred, ...all].map((country) => {
      const option = document.createElement('option');
      option.value = country.iso;
      option.textContent = `${flagOf(country.iso)} ${countryName(country)} (+${country.dial})`;
      return option;
    }));
    countrySelect.value = 'MX';
  }

  const capacity = (pattern) => [...pattern].filter((char) => char === '#').length;
  const lengthsOf = (country) => country.patterns.map(capacity);
  const splitTrunk = (country, value) => country.trunk && value.startsWith(country.trunk)
    ? [country.trunk, value.slice(country.trunk.length)] : ['', value];
  const formatNational = (country, value) => {
    const [trunk, rest] = splitTrunk(country, value);
    const pattern = country.patterns.find((candidate) => capacity(candidate) >= rest.length) || country.patterns.at(-1);
    let body = '';
    let index = 0;
    for (const char of pattern) {
      if (index >= rest.length) break;
      body += char === '#' ? rest[index++] : char;
    }
    body += rest.slice(index);
    return trunk ? trunk + (/^#/.test(pattern) ? '' : ' ') + body : body;
  };
  const parseInternational = (value) => {
    const trimmed = value.trim();
    let internationalDigits = onlyDigits(trimmed);
    if (trimmed.startsWith('00')) internationalDigits = internationalDigits.slice(2);
    else if (!trimmed.startsWith('+')) return null;
    const matches = [...countries].sort((a, b) => b.dial.length - a.dial.length)
      .filter((country) => internationalDigits.startsWith(country.dial));
    if (!matches.length) return null;
    const rest = internationalDigits.slice(matches[0].dial.length);
    const country = matches.find((candidate) => candidate.areaCodes?.some((code) => rest.startsWith(code)))
      || matches.find((candidate) => !candidate.areaCodes) || matches[0];
    let national = internationalDigits.slice(country.dial.length);
    const minLength = Math.min(...lengthsOf(country));
    if (country.trunk && national.startsWith(country.trunk) && national.length - country.trunk.length >= minLength) national = national.slice(country.trunk.length);
    const maxLength = Math.max(...lengthsOf(country));
    national = national.slice(0, maxLength);
    return { country, national };
  };
  const phoneE164 = () => {
    const raw = phoneInput.value.trim();
    if (!raw) return '';
    if (raw.startsWith('+') || raw.startsWith('00')) {
      const parsed = parseInternational(raw);
      return parsed?.national ? `+${parsed.country.dial}${parsed.national}` : '';
    }
    const country = countryByIso.get(countrySelect.value) || countryByIso.get('MX');
    if (!country) return '';
    const national = onlyDigits(raw);
    const [trunk, rest] = splitTrunk(country, national);
    const number = trunk ? rest : national;
    const validLength = lengthsOf(country).includes(number.length);
    const e164 = `+${country.dial}${number}`;
    return validLength && e164.replace(/\D/g, '').length <= 15 ? e164 : '';
  };
  const phoneError = () => {
    if (!phoneInput.value.trim()) return 'Escribe tu WhatsApp de contacto';
    const e164 = phoneE164();
    if (!e164) return 'Revisa el número para el país seleccionado';
    const count = digits(e164);
    if (count < 8 || count > 15) return 'Revisa el número: debe tener de 8 a 15 dígitos con la lada';
    return '';
  };
  const rememberPhone = () => {
    draft.phone = phoneE164() || phoneInput.value;
    draft.phoneCountry = countrySelect.value;
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* sin borrador */ }
  };

  const rules = {
    name: (v) => (v.length < 2 ? 'Escribe tu nombre' : v.length > 80 ? 'Usa 80 caracteres o menos' : ''),
    businessName: (v) => (v.length < 2 ? 'Escribe el nombre de tu negocio' : v.length > 100 ? 'Usa 100 caracteres o menos' : ''),
    email: (v) => (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Escribe un correo válido' : ''),
    phone: () => phoneError(),
    description: (v) => (v.length > 400 ? 'Usa 400 caracteres o menos' : ''),
  };

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
          if (name === 'phone') continue;
          field(name).value = saved[name];
          draft[name] = saved[name];
        }
      }
      if (typeof saved.phone === 'string' && saved.phone) {
        const parsed = parseInternational(saved.phone);
        const iso = parsed?.country.iso || (countryByIso.has(saved.phoneCountry) ? saved.phoneCountry : 'MX');
        countrySelect.value = iso;
        const country = countryByIso.get(iso);
        const national = parsed?.national || onlyDigits(saved.phone);
        phoneInput.value = formatNational(country, national);
        draft.phoneCountry = iso;
        draft.phone = phoneE164() || phoneInput.value;
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
      if (name === 'phone') {
        const parsed = phoneInput.value.includes('+') || /^\s*00/.test(phoneInput.value)
          ? parseInternational(phoneInput.value) : null;
        if (parsed) {
          countrySelect.value = parsed.country.iso;
          phoneInput.value = formatNational(parsed.country, parsed.national);
        } else {
          const country = countryByIso.get(countrySelect.value) || countryByIso.get('MX');
          const caret = digits(phoneInput.value.slice(0, phoneInput.selectionStart ?? phoneInput.value.length));
          phoneInput.value = formatNational(country, onlyDigits(phoneInput.value));
          let position = phoneInput.value.length;
          if (caret > 0) {
            let seen = 0;
            for (let i = 0; i < phoneInput.value.length; i++) if (/\d/.test(phoneInput.value[i]) && ++seen === caret) { position = i + 1; break; }
          }
          phoneInput.setSelectionRange(position, position);
        }
        rememberPhone();
      } else remember(name, input.value);
      // Un error visible se corrige en vivo.
      if (errorEl(name) && !errorEl(name).hidden) check(name);
    });
    // Un campo vacío no se marca al pasar por él con el tabulador (eso se avisa al enviar).
    input.addEventListener('blur', () => { if (input.value.trim()) check(name); });
  }
  countrySelect.addEventListener('change', () => {
    const country = countryByIso.get(countrySelect.value) || countryByIso.get('MX');
    phoneInput.value = formatNational(country, onlyDigits(phoneInput.value));
    rememberPhone();
    if (!errorEl('phone').hidden) check('phone');
  });
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
      body.set('phone', phoneE164());
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
