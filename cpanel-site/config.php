<?php
declare(strict_types=1);

const CONTACT_EMAIL = 'contacto@colibly.com';
const FROM_EMAIL = 'contacto@colibly.com';
// Configurable con la variable de entorno COLIBLY_APP_URL (p. ej. SetEnv en .htaccess o php -S local).
// Por defecto apunta a producción.
const APP_URL_DEFAULT = 'https://app.colibly.com';
define('APP_URL', rtrim((string)(getenv('COLIBLY_APP_URL') ?: APP_URL_DEFAULT), '/'));
const SITE_URL = 'https://colibly.com';

function start_site_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_set_cookie_params([
        'httponly' => true,
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'samesite' => 'Lax',
        'path' => '/',
    ]);
    session_start();
}

function html(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
