<?php
define('SITE_INDEXABLE', true);
require __DIR__ . '/legal-layout.php';
legal_header('Contacto y soporte', ['wide' => true, 'path' => '/contacto', 'description' => 'Contacto y soporte de Colibly: escríbenos por correo para resolver dudas sobre tu cuenta, la conexión de WhatsApp, los planes o tus datos.']); ?>
<p>¿Dudas sobre tu cuenta, la conexión de WhatsApp, los planes o tus datos? Escríbenos y una persona te responde.</p>
<h2>Correo</h2><p><a class="text-link" href="mailto:contacto@colibly.com">contacto@colibly.com</a>. Es el canal para soporte, ventas, facturación y solicitudes sobre tus datos personales.</p>
<h2>Horario de atención</h2><p>Lunes a viernes, en horario laboral de México. Respondemos tan pronto como nos es posible, normalmente en uno o dos días hábiles.</p>
<h2>Para ayudarte más rápido, incluye en tu mensaje</h2><ul><li>El correo con el que creaste tu cuenta y el nombre de tu negocio.</li><li>Qué intentabas hacer y qué pasó (si puedes, una captura de pantalla).</li><li>Si el problema es con WhatsApp, el número que intentas conectar.</li></ul>
<p><strong>Nunca te pediremos tu contraseña, códigos de verificación ni tokens por correo o chat.</strong> Si alguien lo hace en nombre de Colibly, no lo compartas y avísanos.</p>
<h2>Otros enlaces útiles</h2><ul><li><a class="text-link" href="/precios">Planes y precios</a></li><li><a class="text-link" href="/eliminar-datos">Cómo eliminar tus datos</a></li><li><a class="text-link" href="/privacidad">Aviso de privacidad</a> y <a class="text-link" href="/terminos">Términos y condiciones</a></li><li><a class="text-link" href="<?= html(APP_URL) ?>/login">Entrar a tu cuenta</a> · <a class="text-link" href="<?= html(APP_URL) ?>/recuperar">Recuperar mi contraseña</a></li></ul>
<?php legal_footer(); ?>
