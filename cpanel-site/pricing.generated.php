<?php
// GENERADO por scripts/gen-cpanel-pricing.mjs desde lib/billing/plans.ts y
// lib/billing/plan-features.ts. NO editar a mano: cambia plans.ts y vuelve a
// correr `node scripts/gen-cpanel-pricing.mjs` (un test falla si divergen).
const COLIBLY_TRIAL_DAYS = 14;
const COLIBLY_TRIAL_MAX_SEATS = 3;
const COLIBLY_GRACE_DAYS = 7;
const COLIBLY_PRICE_CURRENCY = 'MXN';
const COLIBLY_PRICE_UNIT = 'MXN por usuario al mes';
const COLIBLY_PRICE_TAX_NOTE = '';
const COLIBLY_MIN_PRICE_LABEL = '$59';
const COLIBLY_PRICES_SENTENCE = 'Básico: $59 MXN por usuario al mes; Avanzado: $89 MXN por usuario al mes; Pro: $149 MXN por usuario al mes';
const COLIBLY_TRIAL_AI_CREDITS = '6,750';
const COLIBLY_TRIAL_CONTACTS = '150,000';
const COLIBLY_TRIAL_POOL_TEXT = 'los límites de ese plan, incluidos contactos, leads activos y créditos de IA';
const COLIBLY_COEXISTENCE_PITCH = 'Cada ejecutivo conecta su propio WhatsApp y lo sigue usando en su celular (Coexistencia).';
const COLIBLY_META_FEES_NOTE = 'Meta cobra aparte algunos mensajes de WhatsApp según su categoría y destino; ese cargo lo paga el cliente directamente a Meta y no forma parte de la suscripción.';
const COLIBLY_PRICE_CURRENCY_NOTE = 'Precios en MXN.';
const COLIBLY_PRICING_FOOTNOTE = 'Precios en MXN, por usuario al mes. Los cargos de Meta por mensajes de WhatsApp se pagan aparte, directamente a Meta.';
const COLIBLY_PLANS = [
  ['id' => 'ESSENTIAL', 'name' => 'Básico', 'price' => 59, 'price_label' => '$59', 'tagline' => 'Para equipos pequeños que buscan funciones de IA básicas', 'features' => ['1 número de WhatsApp incluido y 1 más por cada usuario adicional, con Coexistencia', '1 cuenta de Instagram incluida y 1 más por cada usuario adicional', 'Telegram, Messenger y chat web', '12,500 contactos por usuario', '2,500 leads activos por usuario', '750 créditos de IA al mes por usuario', 'API', '50 embudos', '100 campos personalizados'], 'missing' => ['Automatizaciones', 'Bots que responden solos', 'Difusiones de WhatsApp', 'Calificación de leads', 'Webhooks', 'Agentes de IA'], 'featured' => false, 'badge' => ''],
  ['id' => 'BUSINESS', 'name' => 'Avanzado', 'price' => 89, 'price_label' => '$89', 'tagline' => 'Para equipos en desarrollo que buscan automatizar con IA', 'features' => ['3 números de WhatsApp incluidos y 1 más por cada usuario adicional, con Coexistencia', '3 cuentas de Instagram incluidas y 1 más por cada usuario adicional', 'Telegram, Messenger y chat web', '25,000 contactos por usuario', '5,000 leads activos por usuario', '1,250 créditos de IA al mes por usuario', 'Automatizaciones sin tope', 'Bots que responden solos', 'Difusiones de WhatsApp', 'API', 'Webhooks', '50 embudos', '200 campos personalizados', 'Hasta 3 agentes de IA'], 'missing' => ['Calificación de leads'], 'featured' => false, 'badge' => ''],
  ['id' => 'PRO', 'name' => 'Pro', 'price' => 149, 'price_label' => '$149', 'tagline' => 'Para equipos consolidados que implementan IA avanzada', 'features' => ['números de WhatsApp sin tope, con Coexistencia', 'cuentas de Instagram sin tope', 'Telegram, Messenger y chat web', '50,000 contactos por usuario', '10,000 leads activos por usuario', '2,250 créditos de IA al mes por usuario', 'Automatizaciones sin tope', 'Bots que responden solos', 'Difusiones de WhatsApp', 'Calificación de leads', 'API', 'Webhooks', '50 embudos', '400 campos personalizados', 'Hasta 50 agentes de IA'], 'missing' => [], 'featured' => true, 'badge' => 'Más popular'],
];
