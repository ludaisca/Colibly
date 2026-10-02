<?php
// Solo para `php -S` en desarrollo: Apache/cPanel aplica .htaccess en producción.
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if ($path === '/terminos' || $path === '/terminos/') { require __DIR__ . '/terminos.php'; return true; }
if ($path === '/privacidad' || $path === '/privacidad/') { require __DIR__ . '/privacidad.php'; return true; }
if ($path === '/config.php' || $path === '/legal-layout.php' || $path === '/preview-router.php') {
    http_response_code(404);
    return true;
}
return false;
