/* Suivi d'audience du site — GoatCounter (sans cookie, sans donnée personnelle).
   Chargé par toutes les pages publiques. Compte les pages vues et les clics utiles :
   commandes (boutique SumUp), téléphone, e-mail, itinéraire, réseaux sociaux, partages.

   Le code du site est le sous-domaine choisi à la création du compte goatcounter.com
   (https://<code>.goatcounter.com). C'est le seul réglage à adapter. */
(function () {
  var CODE_SITE = 'domainedesainteanne';
  var ENDPOINT = 'https://' + CODE_SITE + '.goatcounter.com/count';

  // Nom de l'événement selon le lien cliqué, ou null si le lien n'est pas suivi.
  function evenement(a) {
    var h = (a.getAttribute('href') || '').toLowerCase();
    if (h.indexOf('tel:') === 0) return 'telephone';
    if (h.indexOf('mailto:') === 0) return 'email';
    if (h.indexOf('sumupstore.com') !== -1) {
      var m = h.match(/\/article\/(?:bouteille-)?([a-z0-9-]+)/);
      return m ? 'commander-' + m[1] : 'commander-boutique';
    }
    if (h.indexOf('facebook.com/sharer') !== -1) return 'partage-facebook';
    if (h.indexOf('wa.me/') !== -1 || h.indexOf('whatsapp.com') !== -1) return 'partage-whatsapp';
    if (h.indexOf('maps.app.goo.gl') !== -1 || h.indexOf('goo.gl/maps') !== -1) return 'fiche-google';
    if (h.indexOf('google.com/maps') !== -1) return 'itineraire';
    if (h.indexOf('instagram.com') !== -1) return 'instagram';
    if (h.indexOf('facebook.com') !== -1) return 'facebook';
    return null;
  }

  // Libellé lisible : texte du lien (ou aria-label) + page d'origine.
  function libelle(a) {
    var texte = (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim();
    return (texte || a.getAttribute('href')).slice(0, 80) + ' · ' + location.pathname;
  }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var nom = evenement(a);
    if (!nom || !window.goatcounter || typeof window.goatcounter.count !== 'function') return;
    window.goatcounter.count({ path: nom, title: libelle(a), event: true });
  });

  // Réglages lus par count.js : point d'envoi, pas de comptage en local.
  window.goatcounter = { endpoint: ENDPOINT, allow_local: false, no_events: true };
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.setAttribute('data-goatcounter', ENDPOINT);
  document.head.appendChild(s);
})();
