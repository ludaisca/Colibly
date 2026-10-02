<?php
declare(strict_types=1);

const CONTACT_EMAIL = 'contacto@colibly.com';
const FROM_EMAIL = 'contacto@colibly.com';
const APP_URL = 'https://app.colibly.com';

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
