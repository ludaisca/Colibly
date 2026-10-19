<?php
declare(strict_types=1);
require __DIR__ . '/config.php';
header('Content-Type: text/html; charset=UTF-8');
// Los textos legales son borradores: noindex hasta su revisión legal. Las páginas
// informativas (contacto, precios, eliminar datos) definen SITE_INDEXABLE antes
// de cargar este archivo para poder indexarse.
if (!defined('SITE_INDEXABLE')) header('X-Robots-Tag: noindex, nofollow');

// $opts: indexable (bool), description (string), path (string, ruta canónica),
// draft (bool, aviso de borrador legal; por defecto igual a !indexable).
function legal_header(string $title, array $opts = []): void {
    $indexable = defined('SITE_INDEXABLE');
    $robots = $indexable ? 'index,follow' : 'noindex,nofollow';
    $description = (string)($opts['description'] ?? '');
    $path = (string)($opts['path'] ?? '');
    $draft = $opts['draft'] ?? !$indexable;
?>
<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="<?= $robots ?>"><title><?= html($title) ?> | Colibly</title><?php if ($description !== ''): ?><meta name="description" content="<?= html($description) ?>"><?php endif; ?><?php if ($path !== ''): ?><link rel="canonical" href="<?= html(SITE_URL . $path) ?>"><?php endif; ?><link rel="icon" href="/assets/icon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/site.css"></head><body><a class="skip" href="#contenido-principal">Saltar al contenido principal</a><header class="site-header"><div class="container header-inner"><a class="brand" href="/"><img src="/assets/icon.svg" width="36" height="36" alt=""><span>Colibly</span></a><nav class="header-nav" aria-label="Secciones"><a href="/precios">Precios</a><a href="/contacto">Contacto</a></nav><a class="login" href="<?= html(APP_URL) ?>/login">Entrar</a><a class="button button-primary header-cta" href="<?= html(APP_URL) ?>/register">Prueba 30 días gratis</a></div></header><main id="contenido-principal" class="container legal"><?php if ($draft): ?><div class="legal-note"><strong>Versión provisional.</strong> Este texto se mantendrá actualizado y será reemplazado por la versión revisada por un profesional legal.</div><?php endif; ?><h1><?= html($title) ?></h1><?php if ($draft): ?><p>Última actualización: 4 de octubre de 2026</p><?php endif; ?>
<?php }
function legal_footer(): void { ?>
</main><footer class="footer"><div class="container footer-main"><div><a class="brand" href="/"><img src="/assets/icon.svg" width="32" height="32" alt=""><span>Colibly</span></a><p>Conversaciones que avanzan contigo.</p></div><nav aria-label="Enlaces del pie de página"><a href="mailto:contacto@colibly.com">contacto@colibly.com</a><a href="/precios">Precios</a><a href="/contacto">Contacto y soporte</a><a href="/eliminar-datos">Eliminar mis datos</a><a href="/terminos">Términos</a><a href="/privacidad">Privacidad</a><a href="/privacidad#cookies">Cookies</a></nav></div></footer></body></html>
<?php }
