#!/usr/bin/env node
/* Rapport hebdomadaire de fréquentation du site, à partir de l'API GoatCounter.

   Usage : node outils/rapport-hebdo.js [--debut AAAA-MM-JJ] [--fin AAAA-MM-JJ] [--json]
   Sans option : la dernière semaine complète (lundi → dimanche), comparée à la précédente.
   Sortie : le texte du mail (ou, avec --json, { sujet, texte }).

   Le jeton d'API (permission « lire les statistiques ») est lu dans
   ~/.config/goatcounter/domainedesainteanne.token — jamais dans le dépôt. */

const fs = require('fs');
const os = require('os');
const path = require('path');

const SITE = 'https://domainedesainteanne.goatcounter.com';
const FICHIER_JETON = path.join(os.homedir(), '.config', 'goatcounter', 'domainedesainteanne.token');
const FUSEAU = 'Europe/Paris';

// ---------- Arguments ----------
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf('--' + n); return i === -1 ? null : args[i + 1]; };
const JSON_OUT = args.includes('--json');

// ---------- Dates (en heure de Paris) ----------
const jourISO = d => d.toLocaleDateString('sv-SE', { timeZone: FUSEAU }); // AAAA-MM-JJ
const fmtJour = s => new Date(s + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const plusJours = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return jourISO(d); };

function dernierLundi() {
  const aujourdhui = jourISO(new Date());
  const js = new Date(aujourdhui + 'T12:00:00Z').getUTCDay(); // 0 = dimanche
  const reculLundiCourant = (js + 6) % 7;
  return plusJours(aujourdhui, -reculLundiCourant - 7); // lundi de la semaine précédente
}

const debut = opt('debut') || dernierLundi();
const fin = opt('fin') || plusJours(debut, 6);
const debutPrec = plusJours(debut, -7);
const finPrec = plusJours(debut, -1);

// Bornes envoyées à l'API : début 00:00 et fin 23:59:59, heure de Paris → UTC.
function decalageParis(jour) {
  const d = new Date(jour + 'T12:00:00Z');
  const h = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: FUSEAU, hour: 'numeric', hourCycle: 'h23' }).format(d), 10);
  return h - 12; // +1 ou +2 selon l'heure d'été
}
const borne = (jour, finJournee) => {
  const d = new Date(jour + (finJournee ? 'T23:59:59Z' : 'T00:00:00Z'));
  d.setUTCHours(d.getUTCHours() - decalageParis(jour));
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); // l'API refuse les millisecondes
};

// ---------- Appels API ----------
let jeton;
try { jeton = fs.readFileSync(FICHIER_JETON, 'utf8').trim(); } catch (e) { jeton = ''; }
if (!jeton) {
  console.error(`Jeton GoatCounter introuvable : ${FICHIER_JETON}\nCréez-le sur ${SITE}/user/api puis enregistrez-le dans ce fichier.`);
  process.exit(2);
}

async function api(chemin, params = {}) {
  const url = new URL(SITE + '/api/v0/' + chemin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Limite de l'API : 4 requêtes par seconde → appels espacés, nouvelle tentative sur 429.
  for (let essai = 1; ; essai++) {
    await new Promise(res => setTimeout(res, 300));
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' } });
    if (r.status === 429 && essai < 5) { await new Promise(res => setTimeout(res, 1000 * essai)); continue; }
    if (!r.ok) throw new Error(`API GoatCounter ${r.status} sur ${chemin} : ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
}

const periode = (d, f) => ({ start: borne(d, false), end: borne(f, true) });

// ---------- Libellés ----------
function libelleEvenement(nom) {
  if (nom === 'commander-boutique') return 'Commander → boutique (page d’accueil de la boutique)';
  if (nom.startsWith('commander-')) return 'Commander → ' + nom.slice(10).replace(/-/g, ' ');
  return {
    telephone: 'Appel téléphone', email: 'E-mail', 'fiche-google': 'Fiche Google (avis / itinéraire)',
    instagram: 'Instagram', facebook: 'Facebook', 'partage-facebook': 'Partage d’une actualité sur Facebook',
    'partage-whatsapp': 'Partage d’une actualité sur WhatsApp', itineraire: 'Itinéraire',
  }[nom] || nom;
}
function libellePage(p) {
  if (p === '/' || p === '/index.html') return 'Accueil';
  if (p === '/en' || p === '/en/' || p === '/en/index.html') return 'Accueil (anglais)';
  if (p === '/liens' || p === '/liens/') return 'Page flyers (QR code)';
  if (p === '/galerie.html') return 'Galerie';
  if (p === '/mentions-legales.html') return 'Mentions légales';
  if (p === '/actualites') return 'Actualités';
  if (p === '/en/news') return 'Actualités (anglais)';
  if (p.startsWith('/actualites/')) return 'Actualité : ' + p.slice(12).replace(/-[0-9a-f]{8}$/, '').replace(/-/g, ' ');
  if (p.startsWith('/en/news/')) return 'Actualité (anglais) : ' + p.slice(9).replace(/-[0-9a-f]{8}$/, '').replace(/-/g, ' ');
  return p;
}
const evolution = (n, prec) => {
  if (!prec) return n ? ' (nouveau)' : '';
  const pct = Math.round(((n - prec) / prec) * 100);
  return ` (${pct >= 0 ? '+' : ''}${pct} % vs semaine précédente : ${prec})`;
};
const ligne = (lib, n) => `  • ${lib} : ${n}`;

// ---------- Rapport ----------
(async () => {
  const tot = await api('stats/total', periode(debut, fin));
  const totPrec = await api('stats/total', periode(debutPrec, finPrec));
  const hits = await api('stats/hits', { ...periode(debut, fin), limit: 100 });
  const refs = await api('stats/toprefs', { ...periode(debut, fin), limit: 8 });
  const pays = await api('stats/locations', { ...periode(debut, fin), limit: 5 });

  const pages = hits.hits.filter(h => !h.event).sort((a, b) => b.count - a.count);
  const evenements = hits.hits.filter(h => h.event).sort((a, b) => b.count - a.count);
  const visites = tot.total;
  const visitesPrec = totPrec.total;
  const clics = evenements.reduce((s, e) => s + e.count, 0);
  const commandes = evenements.filter(e => e.path.startsWith('commander-')).reduce((s, e) => s + e.count, 0);
  const flyers = pages.find(p => p.path === '/liens' || p.path === '/liens/');

  const sujet = `Site Domaine de Sainte Anne — fréquentation du ${fmtJour(debut)} au ${fmtJour(fin)}`;
  const L = [];
  L.push(`Bonjour,`);
  L.push(``);
  L.push(`Voici la fréquentation du site domainedesainteanne.fr pour la semaine du ${fmtJour(debut)} au ${fmtJour(fin)}.`);
  L.push(``);
  L.push(`EN BREF`);
  L.push(ligne('Visites', `${visites}${evolution(visites, visitesPrec)}`));
  L.push(ligne('Clics utiles (commande, téléphone, e-mail, réseaux…)', clics));
  L.push(ligne('dont clics « Commander » vers la boutique', commandes));
  if (flyers) L.push(ligne('Visites venues des flyers (QR code)', flyers.count));
  L.push(``);
  L.push(`PAGES LES PLUS VUES`);
  if (!pages.length) L.push('  (aucune visite enregistrée)');
  pages.slice(0, 8).forEach(p => L.push(ligne(libellePage(p.path), p.count)));
  L.push(``);
  L.push(`CLICS UTILES`);
  if (!evenements.length) L.push('  (aucun clic enregistré)');
  evenements.forEach(e => L.push(ligne(libelleEvenement(e.path), e.count)));
  L.push(``);
  L.push(`D’OÙ VIENNENT LES VISITEURS`);
  const refsUtiles = refs.stats.filter(r => r.count > 0);
  if (!refsUtiles.length) L.push('  (aucune provenance enregistrée)');
  refsUtiles.forEach(r => L.push(ligne(r.name || 'Accès direct ou inconnu', r.count)));
  L.push(``);
  L.push(`PAYS`);
  const paysUtiles = pays.stats.filter(p => p.count > 0);
  if (!paysUtiles.length) L.push('  (aucun pays enregistré)');
  paysUtiles.forEach(p => L.push(ligne(p.name, p.count)));
  L.push(``);
  L.push(`Les chiffres viennent de GoatCounter, l’outil de mesure du site (sans cookie, anonyme). Une « visite » est un passage d’une personne sur le site, quel que soit le nombre de pages vues. Tableau de bord complet : ${SITE}`);
  L.push(``);
  L.push(`Bonne semaine,`);
  L.push(`Henri`);

  const texte = L.join('\n');
  if (JSON_OUT) console.log(JSON.stringify({ sujet, texte, debut, fin }, null, 2));
  else console.log('Sujet : ' + sujet + '\n\n' + texte);
})().catch(e => { console.error(e.message); process.exit(1); });
