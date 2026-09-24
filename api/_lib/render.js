// Rendu HTML de la rubrique Actualités (liste mélangée, pages articles, sitemap).
// Habillage repris de l'ancienne page actualites.html : garder les deux en cohérence avec le site.

const MarkdownIt = require('markdown-it');

// HTML brut désactivé ; markdown-it refuse déjà les liens javascript:, vbscript:, file: et data: (hors images).
const md = new MarkdownIt({ html: false, linkify: false, typographer: true });

const ORIGIN = 'https://domainedesainteanne.fr';
const SITE_NAME = 'Domaine de Sainte Anne';

const PREFIX = {
  fr: process.env.ARTICLES_PREFIX_FR || '/actualites',
  en: process.env.ARTICLES_PREFIX_EN || '/en/news',
};

const T = {
  fr: {
    htmlLang: 'fr', locale: 'fr-FR', home: '/', back: '← Retour au site',
    eyebrow: SITE_NAME, listTitle: 'Nos <em>actualités</em>', listMetaTitle: `Actualités — ${SITE_NAME}`,
    listDesc: 'Les actualités et articles du Domaine de Sainte Anne : événements, vendanges, dégustations, conseils autour du vin.',
    empty: 'Aucune actualité pour le moment. Revenez bientôt !',
    article: 'Article', readArticle: "Lire l'article →", readNews: "Lire l'actualité →", readMore: 'En savoir plus', min: 'min de lecture',
    share: 'Partager :', shareBtn: 'Partager', faq: 'Questions fréquentes', allNews: '← Toutes les actualités',
    ageQ: 'Avez-vous plus de 18 ans ?', ageP: "Ce site est réservé aux personnes majeures.<br>L'abus d'alcool est dangereux pour la santé.",
    ageYes: "Oui, j'ai plus de 18 ans", ageNo: 'Non',
    abus: "L'abus d'alcool est dangereux pour la santé. À consommer avec modération. Interdit aux mineurs de moins de 18 ans.",
    copied: 'Lien copié !',
  },
  en: {
    htmlLang: 'en', locale: 'en-GB', home: '/en/', back: '← Back to the website',
    eyebrow: SITE_NAME, listTitle: 'Estate <em>news</em>', listMetaTitle: `News — ${SITE_NAME}`,
    listDesc: 'News and articles from Domaine de Sainte Anne: events, harvest, tastings and wine tips.',
    empty: 'No news yet. Come back soon!',
    article: 'Article', readArticle: 'Read the article →', readNews: 'Read more (in French) →', readMore: 'Find out more', min: 'min read',
    share: 'Share:', shareBtn: 'Share', faq: 'Frequently asked questions', allNews: '← All news',
    ageQ: 'Are you over 18?', ageP: 'This site is reserved for adults.<br>Alcohol abuse is dangerous for health.',
    ageYes: 'Yes, I am over 18', ageNo: 'No',
    abus: 'Alcohol abuse is dangerous for your health. Drink responsibly. Not for sale to persons under 18.',
    copied: 'Link copied!',
  },
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Liens saisis dans l'admin : http(s) ou relatifs uniquement.
function safeUrl(url) {
  const u = String(url ?? '').trim();
  return /^(https?:\/\/|\/(?!\/))/i.test(u) ? u : '';
}

function formatDate(value, lang) {
  return new Date(value).toLocaleDateString(T[lang].locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
}

const articlePath = a => `${PREFIX[a.lang]}/${a.slug}`;

// Adresse d'une actualité du domaine : titre en slug + début de l'id, qui reste stable si le titre change.
// Même calcul dans admin.html (bouton de partage Facebook) : garder les deux identiques.
const ACTU_ID_LEN = 8;
function slugify(text) {
  const s = String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s.length > 70 ? s.slice(0, 70).replace(/-[^-]*$/, '') : s;
}
const actuSlug = a => `${slugify(a.titre) || 'actualite'}-${String(a.id).replace(/-/g, '').slice(0, ACTU_ID_LEN)}`;
// Les actualités sont rédigées en français : une seule page, sous le préfixe français.
const actuPath = a => `${PREFIX.fr}/${actuSlug(a)}`;
// Retrouve une actualité à partir de la fin de l'adresse (l'id), même si le titre a changé depuis.
function findActu(actualites, slug) {
  const m = /-([0-9a-f]{8})$/.exec(slug);
  return m ? actualites.find(a => String(a.id).replace(/-/g, '').startsWith(m[1])) : undefined;
}

// Résumé texte pour la balise description et la liste.
function summary(text, max) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max).replace(/\s+\S*$/, '') + '…' : s;
}

// JSON-LD inséré dans <script> : neutraliser "</" pour ne pas fermer la balise.
const jsonLd = obj => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

function actuImages(a) {
  return (a.images && a.images.length) ? a.images : (a.image_url ? [a.image_url] : []);
}

// ---------- Mise en page commune ----------

function layout({ lang, title, description, canonical, alternates = [], ogImage, ogType = 'website', head = '', body }) {
  const t = T[lang];
  const alt = alternates.map(x => `<link rel="alternate" hreflang="${x.lang}" href="${esc(ORIGIN + x.path)}" />`).join('\n  ');
  return `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${esc(ORIGIN + canonical)}" />
  ${alt}
  <meta property="og:type" content="${ogType}" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${esc(ogImage || ORIGIN + '/images/accueil-vigne.jpeg')}" />
  <meta property="og:url" content="${esc(ORIGIN + canonical)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Jost:wght@300;400;500&display=swap" rel="stylesheet" />
  <style>${CSS}</style>
  ${head}
</head>
<body>

<div class="age-checker hidden" id="ageChecker">
  <div class="age-checker-modal">
    <img src="/images/logo-steanne.png" alt="${SITE_NAME}" class="age-checker-logo" />
    <h2>${t.ageQ}</h2>
    <p>${t.ageP}</p>
    <div class="age-checker-btns">
      <button class="age-btn-oui" onclick="confirmAge()">${t.ageYes}</button>
      <button class="age-btn-non" onclick="denyAge()">${t.ageNo}</button>
    </div>
  </div>
</div>

<nav>
  <a href="${t.home}" class="nav-logo"><img src="/images/logo-steanne.png" alt="${SITE_NAME}" /></a>
  <a href="${t.home}#actualites" class="nav-back">${t.back}</a>
</nav>

${body}

<footer>
  <p>© ${new Date().getFullYear()} SCEA Domaine de Sainte Anne — Marcorignan, Aude</p>
</footer>
<div class="abus-banner"><p>${t.abus}</p></div>

<script>
  function confirmAge() {
    try { localStorage.setItem('ageVerified', 'true'); } catch (e) {}
    document.getElementById('ageChecker').classList.add('hidden');
  }
  function denyAge() { window.location.href = 'https://www.google.com'; }
  try { if (!localStorage.getItem('ageVerified')) document.getElementById('ageChecker').classList.remove('hidden'); } catch (e) {}

  function partagerLien(url, titre) {
    if (navigator.share) { navigator.share({ title: titre, url: url }).catch(function () {}); return; }
    navigator.clipboard.writeText(url).then(function () { alert(${JSON.stringify(t.copied)}); })
      .catch(function () { prompt('', url); });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-share-url]');
    if (b) partagerLien(b.getAttribute('data-share-url'), b.getAttribute('data-share-title'));
  });
  if (location.hash) {
    var target = document.getElementById(location.hash.slice(1));
    if (target) { target.classList.add('highlight'); setTimeout(function () { target.classList.remove('highlight'); }, 2000); }
  }
</script>
<!-- Vercel Web Analytics — mesure d'audience anonyme, sans cookie -->
<script defer src="/_vercel/insights/script.js"></script>
</body>
</html>`;
}

function shareBar(lang, path, title) {
  const url = ORIGIN + path;
  return `<div class="actu-share">
      <span>${T[lang].share}</span>
      <a class="actu-share-btn" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}">Facebook</a>
      <a class="actu-share-btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(title + ' — ' + url)}">WhatsApp</a>
      <button class="actu-share-btn" type="button" data-share-url="${esc(url)}" data-share-title="${esc(title)}">${T[lang].shareBtn}</button>
    </div>`;
}

// ---------- Liste mélangée ----------

function actuCard(a, lang) {
  const imgs = actuImages(a).map(safeUrl).filter(Boolean);
  let gallery = '';
  if (imgs.length === 1) {
    gallery = `<img class="actu-img" src="${esc(imgs[0])}" alt="${esc(a.titre)}" loading="lazy" />`;
  } else if (imgs.length > 1) {
    gallery = `<div class="actu-gallery" style="--cols:${Math.min(imgs.length, 3)}">${imgs.map(u => `<img src="${esc(u)}" alt="${esc(a.titre)}" loading="lazy" />`).join('')}</div>`;
  }
  const path = actuPath(a);
  // Les actualités sont saisies en français : on le signale aux navigateurs sur la version anglaise.
  // L'id reste en ancre pour les anciens liens partagés (/actualites#actu-…).
  return `<article class="actu-card" id="actu-${esc(a.id)}"${lang === 'fr' ? '' : ' lang="fr"'}>
    ${gallery}
    <div class="actu-card-date">${formatDate(a.date, lang)}</div>
    <h2 class="actu-card-titre"><a href="${esc(path)}">${esc(a.titre)}</a></h2>
    ${a.sous_titre ? `<p class="actu-card-sous-titre">${esc(a.sous_titre)}</p>` : ''}
    ${a.texte ? `<p class="actu-card-texte">${esc(summary(a.texte, 280))}</p>` : ''}
    <a href="${esc(path)}" class="actu-card-lien">${T[lang].readNews}</a>
  </article>`;
}

function articleCard(a, lang) {
  const t = T[lang];
  const cover = safeUrl(a.cover_image_url);
  return `<article class="actu-card actu-card--article">
    ${cover ? `<a href="${esc(articlePath(a))}" tabindex="-1"><img class="actu-img" src="${esc(cover)}" alt="${esc(a.cover_image_alt || '')}" loading="lazy" /></a>` : ''}
    <div class="actu-card-date">${formatDate(a.published_at, lang)} · ${t.article}${a.reading_time_min ? ` · ${a.reading_time_min} ${t.min}` : ''}</div>
    <h2 class="actu-card-titre"><a href="${esc(articlePath(a))}">${esc(a.title)}</a></h2>
    ${a.excerpt ? `<p class="actu-card-texte">${esc(a.excerpt)}</p>` : ''}
    <a href="${esc(articlePath(a))}" class="actu-card-lien">${t.readArticle}</a>
  </article>`;
}

// Articles de la langue + actualités du domaine, du plus récent au plus ancien.
function mergedFeed(articles, actualites, lang) {
  return [
    ...articles.filter(a => a.lang === lang).map(a => ({ kind: 'article', date: a.published_at, item: a })),
    ...actualites.map(a => ({ kind: 'actu', date: a.date, item: a })),
  ].sort((x, y) => new Date(y.date) - new Date(x.date));
}

function renderList(articles, actualites, lang) {
  const t = T[lang];
  const feed = mergedFeed(articles, actualites, lang);
  const cards = feed.length
    ? feed.map(f => f.kind === 'article' ? articleCard(f.item, lang) : actuCard(f.item, lang)).join('\n')
    : `<div class="empty">${t.empty}</div>`;
  return layout({
    lang,
    title: t.listMetaTitle,
    description: t.listDesc,
    canonical: PREFIX[lang],
    alternates: [
      { lang: 'fr', path: PREFIX.fr }, { lang: 'en', path: PREFIX.en }, { lang: 'x-default', path: PREFIX.fr },
    ],
    body: `<header class="page-header">
  <p>${t.eyebrow}</p>
  <h1>${t.listTitle}</h1>
</header>
<main class="actu-container">
${cards}
</main>`,
  });
}

// ---------- Page article ----------

function translationsOf(article, articles) {
  return articles.filter(a => a.translation_group_id === article.translation_group_id);
}

function renderArticle(article, articles) {
  const lang = article.lang;
  const t = T[lang];
  const path = articlePath(article);
  const versions = translationsOf(article, articles);
  const alternates = versions.length > 1
    ? [
      ...versions.map(v => ({ lang: v.lang, path: articlePath(v) })),
      { lang: 'x-default', path: articlePath(versions.find(v => v.lang === 'fr') || article) },
    ]
    : [];
  const cover = safeUrl(article.cover_image_url);
  const faq = Array.isArray(article.faq) ? article.faq.filter(q => q && q.question && q.answer) : [];

  const ld = [jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.meta_description || article.excerpt || undefined,
    image: cover || undefined,
    datePublished: article.published_at,
    dateModified: article.updated_at,
    inLanguage: lang,
    mainEntityOfPage: ORIGIN + path,
    author: { '@type': 'Organization', name: SITE_NAME, url: ORIGIN + '/' },
    publisher: { '@type': 'Organization', name: SITE_NAME, logo: { '@type': 'ImageObject', url: ORIGIN + '/images/logo-steanne.png' } },
  })];
  if (faq.length) {
    ld.push(jsonLd({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map(q => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answer } })),
    }));
  }

  return layout({
    lang,
    title: `${article.meta_title || article.title} — ${SITE_NAME}`,
    description: article.meta_description || article.excerpt || '',
    canonical: path,
    alternates,
    ogImage: cover,
    ogType: 'article',
    head: ld.join('\n  '),
    body: `<main class="article">
  <a class="article-back" href="${PREFIX[lang]}">${t.allNews}</a>
  <header class="article-header">
    <div class="actu-card-date">${formatDate(article.published_at, lang)}${article.reading_time_min ? ` · ${article.reading_time_min} ${t.min}` : ''}</div>
    <h1>${esc(article.title)}</h1>
    ${article.excerpt ? `<p class="article-chapo">${esc(article.excerpt)}</p>` : ''}
  </header>
  ${cover ? `<img class="article-cover" src="${esc(cover)}" alt="${esc(article.cover_image_alt || '')}" />` : ''}
  <div class="article-body">
${md.render(article.body_markdown || '')}
  </div>
  ${faq.length ? `<section class="article-faq">
    <h2>${t.faq}</h2>
    ${faq.map(q => `<details><summary>${esc(q.question)}</summary><p>${esc(q.answer)}</p></details>`).join('\n    ')}
  </section>` : ''}
  ${shareBar(lang, path, article.title)}
</main>`,
  });
}

// ---------- Page actualité du domaine ----------

function renderActu(a) {
  const t = T.fr;
  const path = actuPath(a);
  const imgs = actuImages(a).map(safeUrl).filter(Boolean);
  const lien = safeUrl(a.lien_url);
  const description = summary(a.sous_titre || a.texte || a.titre, 160);
  const ld = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: a.titre,
    description: description || undefined,
    image: imgs.length ? imgs : undefined,
    datePublished: a.date,
    dateModified: a.created_at || a.date,
    inLanguage: 'fr',
    mainEntityOfPage: ORIGIN + path,
    author: { '@type': 'Organization', name: SITE_NAME, url: ORIGIN + '/' },
    publisher: { '@type': 'Organization', name: SITE_NAME, logo: { '@type': 'ImageObject', url: ORIGIN + '/images/logo-steanne.png' } },
  });
  const gallery = imgs.length === 1
    ? `<img class="article-cover" src="${esc(imgs[0])}" alt="${esc(a.titre)}" />`
    : imgs.length > 1
      ? `<div class="actu-gallery article-gallery" style="--cols:${Math.min(imgs.length, 3)}">${imgs.map(u => `<img src="${esc(u)}" alt="${esc(a.titre)}" loading="lazy" />`).join('')}</div>`
      : '';
  return layout({
    lang: 'fr',
    title: `${a.titre} — ${SITE_NAME}`,
    description,
    canonical: path,
    ogImage: imgs[0],
    ogType: 'article',
    head: ld,
    body: `<main class="article">
  <a class="article-back" href="${PREFIX.fr}">${t.allNews}</a>
  <header class="article-header">
    <div class="actu-card-date">${formatDate(a.date, 'fr')}</div>
    <h1>${esc(a.titre)}</h1>
    ${a.sous_titre ? `<p class="article-chapo">${esc(a.sous_titre)}</p>` : ''}
  </header>
  ${gallery}
  ${a.texte ? `<div class="article-body article-body--texte">${esc(a.texte)}</div>` : ''}
  ${lien ? `<a href="${esc(lien)}" target="_blank" rel="noopener" class="actu-card-lien">${esc(a.lien_label || t.readMore)} →</a>` : ''}
  ${shareBar('fr', path, a.titre)}
</main>`,
  });
}

// ---------- Sitemap ----------

function renderSitemap(articles, actualites) {
  const listAlt = ['fr', 'en'].map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${ORIGIN}${PREFIX[l]}" />`).join('');
  const urls = [
    `<url><loc>${ORIGIN}${PREFIX.fr}</loc>${listAlt}<changefreq>weekly</changefreq><priority>0.7</priority></url>`,
    `<url><loc>${ORIGIN}${PREFIX.en}</loc>${listAlt}<changefreq>weekly</changefreq><priority>0.6</priority></url>`,
    ...articles.map(a => {
      const versions = translationsOf(a, articles);
      const alt = versions.length > 1
        ? versions.map(v => `<xhtml:link rel="alternate" hreflang="${v.lang}" href="${esc(ORIGIN + articlePath(v))}" />`).join('')
        : '';
      return `<url><loc>${esc(ORIGIN + articlePath(a))}</loc>${alt}<lastmod>${new Date(a.updated_at).toISOString()}</lastmod></url>`;
    }),
    ...actualites.map(a => `<url><loc>${esc(ORIGIN + actuPath(a))}</loc><lastmod>${new Date(a.created_at || a.date).toISOString()}</lastmod></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>`;
}

// ---------- Aperçu page d'accueil ----------

function latest(articles, actualites, lang) {
  const first = mergedFeed(articles, actualites, lang)[0];
  if (!first) return null;
  if (first.kind === 'article') {
    const a = first.item;
    return { kind: 'article', title: a.title, subtitle: a.excerpt, date: a.published_at, url: articlePath(a), images: a.cover_image_url ? [a.cover_image_url] : [] };
  }
  const a = first.item;
  return { kind: 'actu', title: a.titre, subtitle: a.sous_titre, date: a.date, url: actuPath(a), images: actuImages(a) };
}

function renderError(lang) {
  const t = T[lang];
  return layout({
    lang,
    title: t.listMetaTitle,
    description: t.listDesc,
    canonical: PREFIX[lang],
    body: `<main class="actu-container"><div class="empty">${lang === 'fr'
      ? 'Les actualités sont momentanément indisponibles. Merci de réessayer dans quelques minutes.'
      : 'News is temporarily unavailable. Please try again in a few minutes.'}</div></main>`,
  });
}

function renderNotFound(lang) {
  const t = T[lang];
  return layout({
    lang,
    title: lang === 'fr' ? `Page introuvable — ${SITE_NAME}` : `Page not found — ${SITE_NAME}`,
    description: t.listDesc,
    canonical: PREFIX[lang],
    head: '<meta name="robots" content="noindex" />',
    body: `<main class="actu-container"><div class="empty">${lang === 'fr'
      ? "Cet article n'existe pas ou n'est plus en ligne."
      : 'This article does not exist or is no longer online.'}<br><br><a class="actu-card-lien" href="${PREFIX[lang]}">${t.allNews}</a></div></main>`,
  });
}

const CSS = `
:root { --bordeaux:#61394a; --bordeaux-dark:#3a2530; --or:#c9a84c; --or-light:#e8d5a3; --creme-pale:#f5f0f2; --creme-light:#faf6f8; --blanc:#fdfbfc; --noir:#171717; }
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Jost',sans-serif; background:var(--creme-pale); color:var(--noir); }
nav { background:var(--bordeaux); padding:0 2.5rem; display:flex; align-items:center; justify-content:space-between; height:72px; }
.nav-logo { display:flex; align-items:center; text-decoration:none; }
.nav-logo img { height:60px; width:auto; object-fit:contain; }
.nav-back { text-decoration:none; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:rgba(255,255,255,0.7); transition:color 0.2s; }
.nav-back:hover { color:var(--or); }
.page-header { background:var(--bordeaux); padding:4rem 2rem 3rem; text-align:center; }
.page-header p { font-size:10px; letter-spacing:0.4em; text-transform:uppercase; color:var(--or); margin-bottom:1rem; }
.page-header h1 { font-family:'Playfair Display',serif; font-size:clamp(2rem,5vw,3.5rem); font-weight:400; color:#fff; }
.page-header h1 em { font-style:italic; color:var(--or-light); }
.actu-container { max-width:820px; margin:0 auto; padding:4rem 2rem; }
.actu-card { background:var(--blanc); margin-bottom:2rem; padding:2.5rem; border-left:3px solid var(--or); scroll-margin-top:2rem; transition:box-shadow 0.6s ease; }
.actu-card.highlight { box-shadow:0 0 0 2px var(--or); }
.actu-card--article { border-left-color:var(--bordeaux); }
.actu-img { display:block; width:100%; max-height:320px; object-fit:cover; margin-bottom:1.5rem; }
.actu-gallery { display:grid; grid-template-columns:repeat(var(--cols),1fr); gap:6px; margin-bottom:1.5rem; }
.actu-gallery img { width:100%; height:180px; object-fit:cover; }
.actu-card-date { font-size:10px; letter-spacing:0.25em; text-transform:uppercase; color:var(--or); margin-bottom:0.75rem; }
.actu-card-titre { font-family:'Playfair Display',serif; font-size:1.6rem; font-weight:400; color:var(--bordeaux-dark); margin-bottom:0.5rem; line-height:1.2; }
.actu-card-titre a { color:inherit; text-decoration:none; }
.actu-card-titre a:hover { color:var(--bordeaux); }
.actu-card-sous-titre { font-size:1rem; font-weight:300; color:var(--bordeaux); margin-bottom:1rem; font-style:italic; }
.actu-card-texte { font-size:0.95rem; font-weight:300; line-height:1.85; color:#555; white-space:pre-wrap; }
.actu-card-lien { display:inline-block; margin-top:1.25rem; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:var(--bordeaux); text-decoration:none; border-bottom:1px solid var(--or); padding-bottom:2px; transition:color 0.2s; }
.actu-card-lien:hover { color:var(--or); }
.actu-share { display:flex; flex-wrap:wrap; gap:0.75rem; margin-top:1.5rem; padding-top:1.25rem; border-top:1px solid #eee; align-items:center; }
.actu-share span { font-size:10px; letter-spacing:0.15em; text-transform:uppercase; color:#aaa; margin-right:0.25rem; }
.actu-share-btn { display:inline-flex; align-items:center; gap:6px; text-decoration:none; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--bordeaux); border:1px solid #e0d8db; padding:6px 12px; transition:all 0.2s; background:none; cursor:pointer; font-family:'Jost',sans-serif; }
.actu-share-btn:hover { border-color:var(--bordeaux); background:var(--creme-pale); }
.empty { text-align:center; padding:4rem; color:#999; font-style:italic; }

.article { max-width:760px; margin:0 auto; padding:3rem 2rem 4rem; }
.article-back { display:inline-block; margin-bottom:2rem; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:var(--bordeaux); text-decoration:none; }
.article-back:hover { color:var(--or); }
.article-header h1 { font-family:'Playfair Display',serif; font-size:clamp(2rem,4.5vw,2.8rem); font-weight:400; line-height:1.15; color:var(--bordeaux-dark); text-wrap:balance; }
.article-chapo { margin-top:1.25rem; font-size:1.15rem; font-weight:300; line-height:1.7; color:var(--bordeaux); font-style:italic; }
.article-cover { display:block; width:100%; max-height:460px; object-fit:cover; margin:2.5rem 0; }
.article-body { margin-top:2rem; font-size:1.05rem; font-weight:300; line-height:1.9; color:#333; }
.article-body > * + * { margin-top:1.25rem; }
.article-body h2 { font-family:'Playfair Display',serif; font-weight:400; font-size:1.7rem; line-height:1.25; color:var(--bordeaux-dark); margin-top:2.75rem; }
.article-body h3 { font-family:'Playfair Display',serif; font-weight:600; font-size:1.25rem; color:var(--bordeaux); margin-top:2rem; }
.article-body a { color:var(--bordeaux); text-decoration-color:var(--or); text-underline-offset:3px; }
.article-body strong { font-weight:500; color:var(--noir); }
.article-body ul, .article-body ol { padding-left:1.4rem; }
.article-body li + li { margin-top:0.4rem; }
.article-body blockquote { border-left:3px solid var(--or); padding:0.25rem 0 0.25rem 1.25rem; font-style:italic; color:var(--bordeaux); }
.article-body img { max-width:100%; }
.article-body--texte { white-space:pre-wrap; }
.article-gallery { margin:2.5rem 0; }
.article .actu-card-lien { margin-top:2rem; }
.article-faq { margin-top:3.5rem; padding-top:2rem; border-top:1px solid #e6dde1; }
.article-faq h2 { font-family:'Playfair Display',serif; font-weight:400; font-size:1.5rem; color:var(--bordeaux-dark); margin-bottom:1rem; }
.article-faq details { background:var(--blanc); border-left:3px solid var(--or); padding:1rem 1.25rem; margin-bottom:0.75rem; }
.article-faq summary { cursor:pointer; font-weight:500; color:var(--bordeaux-dark); }
.article-faq details p { margin-top:0.75rem; font-weight:300; line-height:1.8; color:#555; }

footer { background:var(--noir); padding:2rem; text-align:center; }
footer p { font-size:11px; color:rgba(255,255,255,0.3); }
.abus-banner { background:var(--bordeaux-dark); padding:0.6rem 2rem; text-align:center; }
.abus-banner p { font-size:10px; letter-spacing:0.1em; color:rgba(255,255,255,0.45); }

.age-checker { position:fixed; inset:0; background:rgba(23,23,23,0.85); display:flex; align-items:center; justify-content:center; z-index:999; backdrop-filter:blur(4px); }
.age-checker.hidden { display:none; }
.age-checker-modal { background:var(--blanc); padding:3.5rem 3rem; text-align:center; max-width:420px; width:90%; }
.age-checker-logo { height:80px; width:auto; margin-bottom:2rem; }
.age-checker-modal h2 { font-family:'Playfair Display',serif; font-size:1.6rem; font-weight:400; color:var(--bordeaux-dark); margin-bottom:0.75rem; }
.age-checker-modal p { font-size:0.9rem; font-weight:300; color:#666; line-height:1.7; margin-bottom:2rem; }
.age-checker-btns { display:flex; flex-direction:column; gap:0.75rem; }
.age-btn-oui, .age-btn-non { border:none; padding:14px; font-family:'Jost',sans-serif; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; cursor:pointer; }
.age-btn-oui { background:var(--bordeaux); color:#fff; font-weight:500; }
.age-btn-oui:hover { background:var(--bordeaux-dark); }
.age-btn-non { background:var(--creme-light); color:#999; }

@media (max-width:600px) {
  nav { padding:0 1rem; }
  .actu-card { padding:1.5rem; }
  .actu-container { padding:2rem 1rem; }
  .article { padding:2rem 1rem 3rem; }
  .actu-gallery img { height:120px; }
}`;

module.exports = { renderList, renderArticle, renderActu, findActu, actuPath, renderSitemap, renderError, renderNotFound, latest, PREFIX };
