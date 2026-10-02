<?php
declare(strict_types=1);
require __DIR__ . '/config.php';
header('Content-Type: text/html; charset=UTF-8');
header('X-Robots-Tag: noindex, nofollow'); // Borradores: retirar solo tras revisión legal.
function legal_header(string $title): void { ?>
<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title><?= html($title) ?> | Colibly</title><link rel="icon" href="/assets/icon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/site.css"></head><body><a class="skip" href="#contenido-principal">Saltar al contenido principal</a><header class="site-header"><div class="container header-inner"><a class="brand" href="/"><img src="/assets/icon.svg" width="36" height="36" alt=""><span>Colibly</span></a><a class="login" style="margin-left:auto" href="<?= html(APP_URL) ?>/login">Entrar</a><a class="button button-primary header-cta" href="/#solicitar">Solicitar acceso</a></div></header><main id="contenido-principal" class="container legal"><div class="legal-note"><strong>Borrador pendiente de revisión legal.</strong> Este texto es una base de trabajo y todavía no es la versión definitiva.</div><h1><?= html($title) ?></h1><p>Última actualización: 25 de septiembre de 2026</p>
<?php }
function legal_footer(): void { ?>
</main><footer class="footer"><div class="container footer-main"><div><a class="brand" href="/"><img src="/assets/icon.svg" width="32" height="32" alt=""><span>Colibly</span></a><p>Conversaciones que avanzan contigo.</p></div><nav aria-label="Enlaces del pie de página"><a href="mailto:contacto@colibly.com">contacto@colibly.com</a><a href="/terminos">Términos</a><a href="/privacidad">Privacidad</a></nav></div></footer></body></html>
<?php }
