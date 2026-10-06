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
$phoneInput = trim((string)($_POST['phone'] ?? ''));
$phoneCountryIso = strtoupper(trim((string)($_POST['phoneCountry'] ?? 'MX')));
$description = trim((string)($_POST['description'] ?? ''));
$website = trim((string)($_POST['website'] ?? ''));
if ($website !== '') reply(201, '', true);
if (mb_strlen($name) < 2 || mb_strlen($name) > 80 || mb_strlen($business) < 2 || mb_strlen($business) > 100) reply(400, 'Revisa tu nombre y el nombre del negocio.');
if (mb_strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strpbrk($email, "\r\n") !== false) reply(400, 'Escribe un correo válido.');
// El formulario enriquece la captura con un país; se normaliza aquí para mantener
// el correo de solicitud en E.164 incluso sin JavaScript o con borradores antiguos.
$countryData = json_decode((string)file_get_contents(__DIR__ . '/assets/phone-countries.json'), true);
$phoneCountry = null;
foreach (is_array($countryData) ? $countryData : [] as $country) {
    if (($country['iso'] ?? '') === $phoneCountryIso) { $phoneCountry = $country; break; }
}
if (mb_strlen($phoneInput) > 30 || !preg_match('/^(?:\+|00)?[()0-9 .-]+$/', $phoneInput)) reply(400, 'Revisa el número de WhatsApp.');
if (str_starts_with($phoneInput, '+') || str_starts_with($phoneInput, '00')) {
    $international = preg_replace('/\D/', '', $phoneInput) ?? '';
    if (str_starts_with($phoneInput, '00')) $international = substr($international, 2);
    $phone = '+' . $international;
    $matches = array_values(array_filter(is_array($countryData) ? $countryData : [], static fn(array $country): bool => str_starts_with($international, (string)($country['dial'] ?? ''))));
    usort($matches, static fn(array $a, array $b): int => strlen((string)$b['dial']) <=> strlen((string)$a['dial']));
    $phoneCountry = $matches[0] ?? null;
    if (count($matches) > 1 && strlen((string)$matches[0]['dial']) === strlen((string)$matches[1]['dial'])) {
        $nationalForArea = substr($international, strlen((string)$matches[0]['dial']));
        foreach ($matches as $match) {
            if (!empty($match['areaCodes']) && array_filter($match['areaCodes'], static fn(string $area): bool => str_starts_with($nationalForArea, $area))) { $phoneCountry = $match; break; }
        }
    }
    if (!$phoneCountry) reply(400, 'Elige un país válido para tu número.');
    $national = substr($international, strlen((string)$phoneCountry['dial']));
} else {
    if (!$phoneCountry) reply(400, 'Elige un país válido para tu número.');
    $national = preg_replace('/\D/', '', $phoneInput) ?? '';
    $trunk = (string)($phoneCountry['trunk'] ?? '');
    $lengths = array_map(static fn(string $pattern): int => substr_count($pattern, '#'), $phoneCountry['patterns'] ?? []);
    if ($trunk !== '' && str_starts_with($national, $trunk) && $lengths && strlen($national) - strlen($trunk) >= min($lengths)) {
        $national = substr($national, strlen($trunk));
    }
    $phone = '+' . $phoneCountry['dial'] . $national;
}
$phoneDigits = (int)preg_match_all('/\d/', $phone);
if (!preg_match('/^\+[1-9]\d{7,14}$/', $phone) || $phoneDigits < 8 || $phoneDigits > 15) reply(400, 'Revisa el número de WhatsApp: incluye el país y la lada.');
$validLengths = array_map(static fn(string $pattern): int => substr_count($pattern, '#'), $phoneCountry['patterns'] ?? []);
if (!$validLengths || !in_array(strlen($national), $validLengths, true)) reply(400, 'Revisa la cantidad de dígitos para el país seleccionado.');
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
