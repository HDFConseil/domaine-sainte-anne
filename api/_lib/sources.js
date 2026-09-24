// Lecture des deux sources de la rubrique Actualités :
//  - la base centrale des articles (vue published_articles, filtrée sur notre client_id) ;
//  - la base du domaine : actualités publiées depuis admin.html + corrections locales des articles.
// Le site ne fait que lire : aucune écriture vers la base centrale.

// Base du domaine : ces valeurs sont déjà publiques dans le code du site (clé anon).
const SITE_URL = process.env.SITE_SUPABASE_URL || 'https://ksifjyshjhjdsiinycci.supabase.co';
const SITE_KEY = process.env.SITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzaWZqeXNoamhqZHNpaW55Y2NpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0Mjc5NTQsImV4cCI6MjA5NTAwMzk1NH0.pLXvzDImEOiTawDbEFv9_cXOgy_rTlcl6jJEf7P4kXc';

const ARTICLE_COLUMNS = [
  'id', 'lang', 'translation_group_id', 'slug', 'previous_slugs', 'title', 'meta_title',
  'meta_description', 'excerpt', 'body_markdown', 'faq', 'category', 'tags',
  'cover_image_url', 'cover_image_alt', 'reading_time_min', 'published_at', 'updated_at',
].join(',');

// Champs qu'une correction locale peut remplacer (le slug n'en fait pas partie).
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

function centralConfigured() {
  return Boolean(process.env.ARTICLES_SUPABASE_URL && process.env.ARTICLES_SUPABASE_ANON_KEY && process.env.ARTICLES_CLIENT_ID);
}

// Articles centraux, bruts (sans corrections).
async function fetchCentralArticles() {
  if (process.env.ARTICLES_MOCK === '1') return require('./mock-articles');
  // Base centrale pas encore branchée : la rubrique affiche seulement les actualités.
  if (!centralConfigured()) return [];
  const base = process.env.ARTICLES_SUPABASE_URL.replace(/\/$/, '');
  const client = encodeURIComponent(process.env.ARTICLES_CLIENT_ID);
  return getJson(
    `${base}/rest/v1/published_articles?select=${ARTICLE_COLUMNS}&client_id=eq.${client}&order=published_at.desc`,
    process.env.ARTICLES_SUPABASE_ANON_KEY,
  );
}

async function fetchCorrections() {
  return getJson(`${SITE_URL}/rest/v1/sainte_anne_article_corrections?select=*`, SITE_KEY);
}

async function fetchActualites() {
  return getJson(
    `${SITE_URL}/rest/v1/actualites_sainte_anne?select=id,created_at,date,titre,sous_titre,texte,lien_url,lien_label,images,image_url&order=date.desc`,
    SITE_KEY,
  );
}

// Applique la correction locale (champ non null = remplace la version centrale).
// `stale` signale que la base centrale a été modifiée après la correction.
function applyCorrection(article, correction) {
  if (!correction) return { ...article, corrected: false, stale: false };
  const merged = { ...article, corrected: true };
  for (const field of CORRECTABLE) {
    if (correction[field] !== null && correction[field] !== undefined) merged[field] = correction[field];
  }
  merged.stale = new Date(article.updated_at) > new Date(correction.base_updated_at);
  return merged;
}

async function loadArticles() {
  const articles = await fetchCentralArticles();
  if (!articles.length) return [];
  const corrections = await fetchCorrections();
  const byId = new Map(corrections.map(c => [c.article_id, c]));
  return articles.map(a => applyCorrection(a, byId.get(a.id)));
}

module.exports = { loadArticles, fetchCentralArticles, fetchActualites, SourceError, CORRECTABLE };
