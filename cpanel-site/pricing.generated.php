<?php
// GENERADO por scripts/gen-cpanel-pricing.mjs desde lib/billing/plans.ts y
// lib/billing/plan-features.ts. NO editar a mano: cambia plans.ts y vuelve a
// correr `node scripts/gen-cpanel-pricing.mjs` (un test falla si divergen).
const COLIBLY_TRIAL_DAYS = 14;
const COLIBLY_TRIAL_MAX_SEATS = 3;
const COLIBLY_GRACE_DAYS = 7;
const COLIBLY_PRICE_CURRENCY = 'MXN';
const COLIBLY_PRICE_UNIT = 'MXN por ejecutivo al mes';
const COLIBLY_PRICE_TAX_NOTE = '';
const COLIBLY_MIN_PRICE_LABEL = '$99';
const COLIBLY_PRICES_SENTENCE = 'Esencial: $99 MXN por ejecutivo al mes; Negocio: $199 MXN por ejecutivo al mes; Pro: $349 MXN por ejecutivo al mes';
const COLIBLY_TRIAL_AI_CREDITS = '1,000';
const COLIBLY_TRIAL_CONTACTS = '5,000';
const COLIBLY_TRIAL_POOL_TEXT = '5,000 contactos y 1,000 créditos de IA al mes para todo el equipo';
const COLIBLY_COEXISTENCE_PITCH = 'Cada ejecutivo conecta su propio WhatsApp y lo sigue usando en su celular (Coexistencia).';
const COLIBLY_META_FEES_NOTE = 'Meta cobra aparte algunos mensajes de WhatsApp según su categoría y destino; ese cargo lo paga el cliente directamente a Meta y no forma parte de la suscripción.';
const COLIBLY_PRICE_CURRENCY_NOTE = 'Precios en MXN.';
const COLIBLY_PRICING_FOOTNOTE = 'Precios en MXN, por ejecutivo al mes. Los cargos de Meta por mensajes de WhatsApp se pagan aparte, directamente a Meta.';
const COLIBLY_PLANS = [
  ['id' => 'ESSENTIAL', 'name' => 'Esencial', 'price' => 99, 'price_label' => '$99', 'tagline' => 'Para equipos pequeños que atienden por WhatsApp', 'features' => ['1 número de WhatsApp por ejecutivo, con Coexistencia', '500 contactos por ejecutivo', '1 automatización activa', 'Hasta 3 ejecutivos'], 'missing' => ['Bots y asistentes de IA', 'Telegram, Messenger e Instagram', 'Chat web', 'Integración con tus sistemas vía API o webhooks'], 'featured' => false, 'badge' => ''],
  ['id' => 'BUSINESS', 'name' => 'Negocio', 'price' => 199, 'price_label' => '$199', 'tagline' => 'Para equipos que venden en todos sus canales con IA', 'features' => ['1 número de WhatsApp por ejecutivo, con Coexistencia', '2,000 contactos por ejecutivo', '300 créditos de IA al mes por ejecutivo', '5 automatizaciones activas', '1 cuenta de Telegram, de Messenger y de Instagram por ejecutivo, por habilitación', 'Chat web disponible por habilitación'], 'missing' => ['Integración con tus sistemas vía API o webhooks'], 'featured' => false, 'badge' => ''],
  ['id' => 'PRO', 'name' => 'Pro', 'price' => 349, 'price_label' => '$349', 'tagline' => 'Para equipos que automatizan e integran', 'features' => ['1 número de WhatsApp por ejecutivo, con Coexistencia', '5,000 contactos por ejecutivo', '1,000 créditos de IA al mes por ejecutivo', 'Automatizaciones ilimitadas', '1 cuenta de Telegram, de Messenger y de Instagram por ejecutivo, por habilitación', 'Chat web disponible por habilitación', 'Integración con tus sistemas vía API o webhooks'], 'missing' => [], 'featured' => true, 'badge' => 'Más popular'],
];
