<?php
declare(strict_types=1);
require __DIR__ . '/config.php';
start_site_session();
if (!isset($_SESSION['beta_csrf'])) $_SESSION['beta_csrf'] = bin2hex(random_bytes(24));
header('Content-Type: text/html; charset=UTF-8');
$faq = [
  ['¿Necesito saber de tecnología para empezar?', 'No. Te acompañamos en la conexión y la configuración inicial. Necesitarás tener control de tu número y autorizar la conexión desde tu cuenta de negocio.'],
  ['¿Cuándo comienzan los 30 días?', 'Cuando tu cuenta esté preparada para usarla. Coordinaremos contigo la fecha de activación antes de empezar la prueba.'],
  ['¿Me cobrarán al terminar?', 'No habrá cobro automático por la beta ni pedimos tarjeta para solicitar acceso. Antes de terminar, podrás decidir si continúas con uno de los planes disponibles.'],
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
  <link rel="canonical" href="https://colibly.com/"><link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
  <meta property="og:type" content="website"><meta property="og:locale" content="es_MX"><meta property="og:site_name" content="Colibly"><meta property="og:title" content="Colibly Beta — Vende por WhatsApp sin perder conversaciones"><meta property="og:description" content="30 días de beta sin costo, sin tarjeta y con configuración acompañada."><meta property="og:url" content="https://colibly.com/"><meta property="og:image" content="https://colibly.com/assets/share.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Colibly: cada chat puede ser una oportunidad">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="Colibly Beta — Vende por WhatsApp sin perder conversaciones"><meta name="twitter:description" content="30 días de beta sin costo, sin tarjeta y con configuración acompañada."><meta name="twitter:image" content="https://colibly.com/assets/share.png">
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
    <span class="eyebrow pill"><span class="dot"></span>Beta privada · 10 negocios</span>
    <h1>Cada chat puede ser <em>una oportunidad.</em></h1>
    <p class="lead">Reúne tu WhatsApp, tus clientes y tu equipo en un solo lugar. Un asistente de IA te ayuda a responder con la información de tu negocio, mientras tú mantienes el control.</p>
    <div class="actions"><a class="button button-primary" href="#solicitar">Solicitar acceso a la beta <span aria-hidden="true">→</span></a><a class="button button-outline" href="#como-funciona">Ver cómo funciona</a></div>
    <p class="fine">30 días sin costo · Sin tarjeta · Te ayudamos a empezar</p>
  </div><div class="hero-demo" role="img" aria-label="Ejemplo ilustrativo de una conversación en Colibly">
    <div class="demo-window"><div class="demo-head"><span class="demo-icon">◉</span><div><strong>Bandeja de tu equipo</strong><small>Todos saben qué sigue</small></div><span class="online">En línea</span></div>
      <div class="demo-body"><div class="demo-list"><small>CONVERSACIONES</small><div class="demo-contact selected"><strong>Mariana G.</strong><span>Quiere una cita</span></div><div class="demo-contact"><strong>Carlos R.</strong><span>Pidió precios</span></div><div class="demo-contact"><strong>Lucía M.</strong><span>En seguimiento</span></div></div>
      <div class="demo-thread"><small>Mariana G. · WhatsApp</small><p class="bubble incoming">Hola, ¿tienen horarios para una consulta esta semana?</p><p class="bubble outgoing">¡Hola! Tenemos espacios el jueves y viernes. ¿Qué día te funciona mejor?</p><div class="demo-tags"><span>Nueva oportunidad</span><span>Pendiente de agendar</span></div></div></div>
    </div><div class="ai-note"><span>✦</span> Respuesta preparada con IA</div><p class="demo-caption">Ejemplo ilustrativo</p>
  </div></div></section>

  <section class="section"><div class="container"><p class="eyebrow">Lo que cambia</p><h2>Menos chats perdidos. Más conversaciones que avanzan.</h2><p class="section-intro">Empieza con lo esencial para atender bien, responder a tiempo y saber a quién dar seguimiento.</p><div class="cards three">
    <article class="card"><span class="card-icon">▣</span><h3>Todos los chats, a la vista</h3><p>Tu equipo atiende desde una misma bandeja y sabe qué conversación necesita respuesta.</p></article>
    <article class="card"><span class="card-icon">✦</span><h3>Respuestas con tu información</h3><p>Preparamos un asistente con tus servicios, precios y preguntas frecuentes para ayudarte a responder.</p></article>
    <article class="card"><span class="card-icon">◎</span><h3>Cada cliente tiene seguimiento</h3><p>Guarda sus datos, asigna la conversación y retoma oportunidades sin empezar de cero.</p></article>
  </div></div></section>

  <section class="section section-tint" id="como-funciona"><div class="container"><p class="eyebrow">Empezar es sencillo</p><h2>Tú conoces tu negocio. Nosotros te ayudamos a ponerlo en marcha.</h2><ol class="cards three steps">
    <li class="card"><span class="step-number">01</span><h3>Nos cuentas cómo atiendes</h3><p>Una conversación breve para conocer tu negocio, tus clientes y lo que te gustaría mejorar.</p></li>
    <li class="card"><span class="step-number">02</span><h3>Lo dejamos listo contigo</h3><p>Te guiamos para conectar WhatsApp, agregar a tu equipo y preparar las primeras respuestas del asistente.</p></li>
    <li class="card"><span class="step-number">03</span><h3>Lo pruebas en tu día a día</h3><p>Tu equipo usa Colibly con clientes reales. Revisamos contigo qué funciona y qué debemos ajustar.</p></li>
  </ol></div></section>

  <section class="section" id="incluye"><div class="container split"><div><p class="eyebrow">La oferta beta</p><h2>Un mes para comprobarlo en tu propio negocio.</h2><p class="section-intro">Estamos invitando a un grupo pequeño para acompañar cada incorporación y mejorar Colibly con quienes lo usen todos los días.</p><a class="text-link" href="#solicitar">Solicitar acceso →</a></div>
    <div class="offer-card"><div class="offer-top"><span class="offer-badge">BETA PRIVADA</span><strong>Primeros 10 negocios</strong></div><p class="price">30 días <span>sin costo</span></p><p>La prueba comienza cuando tu espacio quede listo para usar.</p><ul class="checks"><li>Una cuenta de WhatsApp conectada con nuestra guía</li><li>Hasta tres personas de tu equipo</li><li>Bandeja compartida y seguimiento de clientes</li><li>Un asistente de IA preparado con tu información</li><li>Sesión inicial y dos revisiones durante el mes</li></ul><p class="offer-foot">Sin tarjeta ni cobro automático. El uso de IA y canales tiene los límites de la beta. Algunos mensajes de WhatsApp pueden generar cargos de Meta.</p></div>
  </div></section>

  <section class="section section-tint" id="preguntas"><div class="container split faq-grid"><div><p class="eyebrow">Sin sorpresas</p><h2>Preguntas frecuentes</h2><p class="section-intro">¿Hay algo más que quieras saber? Escríbenos a <a class="text-link" href="mailto:contacto@colibly.com">contacto@colibly.com</a>.</p></div><div class="faqs">
    <?php foreach ($faq as [$q, $a]): ?><details><summary><?= html($q) ?></summary><p><?= html($a) ?></p></details><?php endforeach; ?>
  </div></div></section>

  <section class="section" id="solicitar"><div class="container split application-grid"><div><p class="eyebrow">Tu siguiente paso</p><h2>Empecemos por conocer tu negocio.</h2><p class="section-intro">Solicitar acceso toma menos de dos minutos. Te contactaremos personalmente para confirmar si la beta encaja contigo y ayudarte a empezar.</p><p class="reassurance">✧ Tú mantienes el control de tu número y decides qué información usa el asistente.</p></div>
    <form id="beta-form" class="application-card" action="/solicitud.php" method="post" novalidate><input type="hidden" name="csrf" value="<?= html($_SESSION['beta_csrf']) ?>"><div class="honeypot" aria-hidden="true"><label for="website">Sitio web</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>
      <p class="eyebrow">Solicitud de acceso</p><h3>Cuéntanos de tu negocio</h3><p class="form-intro">Son solo tus datos de contacto. La configuración la vemos contigo después.</p><div id="form-error" class="form-error" role="alert" hidden></div>
      <div class="form-grid"><label>Tu nombre <span>*</span><input name="name" autocomplete="name" maxlength="80" required placeholder="Ana López"></label><label>Nombre de tu negocio <span>*</span><input name="businessName" autocomplete="organization" maxlength="100" required placeholder="Estudio Aurora"></label><label>Correo donde te escribimos <span>*</span><input name="email" type="email" autocomplete="email" maxlength="254" required placeholder="ana@negocio.com"></label><label>WhatsApp de contacto <span>*</span><input name="phone" type="tel" autocomplete="tel" maxlength="30" required placeholder="+52 55 1234 5678"></label></div>
      <label class="wide-label">¿Cómo atienden sus mensajes hoy? <small>Opcional. Con una frase basta.</small><textarea name="description" maxlength="400" rows="3" placeholder="Somos dos personas y atendemos desde un solo celular…"></textarea></label>
      <label class="privacy-check"><input name="privacyAccepted" type="checkbox" value="1" required><span>Acepto que Colibly me contacte sobre esta beta. Leí el <a href="/privacidad">aviso de privacidad</a>.</span></label>
      <button class="button button-primary submit" type="submit">Solicitar acceso a la beta</button><p class="form-fine">Sin tarjeta ni compromiso de pago</p>
    </form>
  </div></section>
</main>
<footer class="footer"><div class="container footer-main"><div><a class="brand" href="/"><img src="/assets/icon.svg" width="32" height="32" alt=""><span>Colibly</span></a><p>Conversaciones que avanzan contigo.</p></div><nav aria-label="Enlaces del pie de página"><a href="mailto:contacto@colibly.com">contacto@colibly.com</a><a href="/terminos">Términos</a><a href="/privacidad">Privacidad</a><a href="<?= html(APP_URL) ?>/login">Entrar al producto</a></nav></div><div class="container copyright">© <?= date('Y') ?> Colibly</div></footer>
</body></html>
