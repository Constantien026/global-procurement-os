/* ==========================================================================
   i18n — language layer for the landing + auth screens

   Translations are keyed by the English source text, so the markup stays
   clean (no data-i18n attributes needed for ordinary copy):

     I18N.t('Learn more')            -> "En savoir plus" (in French)
     I18N.t('Sent to {{n}} buyers', { n: 3 })

   Elements whose text is split across child tags carry `data-i18n-html`;
   text set at runtime carries `data-i18n-key` so it re-translates when the
   visitor switches language.
   ========================================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'gpos-lang';
  var LANGS = ['EN', 'FR', 'ES', 'ZH'];
  var HTML_LANG = { EN: 'en', FR: 'fr', ES: 'es', ZH: 'zh' };

  /* English source -> localized copy. EN is the identity table (empty). */
  var DICT = { FR: {}, ES: {}, ZH: {} };

  var lang = 'EN';
  try {
    var saved = localStorage.getItem(STORE_KEY);
    if (saved && LANGS.indexOf(saved) !== -1) lang = saved;
  } catch (e) { /* private mode — stay on English */ }

  /* ------------------------------------------------------------- helpers */
  function lookup(en) {
    if (!en || lang === 'EN') return en;
    var table = DICT[lang];
    return Object.prototype.hasOwnProperty.call(table, en) ? table[en] : en;
  }

  function t(key, vars) {
    var out = lookup(String(key === undefined || key === null ? '' : key).trim());
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        out = out.split('{{' + name + '}}').join(String(vars[name]));
      });
    }
    return out;
  }

  function all(sel) {
    return Array.prototype.slice.call(document.querySelectorAll(sel));
  }

  /* Snapshot the English originals the first time we run. */
  function cacheOriginals() {
    if (document.__enTitle === undefined) document.__enTitle = document.title;

    var desc = document.querySelector('meta[name="description"]');
    if (desc && desc.__en === undefined) desc.__en = desc.getAttribute('content');

    all('[data-i18n-html]').forEach(function (el) {
      if (el.__html === undefined) el.__html = el.innerHTML;
    });
    all('[placeholder]').forEach(function (el) {
      if (el.__ph === undefined) el.__ph = el.getAttribute('placeholder');
    });
    all('[aria-label]').forEach(function (el) {
      if (el.__al === undefined) el.__al = el.getAttribute('aria-label');
    });
    all('[data-suffix]').forEach(function (el) {
      if (el.__sfx === undefined) el.__sfx = el.dataset.suffix || '';
    });
  }

  function swap(original, key, translated) {
    if (translated === key) return original;
    return original.replace(key, function () { return translated; });
  }

  /* ---------------------------------------------------------- apply to DOM */
  function apply() {
    cacheOriginals();

    document.documentElement.lang = HTML_LANG[lang] || 'en';

    if (document.__enTitle !== undefined) document.title = t(document.__enTitle);

    var desc = document.querySelector('meta[name="description"]');
    if (desc && desc.__en) desc.setAttribute('content', t(desc.__en));

    /* 1. plain text nodes — keeps every icon, span and nested tag intact */
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(function (node) {
      var el = node.parentElement;
      if (!el) return;
      var tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return;
      if (el.hasAttribute('data-i18n-key')) return;
      if (el.closest('[data-i18n-html]')) return;

      if (node.__en === undefined) node.__en = node.nodeValue;
      var source = node.__en;
      var key = source.trim();
      if (!key) return;
      node.nodeValue = swap(source, key, t(key));
    });

    /* 2. attributes */
    all('[placeholder]').forEach(function (el) {
      var key = el.__ph.trim();
      el.setAttribute('placeholder', swap(el.__ph, key, t(key)));
    });
    all('[aria-label]').forEach(function (el) {
      if (el.classList.contains('menu-toggle')) return; /* toggles its own label */
      var key = el.__al.trim();
      el.setAttribute('aria-label', swap(el.__al, key, t(key)));
    });
    all('[data-suffix]').forEach(function (el) {
      var base = el.__sfx;
      var word = base.trim();
      if (!word) return;
      el.dataset.suffix = swap(base, word, t(word));
    });

    /* 3. strings written at runtime */
    all('[data-i18n-key]').forEach(function (el) {
      el.textContent = t(el.dataset.i18nKey);
    });

    /* 4. headings / copy that spans child elements */
    all('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = t(el.__html);
    });

    syncLangMenu();
  }

  function setLang(code) {
    lang = LANGS.indexOf(code) === -1 ? 'EN' : code;
    try { localStorage.setItem(STORE_KEY, lang); } catch (e) { /* private mode */ }
    apply();
  }

  /* ------------------------------------------------------- language menu */
  function syncLangMenu() {
    var btn = document.querySelector('.lang-btn');
    var menu = document.querySelector('.lang-menu');
    if (!btn || !menu) return;
    var label = btn.querySelector('span');
    if (label) label.textContent = lang;
    all('.lang-menu [data-lang]').forEach(function (li) {
      li.setAttribute('aria-selected', String(li.dataset.lang === lang));
    });
  }

  function bindLangMenu() {
    var btn = document.querySelector('.lang-btn');
    var menu = document.querySelector('.lang-menu');
    if (!btn || !menu || btn.__i18nBound) return;
    btn.__i18nBound = true;

    function close() {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = menu.hidden;
      menu.hidden = !willOpen;
      btn.setAttribute('aria-expanded', String(willOpen));
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.lang')) close();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    all('.lang-menu [data-lang]').forEach(function (li) {
      li.addEventListener('click', function () {
        setLang(li.dataset.lang);
        close();
      });
    });
  }

  /* ------------------------------------------------------------ public API */
  window.I18N = {
    t: t,
    setLang: setLang,
    apply: apply,
    LANGS: LANGS,
    get lang() { return lang; },
  };

  /* ====================================================================== */
  /*  FRANÇAIS                                                              */
  /* ====================================================================== */
  Object.assign(DICT.FR, {
    /* --- document --- */
    'Global Procurement OS — AI Global Procurement Platform': 'Global Procurement OS — Plateforme mondiale d’achats propulsée par l’IA',
    'Connect global buyers with trusted manufacturers through AI. Source products, match suppliers, and manage procurement end-to-end.': 'Reliez les acheteurs du monde entier à des fabricants de confiance grâce à l’IA. Trouvez des produits, des fournisseurs et pilotez vos achats de bout en bout.',
    'Sign in — Global Procurement OS': 'Connexion — Global Procurement OS',
    'Sign in to your Global Procurement OS workspace, or create a buyer or supplier account.': 'Connectez-vous à votre espace Global Procurement OS ou créez un compte acheteur ou fournisseur.',

    /* --- header / navigation --- */
    'Skip to content': 'Aller au contenu',
    'Global Procurement OS — home': 'Global Procurement OS — accueil',
    'Main navigation': 'Navigation principale',
    'Products': 'Produits',
    'Workflow': 'Processus',
    'Cases': 'Cas clients',
    'Suppliers': 'Fournisseurs',
    'Start Procurement': 'Démarrer un achat',
    'Join Supplier Network': 'Rejoindre le réseau de fournisseurs',
    'Change language': 'Changer de langue',
    'Language options': 'Options de langue',
    'Open menu': 'Ouvrir le menu',
    'Close menu': 'Fermer le menu',
    'Open Dashboard': 'Ouvrir le tableau de bord',

    /* --- hero --- */
    'Enterprise-grade global sourcing': 'Sourcing mondial de niveau entreprise',
    'AI Global <span class="accent-text">Procurement</span> Platform': 'Plateforme d’<span class="accent-text">approvisionnement</span> mondial par IA',
    'Connect global buyers with trusted manufacturers through AI.': 'Reliez les acheteurs du monde entier à des fabricants de confiance grâce à l’IA.',
    'Verified manufacturers': 'Fabricants vérifiés',
    'Structured RFQs': 'Demandes de devis structurées',
    'End-to-end logistics': 'Logistique de bout en bout',

    /* --- product preview --- */
    'Procurement Workspace': 'Espace d’approvisionnement',
    'Live': 'En direct',
    'Need 2,400 solar street lights delivered to Lagos, Nigeria. KEBS compliance required.': 'Il me faut 2 400 lampadaires solaires livrés à Lagos, Nigeria. Conformité KEBS requise.',
    'AI Assistant': 'Assistant IA',
    'Matched <strong>14 verified suppliers</strong>. Est. lead time 21 days. Drafting RFQ with 3 shortlisted factories…': '<strong>14 fournisseurs vérifiés</strong> appariables. Délai estimé : 21 jours. Rédaction du devis avec 3 usines présélectionnées…',
    'Supplier': 'Fournisseur',
    'Match': 'Appariement',
    'Quote': 'Devis',
    'RFQ ready': 'RFQ prêt',
    '3 quotes received · 2 days early': '3 devis reçus · 2 jours en avance',

    /* --- trust + stats --- */
    'Trusted by': 'Approuvé par',
    'Trusted by sourcing teams worldwide': 'Approuvé par les équipes sourcing du monde entier',
    'Verified suppliers': 'Fournisseurs vérifiés',
    'Countries served': 'Pays desservis',
    'Average cost savings': 'Économie moyenne',
    'Avg. quote turnaround': 'Délai moyen de réponse',
    'days': 'jours',

    /* --- products --- */
    'Platform': 'Plateforme',
    'End-to-end procurement platform': 'Plateforme d’approvisionnement de bout en bout',
    'From AI sourcing to after-sales support — one connected workspace.': 'Du sourcing par IA au service après-vente — un espace de travail connecté.',
    'AI Procurement Assistant': 'Assistant d’approvisionnement IA',
    'Describe what you need in plain language. Get product recommendations, import guidance, and RFQ drafts — powered by AI.': 'Décrivez votre besoin en langage naturel. Obtenez des recommandations produit, des conseils d’importation et des devis prêts à envoyer — propulsés par l’IA.',
    'Learn more': 'En savoir plus',
    'Supplier Marketplace': 'Marché des fournisseurs',
    'Browse verified manufacturers, compare capabilities, and submit RFQs to matched suppliers worldwide.': 'Parcourez les fabricants vérifiés, comparez leurs capacités et envoyez des demandes de devis aux fournisseurs du monde entier.',
    'After-sales AI Service': 'Service après-vente IA',
    'AI-assisted diagnostics, spare parts sourcing, and warranty support — keeping your supply chain moving.': 'Diagnostic assisté par IA, sourcing de pièces détachées et gestion de garantie — votre chaîne d’approvisionnement reste en mouvement.',

    /* --- workflow --- */
    'Process': 'Processus',
    'How it works': 'Comment ça marche',
    'A streamlined six-step process from requirement to after-sales.': 'Un processus simplifié en six étapes, du besoin au service après-vente.',
    'Requirement Submission': 'Soumission de la demande',
    'Buyers describe products, quantities, and destination requirements.': 'Les acheteurs décrivent les produits, les quantités et la destination.',
    'AI Analysis': 'Analyse IA',
    'AI parses requirements, identifies specs, and flags compliance needs.': 'L’IA analyse la demande, identifie les spécifications et signale les exigences de conformité.',
    'Supplier Matching': 'Mise en relation',
    'Verified manufacturers are ranked by fit, capacity, and track record.': 'Les fabricants vérifiés sont classés selon l’adéquation, la capacité et les références.',
    'Quotation': 'Devis',
    'Structured quotes with pricing, lead times, and terms for comparison.': 'Des devis structurés avec prix, délais et conditions, pour comparer.',
    'Procurement': 'Achats',
    'Order placement, contracts, payments, and logistics coordination.': 'Commande, contrats, paiements et coordination logistique.',
    'After-sales': 'Service après-vente',
    'Ongoing support, parts, repairs, and warranty management.': 'Assistance continue, pièces, réparations et gestion des garanties.',

    /* --- case studies --- */
    'Case studies': 'Études de cas',
    'Example Procurement Scenarios': 'Scénarios d’approvisionnement illustratifs',
    'Illustrative sourcing journeys across Africa, the Middle East, and beyond.': 'Des parcours de sourcing illustratifs à travers l’Afrique, le Moyen-Orient et au-delà.',
    'Example scenarios for demonstrating the platform workflow.': 'Scénarios d’exemple pour illustrer le fonctionnement de la plateforme.',
    'Demo': 'Démo',
    'Lagos, Nigeria · Solar & Energy': 'Lagos, Nigéria · Énergie solaire',
    'Imported 2,400 solar street lights for municipal infrastructure projects across Lagos State.': 'Importation de 2 400 lampadaires solaires pour des projets d’infrastructure municipale à Lagos.',
    'Reduced sourcing cycle from 8 weeks to 3 weeks with AI-matched suppliers.': 'Cycle de sourcing réduit de 8 à 3 semaines grâce à des fournisseurs appariés par IA.',
    'Accra, Ghana · Textiles & Apparel': 'Accra, Ghana · Textile et habillement',
    'Sourced premium cotton fabrics and finished garments from vetted manufacturers in Guangdong.': 'Sourcing de tissus en coton premium et de vêtements finis auprès de fabricants validés au Guangdong.',
    'Achieved 18% cost savings through competitive multi-supplier quoting.': 'Économie de 18 % grâce à la mise en concurrence de plusieurs fournisseurs.',
    'Nairobi, Kenya · Agriculture Equipment': 'Nairobi, Kenya · Équipement agricole',
    'Procured irrigation pumps and greenhouse components for East African farming cooperatives.': 'Achat de pompes d’irrigation et de composants de serres pour des coopératives agricoles d’Afrique de l’Est.',
    'Full compliance documentation delivered for Kenya Bureau of Standards.': 'Documentation de conformité complète remise au Kenya Bureau of Standards.',
    'Dubai, UAE · Consumer Electronics': 'Dubaï, EAU · Électronique grand public',
    'Bulk procurement of smart home devices with CE and GCC certification requirements.': 'Achat en volume d’appareils domotiques avec exigences de certification CE et GCC.',
    'End-to-end logistics tracking from factory to Jebel Ali Free Zone.': 'Suivi logistique de bout en bout, de l’usine à la zone franche de Jebel Ali.',

    /* --- supplier panel --- */
    'For suppliers': 'Pour les fournisseurs',
    'Join the Global Supplier Network': 'Rejoignez le réseau mondial de fournisseurs',
    'Reach qualified buyers worldwide. Showcase your products, respond to RFQs, and grow your export business.': 'Touchez des acheteurs qualifiés dans le monde entier. Présentez vos produits, répondez aux demandes de devis et développez vos exportations.',
    'Access to verified international buyer inquiries': 'Accès aux demandes d’acheteurs internationaux vérifiés',
    'AI-powered RFQ matching based on your product catalog': 'Appariement de RFQ par IA selon votre catalogue de produits',
    'Integrated order, contract, and payment workflows': 'Workflows intégrés de commande, de contrat et de paiement',
    'After-sales support tools to retain long-term customers': 'Outils de service après-vente pour fidéliser vos clients sur la durée',
    'Multi-language communication with global buyers': 'Communication multilingue avec les acheteurs du monde entier',
    'Apply as Supplier': 'Postuler comme fournisseur',
    'Express interest': 'Manifester votre intérêt',
    'Tell us about your manufacturing capabilities. Our team will follow up within 2 business days.': 'Présentez vos capacités de fabrication. Notre équipe vous recontacte sous 2 jours ouvrés.',

    /* --- forms --- */
    'Contact name': 'Nom du contact',
    'Your name': 'Votre nom',
    'Please enter your name.': 'Veuillez saisir votre nom.',
    'Email': 'E-mail',
    'Please enter a valid email address.': 'Veuillez saisir une adresse e-mail valide.',
    'Company': 'Entreprise',
    'optional': 'facultatif',
    'Manufacturing company': 'Société de fabrication',
    'Message': 'Message',
    'Product categories, certifications, export experience...': 'Catégories de produits, certifications, expérience export…',
    'Tell us a little more — at least 10 characters.': 'Dites-en un peu plus — au moins 10 caractères.',
    'Submit application': 'Envoyer la candidature',
    'By submitting, you agree to be contacted about supplier onboarding.': 'En envoyant ce formulaire, vous acceptez d’être contacté au sujet de l’intégration fournisseur.',
    'Application received': 'Candidature reçue',
    'Thanks for your interest — our supplier team will follow up within 2 business days.': 'Merci pour votre intérêt — notre équipe fournisseurs vous recontacte sous 2 jours ouvrés.',
    'Send another message': 'Envoyer un autre message',
    'Sending…': 'Envoi…',
    'Could not submit your application.': 'Impossible d’envoyer votre candidature.',
    'Could not reach the server. Start it with: npm start': 'Impossible de joindre le serveur. Démarrez-le avec : npm start',
    'Placeholder link — that screen is outside the scope of this landing-page redesign.': 'Lien de démonstration — cet écran ne fait pas partie de cette refonte de la page d’accueil.',

    /* --- footer --- */
    'AI-powered global procurement for buyers and manufacturers.': 'Approvisionnement mondial propulsé par l’IA, pour les acheteurs et les fabricants.',
    'About': 'À propos',
    'Contact': 'Contact',
    'Legal': 'Mentions légales',
    'Privacy': 'Confidentialité',
    'Terms': 'Conditions',
    'Get started': 'Pour commencer',
    '© 2026 Global Procurement OS. All rights reserved.': '© 2026 Global Procurement OS. Tous droits réservés.',
    'Landing page redesign concept · Static HTML / CSS / JS': 'Concept de refonte de page d’accueil · HTML / CSS / JS statiques',

    /* --- auth screen --- */
    'Back to the Global Procurement OS home page': 'Retour à la page d’accueil de Global Procurement OS',
    'From requirement to after-sales, in one workspace.': 'Du besoin au service après-vente, dans un seul espace.',
    'Connect global buyers with trusted manufacturers through AI — sourcing, quotations, orders and support.': 'Reliez les acheteurs du monde entier à des fabricants de confiance grâce à l’IA — sourcing, devis, commandes et assistance.',
    'AI-drafted RFQs from a plain-language brief': 'RFQ rédigés par IA à partir d’une demande en langage naturel',
    'Verified manufacturers ranked by fit and capacity': 'Fabricants vérifiés classés par adéquation et capacité',
    'Structured quotes compared side by side': 'Devis structurés comparés côte à côte',
    'After-sales support, parts and warranty tracking': 'Service après-vente, pièces et suivi des garanties',
    'Authentication': 'Authentification',
    'Sign in': 'Se connecter',
    'Create account': 'Créer un compte',
    'Welcome back': 'Bon retour',
    'Sign in to your procurement workspace.': 'Connectez-vous à votre espace d’approvisionnement.',
    'Enter a valid email address.': 'Saisissez une adresse e-mail valide.',
    'Password': 'Mot de passe',
    'Your password': 'Votre mot de passe',
    'Enter your password.': 'Saisissez votre mot de passe.',
    'Create your account': 'Créez votre compte',
    'Set up a buyer or supplier workspace in under a minute.': 'Créez un espace acheteur ou fournisseur en moins d’une minute.',
    'Full name': 'Nom complet',
    'Enter your full name.': 'Saisissez votre nom complet.',
    'I am joining as': 'Je m’inscris en tant que',
    'Buyer — source products': 'Acheteur — sourcing de produits',
    'Supplier — sell products': 'Fournisseur — vendre des produits',
    'Company name': 'Nom de l’entreprise',
    'At least 8 characters': 'Au moins 8 caractères',
    'Password must be at least 8 characters.': 'Le mot de passe doit contenir au moins 8 caractères.',
    'Demo logins': 'Comptes de démonstration',
    'buyer': 'acheteur',
    'supplier': 'fournisseur',
    'admin': 'administrateur',
    'Something went wrong, please try again.': 'Une erreur s’est produite, veuillez réessayer.',
    'Signing in…': 'Connexion…',
    'Creating account…': 'Création du compte…',
  });

  /* ====================================================================== */
  /*  ESPAÑOL                                                                */
  /* ====================================================================== */
  Object.assign(DICT.ES, {
    /* --- document --- */
    'Global Procurement OS — AI Global Procurement Platform': 'Global Procurement OS — Plataforma global de compras impulsada por IA',
    'Connect global buyers with trusted manufacturers through AI. Source products, match suppliers, and manage procurement end-to-end.': 'Conecte compradores globales con fabricantes de confianza gracias a la IA. Encuentre productos, asocie proveedores y gestione las compras de principio a fin.',
    'Sign in — Global Procurement OS': 'Iniciar sesión — Global Procurement OS',
    'Sign in to your Global Procurement OS workspace, or create a buyer or supplier account.': 'Acceda a su espacio de trabajo de Global Procurement OS o cree una cuenta de comprador o proveedor.',

    /* --- header / navigation --- */
    'Skip to content': 'Saltar al contenido',
    'Global Procurement OS — home': 'Global Procurement OS — inicio',
    'Main navigation': 'Navegación principal',
    'Products': 'Productos',
    'Workflow': 'Flujo de trabajo',
    'Cases': 'Casos',
    'Suppliers': 'Proveedores',
    'Start Procurement': 'Iniciar compras',
    'Join Supplier Network': 'Unirse a la red de proveedores',
    'Change language': 'Cambiar idioma',
    'Language options': 'Opciones de idioma',
    'Open menu': 'Abrir menú',
    'Close menu': 'Cerrar menú',
    'Open Dashboard': 'Abrir panel',

    /* --- hero --- */
    'Enterprise-grade global sourcing': 'Abastecimiento global de nivel empresarial',
    'AI Global <span class="accent-text">Procurement</span> Platform': 'Plataforma global de <span class="accent-text">compras</span> con IA',
    'Connect global buyers with trusted manufacturers through AI.': 'Conecte compradores globales con fabricantes de confianza gracias a la IA.',
    'Verified manufacturers': 'Fabricantes verificados',
    'Structured RFQs': 'Solicitudes de cotización estructuradas',
    'End-to-end logistics': 'Logística integral',

    /* --- product preview --- */
    'Procurement Workspace': 'Espacio de compras',
    'Live': 'En vivo',
    'Need 2,400 solar street lights delivered to Lagos, Nigeria. KEBS compliance required.': 'Se necesitan 2.400 farolas solares entregadas en Lagos, Nigeria. Cumplimiento KEBS obligatorio.',
    'AI Assistant': 'Asistente de IA',
    'Matched <strong>14 verified suppliers</strong>. Est. lead time 21 days. Drafting RFQ with 3 shortlisted factories…': '<strong>14 proveedores verificados</strong> asociados. Plazo estimado: 21 días. Redactando la solicitud con 3 fábricas preseleccionadas…',
    'Supplier': 'Proveedor',
    'Match': 'Asociación',
    'Quote': 'Cotización',
    'RFQ ready': 'Solicitud lista',
    '3 quotes received · 2 days early': '3 cotizaciones recibidas · 2 días antes',

    /* --- trust + stats --- */
    'Trusted by': 'Respaldado por',
    'Trusted by sourcing teams worldwide': 'Respaldado por equipos de compras de todo el mundo',
    'Verified suppliers': 'Proveedores verificados',
    'Countries served': 'Países atendidos',
    'Average cost savings': 'Ahorro medio de costes',
    'Avg. quote turnaround': 'Tiempo medio de respuesta',
    'days': 'días',

    /* --- products --- */
    'Platform': 'Plataforma',
    'End-to-end procurement platform': 'Plataforma de compras integral',
    'From AI sourcing to after-sales support — one connected workspace.': 'Desde el abastecimiento con IA hasta el posventa — un único espacio conectado.',
    'AI Procurement Assistant': 'Asistente de compras con IA',
    'Describe what you need in plain language. Get product recommendations, import guidance, and RFQ drafts — powered by AI.': 'Describa lo que necesita en lenguaje natural. Reciba recomendaciones de productos, guía de importación y borradores de solicitud — con IA.',
    'Learn more': 'Saber más',
    'Supplier Marketplace': 'Mercado de proveedores',
    'Browse verified manufacturers, compare capabilities, and submit RFQs to matched suppliers worldwide.': 'Explore fabricantes verificados, compare capacidades y envíe solicitudes a proveedores de todo el mundo.',
    'After-sales AI Service': 'Servicio posventa con IA',
    'AI-assisted diagnostics, spare parts sourcing, and warranty support — keeping your supply chain moving.': 'Diagnóstico asistido por IA, adquisición de repuestos y soporte de garantía — su cadena de suministro sigue en marcha.',

    /* --- workflow --- */
    'Process': 'Proceso',
    'How it works': 'Cómo funciona',
    'A streamlined six-step process from requirement to after-sales.': 'Un proceso simplificado en seis pasos, del requisito a la posventa.',
    'Requirement Submission': 'Envío del requisito',
    'Buyers describe products, quantities, and destination requirements.': 'Los compradores describen productos, cantidades y requisitos de destino.',
    'AI Analysis': 'Análisis con IA',
    'AI parses requirements, identifies specs, and flags compliance needs.': 'La IA interpreta los requisitos, identifica especificaciones e indica las necesidades de cumplimiento.',
    'Supplier Matching': 'Asociación de proveedores',
    'Verified manufacturers are ranked by fit, capacity, and track record.': 'Los fabricantes verificados se ordenan por idoneidad, capacidad y trayectoria.',
    'Quotation': 'Cotización',
    'Structured quotes with pricing, lead times, and terms for comparison.': 'Cotizaciones estructuradas con precios, plazos y condiciones para comparar.',
    'Procurement': 'Compras',
    'Order placement, contracts, payments, and logistics coordination.': 'Pedidos, contratos, pagos y coordinación logística.',
    'After-sales': 'Posventa',
    'Ongoing support, parts, repairs, and warranty management.': 'Soporte continuo, repuestos, reparaciones y gestión de garantías.',

    /* --- case studies --- */
    'Case studies': 'Casos de éxito',
    'Example Procurement Scenarios': 'Escenarios de compra de ejemplo',
    'Illustrative sourcing journeys across Africa, the Middle East, and beyond.': 'Rutas de abastecimiento ilustrativas por África, Oriente Medio y más allá.',
    'Example scenarios for demonstrating the platform workflow.': 'Escenarios de ejemplo para demostrar el flujo de trabajo de la plataforma.',
    'Demo': 'Demo',
    'Lagos, Nigeria · Solar & Energy': 'Lagos, Nigeria · Energía solar',
    'Imported 2,400 solar street lights for municipal infrastructure projects across Lagos State.': 'Importación de 2.400 farolas solares para proyectos de infraestructura municipal en el estado de Lagos.',
    'Reduced sourcing cycle from 8 weeks to 3 weeks with AI-matched suppliers.': 'Ciclo de abastecimiento reducido de 8 a 3 semanas con proveedores asociados por IA.',
    'Accra, Ghana · Textiles & Apparel': 'Accra, Ghana · Textiles y confección',
    'Sourced premium cotton fabrics and finished garments from vetted manufacturers in Guangdong.': 'Tejidos de algodón premium y prendas terminadas de fabricantes validados en Guangdong.',
    'Achieved 18% cost savings through competitive multi-supplier quoting.': 'Ahorro del 18 % mediante cotizaciones competitivas de varios proveedores.',
    'Nairobi, Kenya · Agriculture Equipment': 'Nairobi, Kenia · Equipamiento agrícola',
    'Procured irrigation pumps and greenhouse components for East African farming cooperatives.': 'Adquisición de bombas de riego y componentes de invernadero para cooperativas agrícolas de África Oriental.',
    'Full compliance documentation delivered for Kenya Bureau of Standards.': 'Documentación de cumplimiento completa entregada al Kenya Bureau of Standards.',
    'Dubai, UAE · Consumer Electronics': 'Dubái, EAU · Electrónica de consumo',
    'Bulk procurement of smart home devices with CE and GCC certification requirements.': 'Compra al por mayor de dispositivos domésticos inteligentes con certificación CE y GCC.',
    'End-to-end logistics tracking from factory to Jebel Ali Free Zone.': 'Seguimiento logístico integral, de la fábrica a la Zona Franca de Jebel Ali.',

    /* --- supplier panel --- */
    'For suppliers': 'Para proveedores',
    'Join the Global Supplier Network': 'Únase a la red global de proveedores',
    'Reach qualified buyers worldwide. Showcase your products, respond to RFQs, and grow your export business.': 'Llegue a compradores cualificados de todo el mundo. Muestre sus productos, responda a solicitudes y haga crecer sus exportaciones.',
    'Access to verified international buyer inquiries': 'Acceso a consultas de compradores internacionales verificados',
    'AI-powered RFQ matching based on your product catalog': 'Asociación de solicitudes con IA según su catálogo de productos',
    'Integrated order, contract, and payment workflows': 'Flujos integrados de pedidos, contratos y pagos',
    'After-sales support tools to retain long-term customers': 'Herramientas de posventa para fidelizar a sus clientes a largo plazo',
    'Multi-language communication with global buyers': 'Comunicación multilingüe con compradores globales',
    'Apply as Supplier': 'Solicitar como proveedor',
    'Express interest': 'Mostrar interés',
    'Tell us about your manufacturing capabilities. Our team will follow up within 2 business days.': 'Cuéntenos sobre sus capacidades de fabricación. Nuestro equipo le responderá en 2 días laborables.',

    /* --- forms --- */
    'Contact name': 'Nombre de contacto',
    'Your name': 'Su nombre',
    'Please enter your name.': 'Introduzca su nombre.',
    'Email': 'Correo electrónico',
    'Please enter a valid email address.': 'Introduzca una dirección de correo válida.',
    'Company': 'Empresa',
    'optional': 'opcional',
    'Manufacturing company': 'Empresa de fabricación',
    'Message': 'Mensaje',
    'Product categories, certifications, export experience...': 'Categorías de productos, certificaciones, experiencia exportadora…',
    'Tell us a little more — at least 10 characters.': 'Cuéntenos un poco más — al menos 10 caracteres.',
    'Submit application': 'Enviar solicitud',
    'By submitting, you agree to be contacted about supplier onboarding.': 'Al enviar, acepta que le contactemos sobre la incorporación como proveedor.',
    'Application received': 'Solicitud recibida',
    'Thanks for your interest — our supplier team will follow up within 2 business days.': 'Gracias por su interés — nuestro equipo de proveedores le responderá en 2 días laborables.',
    'Send another message': 'Enviar otro mensaje',
    'Sending…': 'Enviando…',
    'Could not submit your application.': 'No se pudo enviar su solicitud.',
    'Could not reach the server. Start it with: npm start': 'No se pudo conectar con el servidor. Iníquelo con: npm start',
    'Placeholder link — that screen is outside the scope of this landing-page redesign.': 'Enlace de demostración — esa pantalla queda fuera del alcance de este rediseño de la página de inicio.',

    /* --- footer --- */
    'AI-powered global procurement for buyers and manufacturers.': 'Compras globales con IA para compradores y fabricantes.',
    'About': 'Acerca de',
    'Contact': 'Contacto',
    'Legal': 'Aviso legal',
    'Privacy': 'Privacidad',
    'Terms': 'Condiciones',
    'Get started': 'Empezar',
    '© 2026 Global Procurement OS. All rights reserved.': '© 2026 Global Procurement OS. Todos los derechos reservados.',
    'Landing page redesign concept · Static HTML / CSS / JS': 'Concepto de rediseño de página de inicio · HTML / CSS / JS estáticos',

    /* --- auth screen --- */
    'Back to the Global Procurement OS home page': 'Volver a la página de inicio de Global Procurement OS',
    'From requirement to after-sales, in one workspace.': 'Del requisito a la posventa, en un solo espacio de trabajo.',
    'Connect global buyers with trusted manufacturers through AI — sourcing, quotations, orders and support.': 'Conecte compradores globales con fabricantes de confianza gracias a la IA — abastecimiento, cotizaciones, pedidos y soporte.',
    'AI-drafted RFQs from a plain-language brief': 'Solicitudes redactadas con IA a partir de una descripción normal',
    'Verified manufacturers ranked by fit and capacity': 'Fabricantes verificados ordenados por idoneidad y capacidad',
    'Structured quotes compared side by side': 'Cotizaciones estructuradas comparadas lado a lado',
    'After-sales support, parts and warranty tracking': 'Soporte posventa, repuestos y seguimiento de garantías',
    'Authentication': 'Autenticación',
    'Sign in': 'Iniciar sesión',
    'Create account': 'Crear cuenta',
    'Welcome back': 'Bienvenido de nuevo',
    'Sign in to your procurement workspace.': 'Acceda a su espacio de compras.',
    'Enter a valid email address.': 'Introduzca una dirección de correo válida.',
    'Password': 'Contraseña',
    'Your password': 'Su contraseña',
    'Enter your password.': 'Introduzca su contraseña.',
    'Create your account': 'Cree su cuenta',
    'Set up a buyer or supplier workspace in under a minute.': 'Cree un espacio de comprador o proveedor en menos de un minuto.',
    'Full name': 'Nombre completo',
    'Enter your full name.': 'Introduzca su nombre completo.',
    'I am joining as': 'Me registro como',
    'Buyer — source products': 'Comprador — buscar productos',
    'Supplier — sell products': 'Proveedor — vender productos',
    'Company name': 'Nombre de la empresa',
    'At least 8 characters': 'Al menos 8 caracteres',
    'Password must be at least 8 characters.': 'La contraseña debe tener al menos 8 caracteres.',
    'Demo logins': 'Cuentas de demostración',
    'buyer': 'comprador',
    'supplier': 'proveedor',
    'admin': 'administrador',
    'Something went wrong, please try again.': 'Algo salió mal, inténtelo de nuevo.',
    'Signing in…': 'Iniciando sesión…',
    'Creating account…': 'Creando cuenta…',
  });

  /* ====================================================================== */
  /*  中文（简体）                                                             */
  /* ====================================================================== */
  Object.assign(DICT.ZH, {
    /* --- document --- */
    'Global Procurement OS — AI Global Procurement Platform': 'Global Procurement OS — 人工智能全球采购平台',
    'Connect global buyers with trusted manufacturers through AI. Source products, match suppliers, and manage procurement end-to-end.': '通过人工智能连接全球买家与可信赖的制造商。寻找产品、匹配供应商，端到端管理采购全流程。',
    'Sign in — Global Procurement OS': '登录 — Global Procurement OS',
    'Sign in to your Global Procurement OS workspace, or create a buyer or supplier account.': '登录您的 Global Procurement OS 工作台，或创建买家/供应商账户。',

    /* --- header / navigation --- */
    'Skip to content': '跳转到主要内容',
    'Global Procurement OS — home': 'Global Procurement OS — 首页',
    'Main navigation': '主导航',
    'Products': '产品',
    'Workflow': '流程',
    'Cases': '案例',
    'Suppliers': '供应商',
    'Start Procurement': '开始采购',
    'Join Supplier Network': '加入供应商网络',
    'Change language': '切换语言',
    'Language options': '语言选项',
    'Open menu': '打开菜单',
    'Close menu': '关闭菜单',
    'Open Dashboard': '打开控制台',

    /* --- hero --- */
    'Enterprise-grade global sourcing': '企业级全球采购',
    'AI Global <span class="accent-text">Procurement</span> Platform': '人工智能<span class="accent-text">全球采购</span>平台',
    'Connect global buyers with trusted manufacturers through AI.': '通过人工智能连接全球买家与可信赖的制造商。',
    'Verified manufacturers': '认证制造商',
    'Structured RFQs': '结构化询价单',
    'End-to-end logistics': '端到端物流',

    /* --- product preview --- */
    'Procurement Workspace': '采购工作台',
    'Live': '实时',
    'Need 2,400 solar street lights delivered to Lagos, Nigeria. KEBS compliance required.': '需要 2,400 盏太阳能路灯运抵尼日利亚拉各斯，须符合 KEBS 标准。',
    'AI Assistant': '人工智能助手',
    'Matched <strong>14 verified suppliers</strong>. Est. lead time 21 days. Drafting RFQ with 3 shortlisted factories…': '已匹配 <strong>14 家认证供应商</strong>，预计交期 21 天。正在为 3 家入围工厂起草询价单…',
    'Supplier': '供应商',
    'Match': '匹配',
    'Quote': '报价',
    'RFQ ready': '询价单就绪',
    '3 quotes received · 2 days early': '已收到 3 份报价 · 提前 2 天',

    /* --- trust + stats --- */
    'Trusted by': '信赖伙伴',
    'Trusted by sourcing teams worldwide': '获全球采购团队信赖',
    'Verified suppliers': '认证供应商',
    'Countries served': '服务国家/地区',
    'Average cost savings': '平均成本节约',
    'Avg. quote turnaround': '平均报价周期',
    'days': '天',

    /* --- products --- */
    'Platform': '平台',
    'End-to-end procurement platform': '端到端采购平台',
    'From AI sourcing to after-sales support — one connected workspace.': '从人工智能寻源到售后服务——一体化互联工作台。',
    'AI Procurement Assistant': '人工智能采购助手',
    'Describe what you need in plain language. Get product recommendations, import guidance, and RFQ drafts — powered by AI.': '用日常语言描述您的需求，即可获得产品推荐、进口指引与询价单草稿——由人工智能驱动。',
    'Learn more': '了解更多',
    'Supplier Marketplace': '供应商市场',
    'Browse verified manufacturers, compare capabilities, and submit RFQs to matched suppliers worldwide.': '浏览认证制造商，比较产能，并向全球匹配的供应商提交询价单。',
    'After-sales AI Service': '人工智能售后服务',
    'AI-assisted diagnostics, spare parts sourcing, and warranty support — keeping your supply chain moving.': '智能诊断、备件采购与保修支持——让您的供应链持续运转。',

    /* --- workflow --- */
    'Process': '流程',
    'How it works': '运作方式',
    'A streamlined six-step process from requirement to after-sales.': '从需求到售后的六步精简流程。',
    'Requirement Submission': '提交需求',
    'Buyers describe products, quantities, and destination requirements.': '买家描述产品、数量及目的地要求。',
    'AI Analysis': '人工智能分析',
    'AI parses requirements, identifies specs, and flags compliance needs.': '人工智能解析需求、识别规格，并标注合规要求。',
    'Supplier Matching': '供应商匹配',
    'Verified manufacturers are ranked by fit, capacity, and track record.': '按匹配度、产能与历史记录对认证制造商进行排名。',
    'Quotation': '报价',
    'Structured quotes with pricing, lead times, and terms for comparison.': '包含价格、交期与条款的结构化报价，便于对比。',
    'Procurement': '采购执行',
    'Order placement, contracts, payments, and logistics coordination.': '下单、合同、付款与物流协调。',
    'After-sales': '售后服务',
    'Ongoing support, parts, repairs, and warranty management.': '持续支持、备件、维修与保修管理。',

    /* --- case studies --- */
    'Case studies': '客户案例',
    'Example Procurement Scenarios': '采购场景示例',
    'Illustrative sourcing journeys across Africa, the Middle East, and beyond.': '覆盖非洲、中东等地区的采购旅程示例。',
    'Example scenarios for demonstrating the platform workflow.': '用于演示平台工作流的示例场景。',
    'Demo': '演示',
    'Lagos, Nigeria · Solar & Energy': '尼日利亚拉各斯 · 太阳能与能源',
    'Imported 2,400 solar street lights for municipal infrastructure projects across Lagos State.': '为拉各斯州市政基础设施项目进口 2,400 盏太阳能路灯。',
    'Reduced sourcing cycle from 8 weeks to 3 weeks with AI-matched suppliers.': '通过人工智能匹配供应商，将采购周期从 8 周缩短至 3 周。',
    'Accra, Ghana · Textiles & Apparel': '加纳阿克拉 · 纺织与服装',
    'Sourced premium cotton fabrics and finished garments from vetted manufacturers in Guangdong.': '从广东经过审核的制造商采购优质棉布与成衣。',
    'Achieved 18% cost savings through competitive multi-supplier quoting.': '通过多家供应商竞争性报价实现 18% 成本节约。',
    'Nairobi, Kenya · Agriculture Equipment': '肯尼亚内罗毕 · 农业设备',
    'Procured irrigation pumps and greenhouse components for East African farming cooperatives.': '为东非农业合作社采购灌溉水泵与温室部件。',
    'Full compliance documentation delivered for Kenya Bureau of Standards.': '向肯尼亚标准局交付完整合规文件。',
    'Dubai, UAE · Consumer Electronics': '阿联酋迪拜 · 消费电子',
    'Bulk procurement of smart home devices with CE and GCC certification requirements.': '批量采购智能家居设备，满足 CE 与 GCC 认证要求。',
    'End-to-end logistics tracking from factory to Jebel Ali Free Zone.': '从工厂到杰贝阿里自由区的端到端物流跟踪。',

    /* --- supplier panel --- */
    'For suppliers': '供应商专区',
    'Join the Global Supplier Network': '加入全球供应商网络',
    'Reach qualified buyers worldwide. Showcase your products, respond to RFQs, and grow your export business.': '触达全球优质买家。展示产品、响应询价，拓展出口业务。',
    'Access to verified international buyer inquiries': '获取认证国际买家的采购询盘',
    'AI-powered RFQ matching based on your product catalog': '基于产品目录的人工智能询价匹配',
    'Integrated order, contract, and payment workflows': '订单、合同与支付一体化流程',
    'After-sales support tools to retain long-term customers': '售后服务工具，留住长期客户',
    'Multi-language communication with global buyers': '与全球买家的多语言沟通',
    'Apply as Supplier': '申请成为供应商',
    'Express interest': '表达意向',
    'Tell us about your manufacturing capabilities. Our team will follow up within 2 business days.': '请介绍您的生产能力，我们团队将在 2 个工作日内回复。',

    /* --- forms --- */
    'Contact name': '联系人姓名',
    'Your name': '您的姓名',
    'Please enter your name.': '请输入您的姓名。',
    'Email': '电子邮箱',
    'Please enter a valid email address.': '请输入有效的电子邮箱地址。',
    'Company': '公司',
    'optional': '选填',
    'Manufacturing company': '制造企业',
    'Message': '留言',
    'Product categories, certifications, export experience...': '产品类别、认证、出口经验……',
    'Tell us a little more — at least 10 characters.': '请再多写一些——至少 10 个字符。',
    'Submit application': '提交申请',
    'By submitting, you agree to be contacted about supplier onboarding.': '提交即表示您同意我们就供应商入驻与您联系。',
    'Application received': '申请已收到',
    'Thanks for your interest — our supplier team will follow up within 2 business days.': '感谢您的关注——我们的供应商团队将在 2 个工作日内与您联系。',
    'Send another message': '再发一条留言',
    'Sending…': '发送中…',
    'Could not submit your application.': '无法提交您的申请。',
    'Could not reach the server. Start it with: npm start': '无法连接服务器，请运行：npm start',
    'Placeholder link — that screen is outside the scope of this landing-page redesign.': '占位链接——该页面不属于本次首页改版范围。',

    /* --- footer --- */
    'AI-powered global procurement for buyers and manufacturers.': '为买家与制造商提供人工智能驱动的全球采购。',
    'About': '关于我们',
    'Contact': '联系我们',
    'Legal': '法律声明',
    'Privacy': '隐私政策',
    'Terms': '服务条款',
    'Get started': '立即开始',
    '© 2026 Global Procurement OS. All rights reserved.': '© 2026 Global Procurement OS。保留所有权利。',
    'Landing page redesign concept · Static HTML / CSS / JS': '首页改版概念 · 静态 HTML / CSS / JS',

    /* --- auth screen --- */
    'Back to the Global Procurement OS home page': '返回 Global Procurement OS 首页',
    'From requirement to after-sales, in one workspace.': '从需求到售后，尽在一个工作台。',
    'Connect global buyers with trusted manufacturers through AI — sourcing, quotations, orders and support.': '通过人工智能连接全球买家与可信赖的制造商——寻源、报价、订单与支持。',
    'AI-drafted RFQs from a plain-language brief': '用自然语言描述即可生成人工智能询价单',
    'Verified manufacturers ranked by fit and capacity': '按匹配度与产能排名的认证制造商',
    'Structured quotes compared side by side': '结构化报价并排对比',
    'After-sales support, parts and warranty tracking': '售后支持、备件与保修跟踪',
    'Authentication': '身份认证',
    'Sign in': '登录',
    'Create account': '创建账户',
    'Welcome back': '欢迎回来',
    'Sign in to your procurement workspace.': '登录您的采购工作台。',
    'Enter a valid email address.': '请输入有效的电子邮箱地址。',
    'Password': '密码',
    'Your password': '您的密码',
    'Enter your password.': '请输入密码。',
    'Create your account': '创建您的账户',
    'Set up a buyer or supplier workspace in under a minute.': '一分钟内创建买家或供应商工作台。',
    'Full name': '姓名',
    'Enter your full name.': '请输入您的姓名。',
    'I am joining as': '我的身份是',
    'Buyer — source products': '买家 — 寻源采购',
    'Supplier — sell products': '供应商 — 销售产品',
    'Company name': '公司名称',
    'At least 8 characters': '至少 8 个字符',
    'Password must be at least 8 characters.': '密码至少需要 8 个字符。',
    'Demo logins': '演示账户',
    'buyer': '买家',
    'supplier': '供应商',
    'admin': '管理员',
    'Something went wrong, please try again.': '出了点问题，请重试。',
    'Signing in…': '登录中…',
    'Creating account…': '创建账户中…',
  });

  /* ------------------------------------------------------------------ boot */
  apply();
  bindLangMenu();
})();
