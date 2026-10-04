<?php
declare(strict_types=1);
require __DIR__ . '/config.php';
start_site_session();
if (!isset($_SESSION['beta_csrf'])) $_SESSION['beta_csrf'] = bin2hex(random_bytes(24));
header('Content-Type: text/html; charset=UTF-8');
$faq = [
  ['¿Necesito saber de tecnología para empezar?', 'No. Te acompañamos en la conexión y la configuración inicial. Necesitarás tener control de tu número y autorizar la conexión desde tu cuenta de Meta (la empresa dueña de WhatsApp).'],
  ['¿Cuándo comienzan los 30 días?', 'Cuando tu cuenta esté preparada para usarla. Coordinaremos contigo la fecha de activación antes de empezar la prueba.'],
  ['¿Me cobrarán al terminar?', 'No habrá cobro automático por la beta ni pedimos tarjeta para solicitar acceso. Antes de terminar, podrás decidir si continúas con uno de los planes disponibles.'],
  ['¿Cuánto costará después de la beta?', 'Antes de que termine tu prueba te mostraremos el precio y las condiciones del plan para que decidas si quieres continuar. Solicitar acceso no activa un cobro.'],
  ['¿Puedo usar mi número actual?', 'Revisaremos contigo si tu número cumple los requisitos de conexión de WhatsApp y de Meta. Tú conservas el control del número y autorizas la conexión.'],
  ['¿Hay algún otro costo por usar WhatsApp?', 'Meta puede cobrar algunos mensajes de WhatsApp según el tipo de mensaje y el destino. Te ayudaremos a entenderlo antes de conectar tu número; esos cargos son independientes de Colibly.'],
  ['¿Puedo detener las respuestas de IA?', 'Sí. Tu equipo puede atender directamente y pausar el asistente cuando lo necesite. Probamos sus respuestas con tu información antes de activarlo.'],
];
$ld = [
  '@context' => 'https://schema.org',
  '@graph' => [
    ['@type' => 'Organization', '@id' => SITE_URL . '/#organization', 'name' => 'Colibly', 'url' => SITE_URL . '/',
      'logo' => SITE_URL . '/assets/apple-touch-icon.png', 'email' => CONTACT_EMAIL,
      'contactPoint' => ['@type' => 'ContactPoint', 'email' => CONTACT_EMAIL, 'contactType' => 'customer support', 'availableLanguage' => 'es']],
    ['@type' => 'WebSite', '@id' => SITE_URL . '/#website', 'url' => SITE_URL . '/', 'name' => 'Colibly', 'inLanguage' => 'es-MX', 'publisher' => ['@id' => SITE_URL . '/#organization']],
    ['@type' => 'WebPage', '@id' => SITE_URL . '/#webpage', 'url' => SITE_URL . '/', 'name' => 'Colibly Beta — Vende por WhatsApp sin perder conversaciones', 'inLanguage' => 'es-MX', 'isPartOf' => ['@id' => SITE_URL . '/#website'], 'about' => ['@id' => SITE_URL . '/#software'], 'primaryImageOfPage' => SITE_URL . '/assets/share.png'],
    ['@type' => 'SoftwareApplication', '@id' => SITE_URL . '/#software', 'name' => 'Colibly', 'applicationCategory' => 'BusinessApplication', 'operatingSystem' => 'Web',
      'description' => 'Colibly es un CRM conversacional para negocios que venden por mensaje: reúne WhatsApp, clientes y equipo en una sola bandeja, con un asistente de IA que responde con la información del negocio y seguimiento de cada cliente.',
      'url' => SITE_URL . '/', 'inLanguage' => 'es', 'publisher' => ['@id' => SITE_URL . '/#organization'],
      'offers' => ['@type' => 'Offer', 'name' => 'Beta privada de 30 días', 'price' => '0', 'priceCurrency' => 'USD', 'description' => '30 días sin costo y sin tarjeta para los primeros 10 negocios, con configuración acompañada.']],
    ['@type' => 'FAQPage', '@id' => SITE_URL . '/#faq', 'inLanguage' => 'es-MX', 'mainEntity' => array_map(fn($f) => ['@type' => 'Question', 'name' => $f[0], 'acceptedAnswer' => ['@type' => 'Answer', 'text' => $f[1]]], $faq)],
  ],
];
?>
<!doctype html>
<html lang="es-MX">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Colibly Beta — Vende por WhatsApp sin perder conversaciones</title>
  <meta name="description" content="Reúne tus chats, clientes y equipo en un solo lugar. Te ayudamos a configurar un asistente de IA para tu negocio. Solicita 30 días de beta sin costo y sin tarjeta.">
  <link rel="canonical" href="<?= html(SITE_URL) ?>/"><link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
  <meta property="og:type" content="website"><meta property="og:locale" content="es_MX"><meta property="og:site_name" content="Colibly"><meta property="og:title" content="Colibly Beta — Vende por WhatsApp sin perder conversaciones"><meta property="og:description" content="30 días de beta sin costo, sin tarjeta y con configuración acompañada."><meta property="og:url" content="<?= html(SITE_URL) ?>/"><meta property="og:image" content="<?= html(SITE_URL) ?>/assets/share.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Colibly: vende por WhatsApp sin perder conversaciones">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="Colibly Beta — Vende por WhatsApp sin perder conversaciones"><meta name="twitter:description" content="30 días de beta sin costo, sin tarjeta y con configuración acompañada."><meta name="twitter:image" content="<?= html(SITE_URL) ?>/assets/share.png"><meta name="twitter:image:alt" content="Colibly: vende por WhatsApp sin perder conversaciones">
  <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1"><meta name="theme-color" content="#5B34E6"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png"><link rel="alternate" type="text/markdown" href="/llms.txt" title="Resumen para asistentes de IA">
  <script type="application/ld+json"><?= json_encode($ld, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) ?></script>
  <link rel="stylesheet" href="/assets/site.css"><script src="/assets/site.js" defer></script>
</head>
<body>
<a class="skip" href="#contenido-principal">Saltar al contenido principal</a>
<header class="site-header"><div class="container header-inner">
  <a class="brand" href="/" aria-label="Colibly, inicio"><img src="/assets/icon.svg" width="36" height="36" alt=""><span>Colibly</span></a>
  <nav class="header-nav" aria-label="Secciones"><a href="#como-funciona">Cómo funciona</a><a href="#incluye">La beta</a><a href="#preguntas">Preguntas</a></nav>
  <a class="login" href="<?= html(APP_URL) ?>/login">Entrar</a><a class="button button-primary header-cta" href="#solicitar">Solicitar acceso</a>
</div></header>
<main id="contenido-principal" tabindex="-1">
  <section class="hero"><div class="container hero-grid"><div class="hero-copy">
    <h1>Vende por WhatsApp <em>sin perder conversaciones.</em></h1>
    <p class="lead">Si vendes servicios por WhatsApp, Colibly reúne las consultas de tu equipo y el seguimiento de cada cliente. Te ayudamos a configurar un asistente con la información de tu negocio; tú decides cuándo responde.</p>
    <div class="actions"><a class="button button-primary" id="hero-cta" href="#solicitar">Solicitar acceso a la beta <span aria-hidden="true">→</span></a><a class="button button-outline" href="#como-funciona">Ver cómo funciona</a></div>
    <p class="fine">30 días sin costo · Sin tarjeta · Te ayudamos a empezar</p>
  </div><div class="hero-demo" role="img" aria-label="Ejemplo ilustrativo de una conversación en Colibly: la bandeja del equipo con tres chats y una respuesta preparada con IA">
    <div class="demo-window"><div class="demo-head"><div><strong>Bandeja de tu equipo</strong><small>Todos saben qué sigue</small></div><span class="online">En línea</span></div>
      <div class="demo-body"><div class="demo-list"><small>CHATS</small><div class="demo-contact selected"><strong>Mariana G.</strong><span>Quiere una cita</span></div><div class="demo-contact"><strong>Carlos R.</strong><span>Pidió precios</span></div><div class="demo-contact"><strong>Lucía M.</strong><span>En seguimiento</span></div></div>
      <div class="demo-thread"><small>Mariana G. · WhatsApp</small><p class="bubble incoming">Hola, ¿tienen horarios para una consulta esta semana?</p><p class="bubble outgoing">¡Hola! Tenemos espacios el jueves y viernes. ¿Qué día te funciona mejor?</p><div class="demo-tags"><span>Nueva oportunidad</span><span>Pendiente de agendar</span></div></div></div>
    </div><div class="ai-note">Respuesta preparada con IA</div>
  </div></div></section>

  <section class="section"><div class="container editorial-split"><div><h2>De la primera pregunta al siguiente paso.</h2><p class="section-intro">Una persona pregunta por una cita. Otra pide precios. Tu equipo puede atender ambas sin perder lo que ya se habló.</p></div><div class="conversation-flow">
    <div class="flow-row"><p>Cuando preguntan</p><div><h3>La consulta queda a la vista</h3><p>Tu equipo ve el mensaje en la misma bandeja, aunque atiendan varias personas.</p></div></div>
    <div class="flow-row"><p>Cuando respondes</p><div><h3>El contexto acompaña la respuesta</h3><p>Tienes a mano lo que pidió el cliente; el asistente usa tus servicios y preguntas frecuentes si decides activarlo.</p></div></div>
    <div class="flow-row"><p>Cuando vuelve</p><div><h3>Sabes qué falta por resolver</h3><p>Asigna la conversación y retoma la cita o la cotización sin empezar de cero.</p></div></div>
  </div></div></section>

  <section class="section section-tint" id="como-funciona"><div class="container editorial-split"><div><h2>La configuración la hacemos contigo.</h2><p class="section-intro">No tienes que descubrir solo cómo conectar tu número ni activar respuestas sin probarlas.</p></div><ol class="setup-steps">
    <li><span class="step-number" aria-hidden="true">01</span><div><h3>Nos cuentas cómo atiendes</h3><p>Una conversación breve para conocer tu negocio, tus clientes y lo que te gustaría mejorar.</p></div></li>
    <li><span class="step-number" aria-hidden="true">02</span><div><h3>Conectamos y probamos contigo</h3><p>Te guiamos para conectar WhatsApp, agregar a tu equipo y probar las respuestas antes de activar el asistente.</p></div></li>
    <li><span class="step-number" aria-hidden="true">03</span><div><h3>Tu equipo empieza; seguimos cerca</h3><p>Usas Colibly con clientes reales. Durante el primer mes revisamos contigo qué funciona y qué debemos ajustar.</p></div></li>
  </ol></div></section>

  <section class="section" id="incluye"><div class="container split"><div><h2>Un mes para comprobarlo en tu propio negocio.</h2><p class="section-intro">Estamos invitando a un grupo pequeño para acompañar cada incorporación y mejorar Colibly con quienes lo usen todos los días.</p><a class="text-link" href="#solicitar">Solicitar acceso <span aria-hidden="true">→</span></a></div>
    <div class="offer-card"><div class="offer-top"><span class="offer-badge">BETA PRIVADA</span><strong>Primeros 10 negocios</strong></div><p class="price">30 días <span>sin costo</span></p><p>La prueba comienza cuando tu espacio quede listo para usar.</p><ul class="checks"><li>Una cuenta de WhatsApp conectada con nuestra guía</li><li>Hasta tres personas de tu equipo</li><li>Bandeja compartida y seguimiento de clientes</li><li>Un asistente de IA preparado con tu información</li><li>Sesión inicial y dos revisiones durante el mes</li></ul><p class="offer-foot">Sin tarjeta ni cobro automático. El uso de IA y canales tiene los límites de la beta. Algunos mensajes de WhatsApp pueden generar cargos de Meta.</p></div>
  </div></section>

  <section class="section section-tint" id="preguntas"><div class="container split faq-grid"><div><h2>Preguntas frecuentes</h2><p class="section-intro">¿Hay algo más que quieras saber? Escríbenos a <a class="text-link" href="mailto:<?= html(CONTACT_EMAIL) ?>"><?= html(CONTACT_EMAIL) ?></a>.</p></div><div class="faqs">
    <?php foreach ($faq as [$q, $a]): ?><details><summary><?= html($q) ?></summary><p><?= html($a) ?></p></details><?php endforeach; ?>
  </div></div></section>

  <section class="section" id="solicitar"><div class="container split application-grid"><div><h2>Empecemos por conocer tu negocio.</h2><p class="section-intro">Solicitar acceso toma menos de dos minutos. Te contactaremos personalmente para confirmar si la beta encaja contigo y ayudarte a empezar.</p><p class="reassurance">Tú mantienes el control de tu número y decides qué información usa el asistente.</p></div>
    <form id="beta-form" class="application-card" action="/solicitud.php" method="post" novalidate data-contact="<?= html(CONTACT_EMAIL) ?>"><input type="hidden" name="csrf" value="<?= html($_SESSION['beta_csrf']) ?>"><div class="honeypot" aria-hidden="true"><label for="website">Sitio web</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>
      <h3>Cuéntanos de tu negocio</h3><p class="form-intro">Son datos de contacto y una pregunta opcional. La configuración la vemos contigo después.</p><p class="required-note"><span aria-hidden="true">*</span> Obligatorio</p><div id="form-error" class="form-error" role="alert" tabindex="-1" hidden></div>
      <div class="form-grid">
        <div class="field"><label for="f-name">Tu nombre <span aria-hidden="true">*</span></label><input id="f-name" name="name" autocomplete="name" maxlength="80" required placeholder="Ana López" aria-describedby="err-name"><p class="field-error" id="err-name" role="alert" hidden></p></div>
        <div class="field"><label for="f-business">Nombre de tu negocio <span aria-hidden="true">*</span></label><input id="f-business" name="businessName" autocomplete="organization" maxlength="100" required placeholder="Estudio Aurora" aria-describedby="err-businessName"><p class="field-error" id="err-businessName" role="alert" hidden></p></div>
        <div class="field"><label for="f-email">Correo donde te escribimos <span aria-hidden="true">*</span></label><input id="f-email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254" required placeholder="ana@negocio.com" aria-describedby="err-email"><p class="field-error" id="err-email" role="alert" hidden></p></div>
        <div class="field"><label for="f-phone">WhatsApp de contacto <span aria-hidden="true">*</span></label><input id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" required placeholder="+52 55 1234 5678" aria-describedby="hint-phone err-phone"><p class="field-hint" id="hint-phone">Incluye la lada; acepta números de 8 a 15 dígitos.</p><p class="field-error" id="err-phone" role="alert" hidden></p></div>
      </div>
      <div class="field wide-field"><label for="f-description">¿Cómo atiendes hoy los mensajes de tus clientes?</label><textarea id="f-description" name="description" maxlength="400" rows="3" placeholder="Somos dos personas y atendemos desde un solo celular…" aria-describedby="hint-description err-description"></textarea><p class="field-hint" id="hint-description">Opcional. Con una frase basta.</p><p class="field-error" id="err-description" role="alert" hidden></p></div>
      <div class="field"><label class="privacy-check" for="f-privacy"><input id="f-privacy" name="privacyAccepted" type="checkbox" value="1" required aria-describedby="err-privacyAccepted"><span>Acepto que Colibly me contacte sobre esta beta. Leí el <a href="/privacidad" target="_blank" rel="noopener noreferrer">aviso de privacidad<span class="sr-only"> (se abre en una pestaña nueva)</span></a>.</span></label><p class="field-error" id="err-privacyAccepted" role="alert" hidden></p></div>
      <button class="button button-primary submit" type="submit">Solicitar acceso a la beta</button>
    </form>
  </div></section>
</main>
<footer class="footer"><div class="container footer-main"><div><a class="brand" href="/"><img src="/assets/icon.svg" width="32" height="32" alt=""><span>Colibly</span></a><p>Vende por WhatsApp sin perder conversaciones.</p></div><nav aria-label="Enlaces del pie de página"><a href="mailto:<?= html(CONTACT_EMAIL) ?>"><?= html(CONTACT_EMAIL) ?></a><a href="/terminos">Términos</a><a href="/privacidad">Privacidad</a><a href="<?= html(APP_URL) ?>/login">Entrar al producto</a></nav></div><div class="container copyright">© <?= date('Y') ?> Colibly</div></footer>
<div class="sticky-cta" id="sticky-cta" inert><a class="button button-primary" href="#solicitar">Solicitar acceso a la beta <span aria-hidden="true">→</span></a></div>
</body></html>
