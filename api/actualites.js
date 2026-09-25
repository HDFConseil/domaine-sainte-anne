// Rubrique Actualités, générée à la demande et mise en cache par le CDN (modèle B).
// Les adresses publiques sont renvoyées ici par vercel.json :
//   /actualites, /en/news                  → liste mélangée (actualités du domaine + articles)
//   /actualites/[slug], /en/news/[slug]    → article ou actualité du domaine (301 si ancien slug, 404 si inconnu)
//   /actualites/sitemap.xml                → sitemap de la rubrique
//   /actualites/derniere.json              → dernière publication, pour l'aperçu de la page d'accueil
//   /api/actualites?view=admin-articles    → articles centraux bruts et corrections, pour admin.html (connexion requise)
//   /api/actualites?view=admin-article     → un article central complet, pour l'écran de correction (connexion requise)

const { loadArticles, resolveArticle, rawList, rawArticle, fetchActualites, adminUser, SourceError } = require('./_lib/sources');
const { renderList, renderArticle, renderActu, findActu, actuPath, renderSitemap, renderError, renderNotFound, latest, PREFIX } = require('./_lib/render');

const CACHE = 'public, s-maxage=300, stale-while-revalidate=600';
// Liste servie sans les articles centraux (point d'accès indisponible) : gardée peu de temps.
const CACHE_DEGRADED = 'public, s-maxage=60';
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function send(res, status, type, body, cache = CACHE) {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', cache);
  res.end(body);
}

function redirect(res, location) {
  res.statusCode = 301;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', CACHE);
  res.end();
}

// Articles d'une langue (ou toutes langues) ; si la base centrale ne répond pas, la liste et
// l'aperçu d'accueil restent en ligne avec les seules actualités du domaine.
async function articlesOrNothing(lang) {
  try {
    return { articles: await loadArticles(lang), degraded: false };
  } catch (err) {
    if (!(err instanceof SourceError)) throw err;
    console.error('[actualites] articles centraux indisponibles :', err.message);
    return { articles: [], degraded: true };
  }
}

async function adminView(req, res, view) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!(await adminUser(token))) {
    return send(res, 401, 'application/json; charset=utf-8', JSON.stringify({ error: 'unauthorized' }), 'no-store');
  }
  if (view === 'admin-articles') {
    return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(await rawList()), 'private, no-store');
  }
  const lang = req.query.lang === 'en' ? 'en' : 'fr';
  const slug = String(req.query.slug || '');
  const article = SLUG.test(slug) ? await rawArticle(lang, slug) : null;
  if (!article) return send(res, 404, 'application/json; charset=utf-8', JSON.stringify({ error: 'not_found' }), 'no-store');
  return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(article), 'private, no-store');
}

module.exports = async function handler(req, res) {
  const { view, slug } = req.query;
  const lang = req.query.lang === 'en' ? 'en' : 'fr';

  try {
    if (view === 'admin-articles' || view === 'admin-article') return await adminView(req, res, view);

    if (view === 'sitemap') {
      // Pas de version dégradée : un sitemap amputé ferait croire à Google que des articles ont disparu.
      const [articles, actualites] = await Promise.all([loadArticles(), fetchActualites()]);
      return send(res, 200, 'application/xml; charset=utf-8', renderSitemap(articles, actualites));
    }

    if (view === 'latest') {
      const [{ articles, degraded }, actualites] = await Promise.all([articlesOrNothing(lang), fetchActualites()]);
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(latest(articles, actualites, lang)), degraded ? CACHE_DEGRADED : CACHE);
    }

    if (slug !== undefined) {
      if (!SLUG.test(slug)) return send(res, 404, 'text/html; charset=utf-8', renderNotFound(lang));
      // Actualité du domaine (adresse terminée par 8 caractères de son id) : traitée sans appeler la base centrale.
      const actu = findActu(await fetchActualites(), slug);
      if (actu) {
        const path = actuPath(actu);
        if (lang === 'fr' && path.endsWith(`/${slug}`)) return send(res, 200, 'text/html; charset=utf-8', renderActu(actu));
        return redirect(res, path);
      }
      // Article central : slug actuel, ou ancien slug (301). Le slug actuel l'emporte sur l'ancien slug d'un autre article.
      const r = await resolveArticle(lang, slug);
      if (r.kind === 'article') return send(res, 200, 'text/html; charset=utf-8', renderArticle(r.article, r.translations));
      if (r.kind === 'moved') return redirect(res, `${PREFIX[lang]}/${r.slug}`);
      return send(res, 404, 'text/html; charset=utf-8', renderNotFound(lang));
    }

    const [{ articles, degraded }, actualites] = await Promise.all([articlesOrNothing(lang), fetchActualites()]);
    return send(res, 200, 'text/html; charset=utf-8', renderList(articles, actualites, lang), degraded ? CACHE_DEGRADED : CACHE);
  } catch (err) {
    // Jamais une page vide ou amputée en 200 : le CDN garde la dernière bonne version (stale-while-revalidate).
    console.error('[actualites]', err);
    const status = err instanceof SourceError ? 503 : 500;
    res.setHeader('Retry-After', '120');
    if (view === 'latest' || String(view).startsWith('admin')) {
      return send(res, status, 'application/json; charset=utf-8', JSON.stringify({ error: 'unavailable' }), 'no-store');
    }
    return send(res, status, 'text/html; charset=utf-8', renderError(lang), 'no-store');
  }
};
