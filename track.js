/* Nodra lead tracking: GA4 (gtag) + Microsoft Clarity.
   Events: generate_lead, form_start, form_error, cta_click, demo_link_click,
           email_click, demo_run, section_view.
   Also records first- and last-touch source so every lead email says where the visitor came from. */
(function () {
  var KEY = 'nodra_attr';

  function gtagSafe() { if (typeof window.gtag === 'function') window.gtag.apply(null, arguments); }
  function claritySafe() { if (typeof window.clarity === 'function') window.clarity.apply(null, arguments); }
  function track(name, params) { gtagSafe('event', name, params || {}); claritySafe('event', name); }

  /* ---------- attribution (first touch + last non-direct touch) ---------- */
  var memory = null;
  function readStore() { try { return JSON.parse(localStorage.getItem(KEY)) || memory; } catch (e) { return memory; } }
  function writeStore(v) { memory = v; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }

  var q = new URLSearchParams(location.search);
  var external = document.referrer && document.referrer.indexOf(location.hostname) === -1 ? document.referrer : '';
  var visit = {
    utm_source: q.get('utm_source') || '', utm_medium: q.get('utm_medium') || '',
    utm_campaign: q.get('utm_campaign') || '', utm_content: q.get('utm_content') || '',
    referrer: external, landing_page: location.pathname, ts: new Date().toISOString()
  };
  var store = readStore() || {};
  if (!store.first) store.first = visit;
  if (visit.utm_source || visit.referrer || !store.last) store.last = visit;
  writeStore(store);

  function describe(t) {
    if (!t) return '';
    if (t.utm_source) return t.utm_source + ' / ' + (t.utm_medium || '(none)') + (t.utm_campaign ? ' / ' + t.utm_campaign : '');
    if (t.referrer) { try { return new URL(t.referrer).hostname + ' / referral'; } catch (e) { return t.referrer; } }
    return 'direct';
  }
  function attribution() {
    var s = readStore() || store;
    return {
      first_touch: describe(s.first),
      first_landing_page: (s.first && s.first.landing_page) || '',
      first_seen: (s.first && s.first.ts) || '',
      last_touch: describe(s.last),
      utm_content: (s.last && s.last.utm_content) || '',
      submitted_from: location.pathname
    };
  }
  /* lets you filter Clarity recordings by where the visitor came from */
  claritySafe('set', 'first_touch', describe(store.first));
  claritySafe('set', 'last_touch', describe(store.last));

  /* ---------- helpers ---------- */
  function where(el) {
    if (el.closest('footer')) return 'footer';
    if (el.closest('nav, header')) return 'nav';
    var s = el.closest('section[id]');
    return s ? s.id : 'hero';
  }
  function text(el) { return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60); }
  var page = /demo/.test(location.pathname) ? 'demo' : 'homepage';

  /* ---------- clicks ---------- */
  var demoRan = false;
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (a) {
      var href = a.getAttribute('href');
      if (/#audit$/.test(href)) track('cta_click', { cta_text: text(a), cta_location: where(a), page_type: page });
      else if (/demo\.html/.test(href)) track('demo_link_click', { cta_text: text(a), cta_location: where(a), page_type: page });
      else if (/^mailto:/i.test(href)) track('email_click', { cta_location: where(a), page_type: page });
      return;
    }
    var b = e.target.closest('button');
    if (b && !demoRan && /run the pipeline/i.test(b.textContent)) { demoRan = true; track('demo_run', { page_type: page }); }
  }, true);

  /* ---------- form start (first interaction with the audit form) ---------- */
  var started = false;
  document.addEventListener('focusin', function (e) {
    if (started) return;
    var f = e.target.closest('#audit input, #audit select, #audit textarea');
    if (!f) return;
    started = true;
    track('form_start', { form_location: page, first_field: f.id || f.name || '' });
  });

  /* ---------- key sections seen (50% in view, once each) ---------- */
  if ('IntersectionObserver' in window) {
    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var id = en.target.id;
        if (en.isIntersecting && !seen[id]) { seen[id] = 1; track('section_view', { section: id, page_type: page }); io.unobserve(en.target); }
      });
    }, { threshold: 0.5 });
    ['cases', 'pipeline', 'audit', 'run', 'library'].forEach(function (id) {
      var el = document.getElementById(id); if (el) io.observe(el);
    });
  }

  /* ---------- API used by the form handlers ---------- */
  window.nodraTrack = {
    attribution: attribution,
    lead: function (formLocation, data) {
      var a = attribution();
      track('generate_lead', {
        form_location: formLocation,
        product_category: (data && data.category) || '',
        lead_source: a.last_touch,
        first_touch: a.first_touch
      });
      claritySafe('set', 'lead', 'yes');
      claritySafe('upgrade', 'generate_lead');
    },
    formError: function (formLocation, field) {
      track('form_error', { form_location: formLocation, field: field });
    }
  };
})();
