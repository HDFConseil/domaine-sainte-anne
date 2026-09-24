// Rubrique Actualités, générée à la demande et mise en cache par le CDN (modèle B).
// Les adresses publiques sont renvoyées ici par vercel.json :
//   /actualites, /en/news                  → liste mélangée (actualités du domaine + articles)
//   /actualites/[slug], /en/news/[slug]    → article ou actualité du domaine (301 si ancien slug, 404 si inconnu)
//   /actualites/sitemap.xml                → sitemap de la rubrique
//   /actualites/derniere.json              → dernière publication, pour l'aperçu de la page d'accueil
//   /actualites/articles.json              → articles centraux bruts, pour admin.html

const { loadArticles, fetchCentralArticles, fetchActualites, SourceError } = require('./_lib/sources');
const { renderList, renderArticle, renderActu, findActu, actuPath, renderSitemap, renderError, renderNotFound, latest, PREFIX } = require('./_lib/render');

const CACHE = 'public, s-maxage=300, stale-while-revalidate=600';
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function send(res, status, type, body, cache = CACHE) {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', cache);
  res.end(body);
}

module.exports = async function handler(req, res) {
  const { view, slug } = req.query;
  const lang = req.query.lang === 'en' ? 'en' : 'fr';

  try {
    if (view === 'articles') {
      // Données publiques de toute façon ; cache court pour que l'admin voie vite les nouveautés.
      const raw = await fetchCentralArticles();
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(raw), 'public, s-maxage=30');
    }

    if (view === 'sitemap') {
      const [articles, actualites] = await Promise.all([loadArticles(), fetchActualites()]);
      return send(res, 200, 'application/xml; charset=utf-8', renderSitemap(articles, actualites));
    }

    if (view === 'latest') {
      const [articles, actualites] = await Promise.all([loadArticles(), fetchActualites()]);
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(latest(articles, actualites, lang)));
    }

    if (slug !== undefined) {
      if (!SLUG.test(slug)) return send(res, 404, 'text/html; charset=utf-8', renderNotFound(lang));
      const all = await loadArticles();
      const articles = all.filter(a => a.lang === lang);
      // Le slug actuel l'emporte sur l'ancien slug d'un autre article.
      const current = articles.find(a => a.slug === slug);
      // Toutes les langues sont passées au rendu pour les balises hreflang.
      if (current) return send(res, 200, 'text/html; charset=utf-8', renderArticle(current, all));
      const moved = articles.find(a => (a.previous_slugs || []).includes(slug));
      if (moved) {
        res.statusCode = 301;
        res.setHeader('Location', `${PREFIX[lang]}/${moved.slug}`);
        res.setHeader('Cache-Control', CACHE);
        return res.end();
      }
      // Actualité du domaine : retrouvée par l'id en fin d'adresse ; titre changé ou version anglaise → 301.
      const actu = findActu(await fetchActualites(), slug);
      if (actu) {
        const path = actuPath(actu);
        if (lang === 'fr' && path.endsWith(`/${slug}`)) return send(res, 200, 'text/html; charset=utf-8', renderActu(actu));
        res.statusCode = 301;
        res.setHeader('Location', path);
        res.setHeader('Cache-Control', CACHE);
        return res.end();
      }
      return send(res, 404, 'text/html; charset=utf-8', renderNotFound(lang));
    }

    const [articles, actualites] = await Promise.all([loadArticles(), fetchActualites()]);
    return send(res, 200, 'text/html; charset=utf-8', renderList(articles, actualites, lang));
  } catch (err) {
    // Jamais une page vide ou amputée en 200 : le CDN garde la dernière bonne version (stale-while-revalidate).
    console.error('[actualites]', err);
    const status = err instanceof SourceError ? 503 : 500;
    res.setHeader('Retry-After', '120');
    if (view === 'latest' || view === 'articles') {
      return send(res, status, 'application/json; charset=utf-8', JSON.stringify({ error: 'unavailable' }), 'no-store');
    }
    return send(res, status, 'text/html; charset=utf-8', renderError(lang), 'no-store');
  }
};

