<?php
// GENERADO por scripts/gen-cpanel-pricing.mjs desde lib/billing/plans.ts y
// lib/billing/plan-features.ts. NO editar a mano: cambia plans.ts y vuelve a
// correr `node scripts/gen-cpanel-pricing.mjs` (un test falla si divergen).
const COLIBLY_TRIAL_DAYS = 30;
const COLIBLY_TRIAL_MAX_SEATS = 3;
const COLIBLY_GRACE_DAYS = 7;
const COLIBLY_PRICE_CURRENCY = 'MXN';
const COLIBLY_PRICE_UNIT = 'MXN por ejecutivo al mes';
const COLIBLY_PRICE_TAX_NOTE = '';
const COLIBLY_MIN_PRICE_LABEL = '$149';
const COLIBLY_PRICES_SENTENCE = 'Básico: $149 MXN por ejecutivo al mes; Pro: $299 MXN por ejecutivo al mes';
const COLIBLY_TRIAL_AI_CREDITS_PER_SEAT = '1,000';
const COLIBLY_COEXISTENCE_PITCH = 'Cada ejecutivo conecta su propio WhatsApp y lo sigue usando en su celular (Coexistencia).';
const COLIBLY_META_FEES_NOTE = 'Meta cobra aparte algunos mensajes de WhatsApp según su categoría y destino; ese cargo lo paga el cliente directamente a Meta y no forma parte de la suscripción.';
const COLIBLY_PLANS = [
  ['id' => 'BASIC', 'name' => 'Básico', 'price' => 149, 'price_label' => '$149', 'tagline' => 'Para equipos que empiezan a vender por WhatsApp', 'features' => ['1 número de WhatsApp por ejecutivo, con Coexistencia', '1,000 contactos por ejecutivo', '300 créditos de IA al mes por ejecutivo', '5 automatizaciones activas', '1 canal adicional (Telegram, Messenger o Instagram) por habilitación', 'Chat web disponible por habilitación'], 'missing' => ['API y webhooks'], 'featured' => false],
  ['id' => 'PRO', 'name' => 'Pro', 'price' => 299, 'price_label' => '$299', 'tagline' => 'Para equipos que automatizan e integran', 'features' => ['1 número de WhatsApp por ejecutivo, con Coexistencia', '5,000 contactos por ejecutivo', '1,000 créditos de IA al mes por ejecutivo', 'Automatizaciones ilimitadas', '3 canales adicionales (Telegram, Messenger o Instagram) por habilitación', 'Chat web disponible por habilitación', 'API y webhooks'], 'missing' => [], 'featured' => true],
];
