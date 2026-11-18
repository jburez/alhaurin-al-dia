/*
 * Gestión del consentimiento y carga condicionada de anuncios.
 *
 * PREPARADO PERO SIN PROVEEDOR: AdSense en el Espacio Económico Europeo exige
 * un CMP certificado por Google compatible con TCF v2.2. Cuando se elija uno:
 *
 *   1. Pegar su script en el <head> de todas las páginas, en el hueco marcado
 *      con el comentario «CMP:» (scripts/lib/layout.js -> CONSENT_HEAD_HTML;
 *      scripts/sync-site-chrome.js lo propaga a todo el HTML publicado).
 *   2. Rellenar CONFIG.adSlots con los IDs de bloque de AdSense por ubicación.
 *
 * Comportamiento:
 *   - Sin CMP (window.__tcfapi no existe): NO se carga AdSense. Los huecos de
 *     publicidad mantienen su altura reservada, así que no hay saltos (CLS).
 *   - Con CMP TCF: se espera a que el usuario decida (tcloaded o
 *     useractioncomplete) y solo entonces se carga adsbygoogle.js. AdSense lee
 *     la cadena TC y decide si sirve anuncios personalizados, no personalizados
 *     o ninguno.
 *   - AlhConsent.whenAllowed(fn): para futuros scripts de analítica con cookies
 *     (la actual, Cloudflare Web Analytics, no usa cookies y no lo necesita).
 *   - [data-consent-open] (enlace «Configurar cookies») reabre el CMP.
 */
(function () {
  var CONFIG = {
    adClient: 'ca-pub-3892603819928798',
    // Ubicación (data-ad-ubicacion) -> ID de bloque de AdSense. Vacío = sin anuncio.
    adSlots: {
      'portada': '',
      'guia-mitad': '',
      'evento': '',
      'agenda': '',
      'fin-de-semana': '',
      'farmacia': '',
      'avisos': '',
      'comercios': '',
    },
    tcfWaitMs: 4000,
  };

  var adsLoaded = false;
  var allowedCallbacks = [];
  var consentReady = false;

  function fillSlots() {
    var slots = document.querySelectorAll('[data-ad-ubicacion]');
    Array.prototype.forEach.call(slots, function (slot) {
      var id = CONFIG.adSlots[slot.getAttribute('data-ad-ubicacion')] || '';
      if (!id || slot.querySelector('ins.adsbygoogle')) return;
      var ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.setAttribute('data-ad-client', CONFIG.adClient);
      ins.setAttribute('data-ad-slot', id);
      ins.setAttribute('data-ad-format', 'auto');
      ins.setAttribute('data-full-width-responsive', 'true');
      slot.appendChild(ins);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* noop */ }
    });
  }

  function loadAds() {
    if (adsLoaded) return;
    adsLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + CONFIG.adClient;
    s.onload = fillSlots;
    document.head.appendChild(s);
  }

  function markReady() {
    if (consentReady) return;
    consentReady = true;
    loadAds();
    allowedCallbacks.splice(0).forEach(function (fn) { try { fn(); } catch (e) { /* noop */ } });
  }

  function listenTcf() {
    if (typeof window.__tcfapi !== 'function') return false;
    window.__tcfapi('addEventListener', 2, function (tcData, success) {
      if (success && tcData && (tcData.eventStatus === 'tcloaded' || tcData.eventStatus === 'useractioncomplete')) {
        markReady();
      }
    });
    return true;
  }

  function openConsent() {
    if (window.googlefc && window.googlefc.callbackQueue) {
      window.googlefc.callbackQueue.push(window.googlefc.showRevocationMessage);
      return;
    }
    if (typeof window.__tcfapi === 'function') {
      window.__tcfapi('displayConsentUi', 2, function () {});
      return;
    }
    window.location.href = '/cookies/#configurar';
  }

  window.AlhConsent = {
    open: openConsent,
    whenAllowed: function (fn) { if (consentReady) fn(); else allowedCallbacks.push(fn); },
    config: CONFIG,
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-consent-open]');
    if (!el) return;
    e.preventDefault();
    openConsent();
  });

  // El script del CMP puede tardar en definir __tcfapi: se reintenta un rato.
  if (!listenTcf()) {
    var waited = 0;
    var timer = setInterval(function () {
      waited += 250;
      if (listenTcf() || waited >= CONFIG.tcfWaitMs) clearInterval(timer);
    }, 250);
  }
})();
