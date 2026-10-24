// API adresas. Lokaliai (localhost) naudojamas `cd api && npm run dev` serveris, internete – Cloudflare Workers.
// Norėdami lokalų puslapį nukreipti į kitą API: localStorage.setItem('qa_api_url', 'https://…/api')
(function () {
  const LOCAL_API = 'http://localhost:8787/api';
  const PRODUCTION_API = 'https://qa-turgus-api.qa-turgus-api.workers.dev/api';
  let override = null;
  try {
    override = localStorage.getItem('qa_api_url');
  } catch (e) { /* ignoruojame */ }
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  window.QA_CONFIG = { API_URL: override || (isLocal ? LOCAL_API : PRODUCTION_API) };
})();
