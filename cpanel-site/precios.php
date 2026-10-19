<?php
define('SITE_INDEXABLE', true);
require __DIR__ . '/legal-layout.php';
// Mantener a mano en sincronía con lib/billing/plans.ts (precios y límites) y TRIAL_DAYS.
$plans = [
  ['Básico', 5, 'Para empezar a vender por chat', ['2 usuarios', '1 canal (WhatsApp; otros por habilitación)', 'Chat web disponible por habilitación', '1,000 contactos', '300 créditos de IA al mes', '5 automatizaciones activas'], ['API y webhooks'], false],
  ['Pro', 10, 'Para equipos con varios canales', ['5 usuarios', '3 canales (adicionales por habilitación)', 'Chat web disponible por habilitación', '5,000 contactos', '1,000 créditos de IA al mes', 'Automatizaciones ilimitadas', 'API y webhooks'], [], true],
];
legal_header('Planes y precios', ['path' => '/precios', 'description' => 'Planes y precios de Colibly: Básico y Pro, en dólares, con la IA incluida. Crea tu cuenta y prueba 30 días gratis, sin tarjeta.']); ?>
<p>El registro es abierto: crea tu cuenta y prueba Colibly 30 días gratis con el plan Pro completo, sin tarjeta y sin cobros automáticos. Al terminar, tú eliges el plan.</p>
<div class="cards" style="display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin:24px 0">
<?php foreach ($plans as [$name, $price, $tagline, $features, $missing, $featured]): ?>
<div class="card"<?= $featured ? ' style="border-color:#5B34E6"' : '' ?>><h2 style="margin-top:0"><?= html($name) ?><?= $featured ? ' <small>· Recomendado</small>' : '' ?></h2><p><?= html($tagline) ?></p><p><strong style="font-size:2rem">$<?= $price ?></strong> USD / mes</p><ul><?php foreach ($features as $f): ?><li><?= html($f) ?></li><?php endforeach; ?><?php foreach ($missing as $f): ?><li><span class="sr-only">No incluye: </span><?= html($f) ?> (no incluido)</li><?php endforeach; ?></ul><p><a class="button <?= $featured ? 'button-primary' : 'button-outline' ?>" href="<?= html(APP_URL) ?>/register">Prueba 30 días gratis</a></p></div>
<?php endforeach; ?>
</div>
<h2>Lo que conviene saber</h2><ul><li>La prueba de 30 días incluye el plan Pro completo y no pide tarjeta. Al terminar, si no eliges un plan, tu cuenta pasa a solo lectura y tus datos se conservan.</li><li>Los precios están en dólares estadounidenses (USD), se cobran por mes con tarjeta a través de Stripe y la suscripción se renueva hasta que la cancelas. Antes de contratar verás el precio final y si incluye impuestos.</li><li>La IA ya viene incluida: cada plan trae créditos mensuales, sin que necesites contratar ni configurar una IA por tu cuenta.</li><li>Si un cobro falla tienes 7 días de gracia con todo funcionando antes de pasar a solo lectura.</li><li>Meta puede cobrar algunos mensajes de WhatsApp según su categoría y destino. Esos cargos son independientes de tu suscripción a Colibly.</li></ul>
<p><strong>Precios sujetos a ajuste.</strong> Los precios finales pueden ajustarse. Si cambian, te avisamos con al menos 30 días de anticipación y el cambio aplica a partir de tu siguiente periodo, como indican los <a class="text-link" href="/terminos">Términos y condiciones</a>.</p>
<p>¿Dudas sobre qué plan te conviene? <a class="text-link" href="/contacto">Escríbenos</a>.</p>
<?php legal_footer(); ?>
