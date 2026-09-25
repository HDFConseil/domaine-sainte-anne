// Lecture des deux sources de la rubrique Actualités :
//  - la base centrale des articles, par le point d'accès `site-articles` et le secret du site
//    (le client est déduit du secret : aucun identifiant client côté site) ;
//  - la base du domaine : actualités publiées depuis admin.html + corrections locales des articles.
// Le site ne fait que lire : aucune écriture vers la base centrale.

const { endpointSource, memorySource, EMPTY_SOURCE } = require('@hdf/blog-core');

// Base du domaine : ces valeurs sont déjà publiques dans le code du site (clé anon).
const SITE_URL = process.env.SITE_SUPABASE_URL || 'https://ksifjyshjhjdsiinycci.supabase.co';
const SITE_KEY = process.env.SITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzaWZqeXNoamhqZHNpaW55Y2NpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0Mjc5NTQsImV4cCI6MjA5NTAwMzk1NH0.pLXvzDImEOiTawDbEFv9_cXOgy_rTlcl6jJEf7P4kXc';

// Champs qu'une correction locale peut remplacer (le slug n'en fait pas partie).
// cover_image_url / cover_image_alt remplacent la photo de couverture (role "cover") de l'article.
const CORRECTABLE = [
  'title', 'meta_title', 'meta_description', 'excerpt', 'body_markdown', 'faq',
  'cover_image_url', 'cover_image_alt',
];

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

let source;
function central() {
  if (source) return source;
  if (process.env.ARTICLES_MOCK === '1') {
    source = memorySource(require('./mock-articles'));
  } else if (process.env.ARTICLES_ENDPOINT && process.env.ARTICLES_SITE_SECRET) {
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

// ---------- Corrections locales ----------

async function fetchCorrections() {
  return getJson(`${SITE_URL}/rest/v1/sainte_anne_article_corrections?select=*`, SITE_KEY);
}

async function fetchCorrection(articleId) {
  const rows = await getJson(
    `${SITE_URL}/rest/v1/sainte_anne_article_corrections?select=*&article_id=eq.${encodeURIComponent(articleId)}`,
    SITE_KEY,
  );
  return rows[0];
}

// Applique la correction locale (champ non null = remplace la version centrale).
//  - `stale` : la base centrale a été modifiée après la correction ;
//  - `updated_at` : la plus récente des deux dates, pour que le sitemap et les données
//    structurées signalent aussi à Google une modification faite dans l'admin.
function applyCorrection(article, correction) {
  if (!correction) return { ...article, corrected: false, stale: false };
  const merged = { ...article, corrected: true };
  for (const field of CORRECTABLE) {
    if (field.startsWith('cover_image_')) continue;
    if (correction[field] !== null && correction[field] !== undefined) merged[field] = correction[field];
  }
  if (correction.cover_image_url || correction.cover_image_alt) {
    const images = [...(article.images || [])];
    const i = images.findIndex(img => img.role === 'cover');
    const cover = i >= 0 ? images[i] : { position: 1, role: 'cover', url: '', alt: '' };
    const next = { ...cover };
    if (correction.cover_image_url && correction.cover_image_url !== cover.url) {
      // Photo remplacée dans l'admin : ses dimensions ne sont pas connues.
      next.url = correction.cover_image_url;
      delete next.width;
      delete next.height;
    }
    if (correction.cover_image_alt) next.alt = correction.cover_image_alt;
    if (i >= 0) images[i] = next; else images.unshift(next);
    merged.images = images;
  }
  merged.stale = new Date(article.updated_at) > new Date(correction.base_updated_at);
  if (correction.updated_at && new Date(correction.updated_at) > new Date(article.updated_at)) {
    merged.updated_at = correction.updated_at;
  }
  return merged;
}

// ---------- Lecture pour le rendu ----------

// Articles publiés (sans le corps), corrections appliquées. lang absent = toutes langues (sitemap).
async function loadArticles(lang) {
  const articles = await guard(lang ? central().list(lang) : central().listAll());
  if (!articles.length) return [];
  const corrections = await fetchCorrections();
  const byId = new Map(corrections.map(c => [c.article_id, c]));
  return articles.map(a => applyCorrection(a, byId.get(a.id)));
}

// Article complet par slug, correction appliquée :
//   { kind: 'article', article, translations } | { kind: 'moved', slug } | { kind: 'none' }
async function resolveArticle(lang, slug) {
  const r = await guard(central().resolve(lang, slug));
  if (r.kind !== 'article') return r;
  return { ...r, article: applyCorrection(r.article, await fetchCorrection(r.article.id)) };
}

// Version brute (sans correction), pour l'écran de correction de l'admin.
async function rawList() {
  return guard(central().listAll());
}
async function rawArticle(lang, slug) {
  const r = await guard(central().resolve(lang, slug));
  return r.kind === 'article' ? r.article : null;
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
  loadArticles, resolveArticle, rawList, rawArticle, fetchActualites, adminUser, applyCorrection,
  SourceError, CORRECTABLE,
  _reset: () => { source = undefined; },
};
