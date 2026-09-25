// Tests de la rubrique Actualités : node --test
// Les appels réseau (base du domaine, point d'accès central, connexion admin) sont simulés.
const test = require('node:test');
const assert = require('node:assert/strict');

const sources = require('../api/_lib/sources');
const handler = require('../api/actualites');
const MOCK = require('../api/_lib/mock-articles');

const SECRET = 'secret-de-test-0123456789';
const ENDPOINT = 'https://central.test/functions/v1/site-articles';
const ACTU = {
  id: '9bec926a-0000-4000-8000-000000000000', created_at: '2026-07-07T20:55:49Z', date: '2026-07-24',
  titre: 'Soirée concert', sous_titre: null, texte: 'Venez nombreux', lien_url: null, lien_label: null, images: [], image_url: null,
};

// État simulé, remis à zéro avant chaque test.
let state;
function reset(env = {}) {
  state = { corrections: [], central: 'ok', centralCalls: [] };
  delete process.env.ARTICLES_MOCK;
  delete process.env.ARTICLES_ENDPOINT;
  delete process.env.ARTICLES_SITE_SECRET;
  Object.assign(process.env, env);
  sources._reset();
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

global.fetch = async (url, init = {}) => {
  const u = new URL(url);
  if (u.host === 'central.test') {
    state.centralCalls.push({ url: u, headers: init.headers });
    if (state.central !== 'ok') return json({ error: 'unauthorized' }, 401);
    if (init.headers['X-Site-Secret'] !== SECRET) return json({ error: 'unauthorized' }, 401);
    const op = u.searchParams.get('op');
    const lang = u.searchParams.get('lang');
    if (op === 'list') {
      return json(MOCK.filter(a => !lang || a.lang === lang).map(({ body_markdown, faq, meta_title, meta_description, previous_slugs, ...rest }) => rest));
    }
    const slug = u.searchParams.get('slug');
    const article = MOCK.find(a => a.lang === lang && a.slug === slug);
    if (article) {
      return json({ article, translations: MOCK.filter(t => t.translation_group_id === article.translation_group_id && t.lang !== lang).map(t => ({ lang: t.lang, slug: t.slug })) });
    }
    const moved = MOCK.find(a => a.lang === lang && a.previous_slugs.includes(slug));
    return json(moved ? { article: null, moved_to: moved.slug } : { article: null });
  }
  if (u.pathname === '/rest/v1/actualites_sainte_anne') return json([ACTU]);
  if (u.pathname === '/rest/v1/sainte_anne_article_corrections') {
    const id = (u.searchParams.get('article_id') || '').replace(/^eq\./, '');
    return json(id ? state.corrections.filter(c => c.article_id === id) : state.corrections);
  }
  if (u.pathname === '/auth/v1/user') {
    return init.headers.Authorization === 'Bearer jeton-valide' ? json({ id: 'u1' }) : json({ error: 'bad' }, 401);
  }
  throw new Error('appel inattendu : ' + url);
};

async function call(query, headers = {}) {
  const res = {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b = '') { this.body = String(b); },
  };
  await handler({ query, headers }, res);
  return res;
}

test('sans branchement : la liste affiche les actualités du domaine, sans appel central', async () => {
  reset();
  const r = await call({ lang: 'fr' });
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /Soirée concert/);
  assert.doesNotMatch(r.body, /cassoulet/);
});

test('articles fictifs : liste, article, photos, hreflang, fil d\'Ariane', async () => {
  reset({ ARTICLES_MOCK: '1' });
  const list = await call({ lang: 'fr' });
  assert.match(list.body, /Quels vins servir avec un cassoulet/);
  assert.match(list.body, /width="1200" height="630"/);

  const page = await call({ lang: 'fr', slug: 'quels-vins-servir-avec-un-cassoulet' });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /<img src="https:\/\/domainedesainteanne\.fr\/images\/accueil-vigne\.jpeg" alt="Les vignes du Domaine de Sainte Anne" width="1200" height="630" class="article-cover"/);
  assert.match(page.body, /cave-bouteilles\.jpeg"[^>]*width="1200"/, 'photo du corps gardée avec ses dimensions');
  assert.doesNotMatch(page.body, /exemple\.invalid/, 'image inconnue retirée');
  assert.doesNotMatch(page.body, /javascript:/);
  assert.match(page.body, /hreflang="en" href="https:\/\/domainedesainteanne\.fr\/en\/news\/which-wines-to-serve-with-cassoulet"/);
  assert.match(page.body, /hreflang="x-default" href="https:\/\/domainedesainteanne\.fr\/actualites\/quels-vins-servir-avec-un-cassoulet"/);
  assert.match(page.body, /"@type":"BreadcrumbList"/);
  assert.match(page.body, /"image":\{"@type":"ImageObject"/);
  assert.match(page.body, /"@type":"FAQPage"/);
});

test('ancien slug → 301, slug inconnu → 404, actualité du domaine servie', async () => {
  reset({ ARTICLES_MOCK: '1' });
  const moved = await call({ lang: 'fr', slug: 'vin-et-cassoulet' });
  assert.equal(moved.statusCode, 301);
  assert.equal(moved.headers.location, '/actualites/quels-vins-servir-avec-un-cassoulet');
  const unknown = await call({ lang: 'fr', slug: 'inconnu' });
  assert.equal(unknown.statusCode, 404);
  assert.match(unknown.body, /noindex/);
  const actu = await call({ lang: 'fr', slug: 'soiree-concert-9bec926a' });
  assert.equal(actu.statusCode, 200);
  assert.match(actu.body, /"@type":"NewsArticle"/);
});

test('point d\'accès réel : secret envoyé en en-tête, jamais dans l\'adresse ni les pages', async () => {
  reset({ ARTICLES_ENDPOINT: ENDPOINT, ARTICLES_SITE_SECRET: SECRET });
  const list = await call({ lang: 'fr' });
  const page = await call({ lang: 'en', slug: 'which-wines-to-serve-with-cassoulet' });
  const sitemap = await call({ view: 'sitemap' });
  assert.equal(page.statusCode, 200);
  assert.ok(state.centralCalls.length >= 3);
  for (const c of state.centralCalls) {
    assert.equal(c.headers['X-Site-Secret'], SECRET);
    assert.ok(!c.url.href.includes(SECRET));
    assert.equal(c.url.searchParams.get('client_id'), null);
  }
  for (const r of [list, page, sitemap]) assert.ok(!r.body.includes(SECRET));
});

test('sitemap : articles des deux langues avec lastmod, et actualités', async () => {
  reset({ ARTICLES_ENDPOINT: ENDPOINT, ARTICLES_SITE_SECRET: SECRET });
  const r = await call({ view: 'sitemap' });
  assert.equal(r.statusCode, 200);
  assert.match(r.body, /<loc>https:\/\/domainedesainteanne\.fr\/actualites\/quels-vins-servir-avec-un-cassoulet<\/loc><xhtml:link rel="alternate" hreflang="fr"[^<]*\/><xhtml:link rel="alternate" hreflang="en"[^<]*\/><lastmod>2026-09-20T08:00:00.000Z<\/lastmod>/);
  assert.match(r.body, /\/en\/news\/which-wines-to-serve-with-cassoulet/);
  assert.match(r.body, /\/actualites\/soiree-concert-9bec926a/);
});

test('secret refusé : liste et accueil en ligne sans les articles (cache court), sitemap et article en 503', async () => {
  reset({ ARTICLES_ENDPOINT: ENDPOINT, ARTICLES_SITE_SECRET: 'faux' });
  const list = await call({ lang: 'fr' });
  assert.equal(list.statusCode, 200);
  assert.match(list.body, /Soirée concert/);
  assert.equal(list.headers['cache-control'], 'public, s-maxage=60');
  const latest = await call({ view: 'latest', lang: 'fr' });
  assert.equal(latest.statusCode, 200);
  assert.equal((await call({ view: 'sitemap' })).statusCode, 503);
  const page = await call({ lang: 'fr', slug: 'quels-vins-servir-avec-un-cassoulet' });
  assert.equal(page.statusCode, 503);
  assert.equal(page.headers['cache-control'], 'no-store');
});

test('correction locale : appliquée à la liste, à la page et à la date de modification', async () => {
  reset({ ARTICLES_ENDPOINT: ENDPOINT, ARTICLES_SITE_SECRET: SECRET });
  state.corrections = [{
    article_id: MOCK[0].id, base_updated_at: MOCK[0].updated_at, updated_at: '2026-09-22T10:00:00Z',
    title: 'Cassoulet : nos accords corrigés', meta_title: null, meta_description: null, excerpt: null,
    body_markdown: '## Texte corrigé', faq: null,
    cover_image_url: 'https://ksifjyshjhjdsiinycci.supabase.co/storage/v1/object/public/actualites-sainte-anne-images/articles/x.jpg',
    cover_image_alt: 'Nouvelle photo',
  }];
  const list = await call({ lang: 'fr' });
  assert.match(list.body, /Cassoulet : nos accords corrigés/);
  const page = await call({ lang: 'fr', slug: 'quels-vins-servir-avec-un-cassoulet' });
  assert.match(page.body, /Texte corrigé/);
  assert.match(page.body, /<img src="[^"]*articles\/x\.jpg" alt="Nouvelle photo" class="article-cover"/, 'photo remplacée, sans dimensions');
  assert.match(page.body, /"dateModified":"2026-09-22T10:00:00Z"/);
  const sitemap = await call({ view: 'sitemap' });
  assert.match(sitemap.body, /quels-vins-servir-avec-un-cassoulet<\/loc>.*<lastmod>2026-09-22T10:00:00.000Z<\/lastmod>/);
});

test('admin : articles bruts réservés aux comptes connectés', async () => {
  reset({ ARTICLES_ENDPOINT: ENDPOINT, ARTICLES_SITE_SECRET: SECRET });
  assert.equal((await call({ view: 'admin-articles' })).statusCode, 401);
  assert.equal((await call({ view: 'admin-articles' }, { authorization: 'Bearer faux' })).statusCode, 401);
  const list = await call({ view: 'admin-articles' }, { authorization: 'Bearer jeton-valide' });
  assert.equal(list.statusCode, 200);
  assert.equal(list.headers['cache-control'], 'private, no-store');
  assert.equal(JSON.parse(list.body).length, 2);
  const one = await call({ view: 'admin-article', lang: 'fr', slug: 'quels-vins-servir-avec-un-cassoulet' }, { authorization: 'Bearer jeton-valide' });
  assert.equal(JSON.parse(one.body).body_markdown, MOCK[0].body_markdown);
});
