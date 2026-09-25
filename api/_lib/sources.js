// Lecture des deux sources de la rubrique Actualités :
//  - la base centrale des articles, par le point d'accès `site-articles` et le secret du site
//    (le client est déduit du secret : aucun identifiant client côté site) ;
//  - la base du domaine : actualités publiées depuis admin.html.
// Le site n'écrit jamais dans la base centrale : pour modifier un article, l'admin demande un
// lien de modification (op=edit_link) et le client corrige sur la page de validation du socle.

const { endpointSource, memorySource, EMPTY_SOURCE } = require('@hdf/blog-core');

// Base du domaine : ces valeurs sont déjà publiques dans le code du site (clé anon).
const SITE_URL = process.env.SITE_SUPABASE_URL || 'https://ksifjyshjhjdsiinycci.supabase.co';
const SITE_KEY = process.env.SITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzaWZqeXNoamhqZHNpaW55Y2NpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0Mjc5NTQsImV4cCI6MjA5NTAwMzk1NH0.pLXvzDImEOiTawDbEFv9_cXOgy_rTlcl6jJEf7P4kXc';

class SourceError extends Error {}

async function getJson(url, key) {
  let res;
  try {
    res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    throw new SourceError(`${new URL(url).host} injoignable : ${e.message}`);
  }
  if (!res.ok) throw new SourceError(`${new URL(url).host} a répondu ${res.status}`);
  return res.json();
}

// ---------- Base centrale ----------

const mock = () => process.env.ARTICLES_MOCK === '1';
const endpointConfigured = () => Boolean(process.env.ARTICLES_ENDPOINT && process.env.ARTICLES_SITE_SECRET);

let source;
function central() {
  if (source) return source;
  if (mock()) {
    source = memorySource(require('./mock-articles'));
  } else if (endpointConfigured()) {
    source = endpointSource({ endpoint: process.env.ARTICLES_ENDPOINT, secret: process.env.ARTICLES_SITE_SECRET, timeoutMs: 8000 });
  } else {
    // Base centrale pas encore branchée : la rubrique affiche seulement les actualités.
    source = EMPTY_SOURCE;
  }
  return source;
}

// Les erreurs du point d'accès (secret refusé, base indisponible) deviennent des SourceError :
// la fonction répond alors 503 et le CDN garde la dernière bonne version.
async function guard(promise) {
  try {
    return await promise;
  } catch (e) {
    throw new SourceError(`articles centraux : ${e.message}`);
  }
}

// Articles publiés (sans le corps). lang absent = toutes langues (sitemap).
async function loadArticles(lang) {
  return guard(lang ? central().list(lang) : central().listAll());
}

// Article complet par slug :
//   { kind: 'article', article, translations } | { kind: 'moved', slug } | { kind: 'none' }
async function resolveArticle(lang, slug) {
  return guard(central().resolve(lang, slug));
}

// Lien de modification d'un article publié (page de validation du socle, valable 24 h).
// Renvoie { status, body } tels que le point d'accès les donne : { url, expires_at, title } en 200,
// { error } sinon. Le lien contient un jeton : ni cache, ni journal, ni stockage.
async function editLink(lang, slug) {
  if (mock()) {
    return { status: 200, body: { url: 'https://validation-articles-hdf.netlify.app/#t=essai-articles-fictifs', expires_at: new Date(Date.now() + 864e5).toISOString(), title: slug } };
  }
  if (!endpointConfigured()) return { status: 403, body: { error: 'forbidden' } };
  let res;
  try {
    res = await fetch(`${process.env.ARTICLES_ENDPOINT.replace(/\/+$/, '')}?op=edit_link`, {
      method: 'POST',
      headers: { 'X-Site-Secret': process.env.ARTICLES_SITE_SECRET, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ lang, slug }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { status: 500, body: { error: 'unavailable' } };
  }
  const body = await res.json().catch(() => ({ error: 'unavailable' }));
  return { status: res.status, body };
}

async function fetchActualites() {
  return getJson(
    `${SITE_URL}/rest/v1/actualites_sainte_anne?select=id,created_at,date,titre,sous_titre,texte,lien_url,lien_label,images,image_url&order=date.desc`,
    SITE_KEY,
  );
}

// Utilisateur connecté à l'admin (jeton de session Supabase du site), ou null.
async function adminUser(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${SITE_URL}/auth/v1/user`, {
      headers: { apikey: SITE_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

module.exports = {
  loadArticles, resolveArticle, editLink, fetchActualites, adminUser, SourceError,
  _reset: () => { source = undefined; },
};
