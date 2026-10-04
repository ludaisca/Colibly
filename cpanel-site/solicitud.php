<?php
declare(strict_types=1);
require __DIR__ . '/config.php';
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

function reply(int $status, string $message = '', bool $success = false): never {
    http_response_code($status);
    echo json_encode($success ? ['success' => true] : ['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(405, 'Método no permitido.');
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 8192) reply(413, 'La solicitud es demasiado grande.');
start_site_session();
if (!isset($_SESSION['beta_csrf']) || !hash_equals($_SESSION['beta_csrf'], (string)($_POST['csrf'] ?? ''))) reply(403, 'Actualiza la página e inténtalo de nuevo.');

$name = trim((string)($_POST['name'] ?? ''));
$business = trim((string)($_POST['businessName'] ?? ''));
$email = trim((string)($_POST['email'] ?? ''));
$phone = trim((string)($_POST['phone'] ?? ''));
$description = trim((string)($_POST['description'] ?? ''));
$website = trim((string)($_POST['website'] ?? ''));
if ($website !== '') reply(201, '', true);
if (mb_strlen($name) < 2 || mb_strlen($name) > 80 || mb_strlen($business) < 2 || mb_strlen($business) > 100) reply(400, 'Revisa tu nombre y el nombre del negocio.');
if (mb_strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strpbrk($email, "\r\n") !== false) reply(400, 'Escribe un correo válido.');
// Cuenta dígitos, no caracteres (igual que lib/beta-application.ts): "(55) 12" mide 8 pero no es un teléfono.
$phoneDigits = (int)preg_match_all('/\d/', $phone);
if (mb_strlen($phone) > 30 || !preg_match('/^[+()0-9 .-]+$/', $phone) || $phoneDigits < 8 || $phoneDigits > 15) reply(400, 'Revisa el número de WhatsApp: incluye la lada, por ejemplo 55 1234 5678.');
if (mb_strlen($description) > 400) reply(400, 'Usa 400 caracteres o menos en la descripción.');
if (($_POST['privacyAccepted'] ?? '') !== '1') reply(400, 'Marca la casilla de aceptación para enviar tu solicitud.');

// Límite compartido entre sesiones: 3 solicitudes por IP y hora. Los archivos
// van al directorio temporal del servidor, nunca al directorio público.
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
$key = hash('sha256', $ip);
$path = sys_get_temp_dir() . '/colibly-beta-' . $key . '.json';
$lock = fopen($path, 'c+');
if (!$lock || !flock($lock, LOCK_EX)) reply(503, 'Inténtalo más tarde o escríbenos por correo.');
$raw = stream_get_contents($lock);
$times = json_decode($raw ?: '[]', true);
if (!is_array($times)) $times = [];
$now = time();
$times = array_values(array_filter($times, static fn($time): bool => is_int($time) && $time > $now - 3600));
if (count($times) >= 3) { flock($lock, LOCK_UN); fclose($lock); reply(429, 'Recibimos demasiadas solicitudes. Intenta más tarde.'); }
$times[] = $now;
rewind($lock); ftruncate($lock, 0); fwrite($lock, json_encode($times)); fflush($lock); flock($lock, LOCK_UN); fclose($lock);

$subject = 'Solicitud de beta · ' . preg_replace('/[\r\n]+/', ' ', $business);
$body = "Nueva solicitud para la beta de Colibly\n\nNombre: $name\nNegocio: $business\nCorreo: $email\nWhatsApp: $phone\nCómo atienden hoy: " . ($description ?: 'No indicado') . "\n";
$headers = ['From' => FROM_EMAIL, 'Reply-To' => $email, 'Content-Type' => 'text/plain; charset=UTF-8', 'X-Mailer' => 'Colibly Beta'];
if (!mail(CONTACT_EMAIL, $subject, $body, $headers)) {
    error_log('[colibly-beta] Falló mail() para solicitud beta');
    reply(503, 'No pudimos enviar tu solicitud. Inténtalo más tarde o escríbenos por correo.');
}
$_SESSION['beta_csrf'] = bin2hex(random_bytes(24));
reply(201, '', true);
