# QA Turgus – mokomoji parduotuvė Playwright testams

Internetinė parduotuvė, sukurta mokytis testų automatizavimo su Playwright: UI testai (Page Object Model,
fixtures, `storageState`, tinklo mockinimas) ir **API testai** (`request` fixture).

| Dalis | Technologija | Kur veikia |
| --- | --- | --- |
| Svetainė (frontend) | HTML + CSS + JavaScript, be build žingsnio | GitHub Pages: https://edgardinnno.github.io/qa-turgus/ |
| REST API (backend) | [Hono](https://hono.dev) + Cloudflare Workers | `https://qa-turgus-api.<subdomenas>.workers.dev` |
| Duomenų bazė | Cloudflare D1 (SQLite) | Cloudflare |
| API dokumentacija | OpenAPI 3.1 + Swagger UI | `<API adresas>/docs` |

Vartotojai, krepšeliai, užsakymai ir atsiliepimai saugomi serverio duomenų bazėje. Naršyklėje lieka tik
sesijos token (slapukas `qa_session`), vartotojo kopija (`localStorage.qa_user`) ir neprisijungusio svečio krepšelis.

---

## Paleidimas lokaliai

Reikia Node.js 20+.

**1. API** (pirmą kartą – `npm install`):

```bash
cd api && npm install && npm run dev
```

API veiks adresu http://localhost:8787 (dokumentacija – http://localhost:8787/docs). Lokali duomenų bazė
sukuriama automatiškai aplanke `api/.wrangler/`.

**2. Svetainė** (kitame terminale, projekto šakniniame aplanke):

```bash
npx serve . -l 5500
```

Atidarykite http://localhost:5500. Puslapis, atidarytas per `localhost`, pats jungiasi prie lokalaus API
(`js/config.js`). Norėdami lokalią svetainę nukreipti į internetinį API, naršyklės konsolėje įvykdykite:
`localStorage.setItem('qa_api_url', 'https://…workers.dev/api')`.

**Lokalios DB išvalymas:** ištrinkite `api/.wrangler/` ir vėl paleiskite `npm run dev`.

---

## Testiniai duomenys

### Demo vartotojai (slaptažodis visiems: `Slaptas123!`)

| El. paštas | Elgsena |
| --- | --- |
| `standartinis@test.lt` | Įprastas vartotojas |
| `uzblokuotas@test.lt` | Prisijungimas → 403 `ACCOUNT_LOCKED` |
| `letas@test.lt` | Kiekvienas API atsakymas vėluoja 2,5–4 s (timeout'ų praktikai) |
| `klaidingas@test.lt` | `POST /orders` visada → 500 `SERVER_ERROR` |

⚠️ **Demo paskyros bendros visiems**: jų profilio, slaptažodžio keisti ar paskyros ištrinti negalima
(403 `DEMO_ACCOUNT`), o krepšelį vienu metu gali keisti keli žmonės. **Patikimiems testams registruokite savo
vartotoją** (pvz. fixture'e per `POST /api/auth/register` su unikaliu el. paštu) ir po testo ištrinkite
(`DELETE /api/users/me`). Neištrinti testiniai vartotojai automatiškai pašalinami po 30 dienų.

### Nuolaidos kodai (nejautrūs raidžių dydžiui)

| Kodas | Rezultatas | API atsakymas klaidos atveju |
| --- | --- | --- |
| `PLAYWRIGHT10` | -10 % visam krepšeliui | – |
| `DIDELIS20` | -20 % nuo 100 € | 422 `PROMO_MIN_AMOUNT` |
| `NEMOKAMAS` | Nemokamas pristatymas | – |
| `SENAS2024` | – | 410 `PROMO_EXPIRED` |
| bet kas kita | – | 404 `PROMO_NOT_FOUND` |

### Testinės kortelės

| Numeris | Rezultatas |
| --- | --- |
| `4242 4242 4242 4242` | Sėkmingas mokėjimas |
| `4000 0000 0000 0002` | 402 `PAYMENT_DECLINED` – „Kortelė atmesta“ |
| `4000 0000 0000 9995` | 402 `PAYMENT_DECLINED` – „Nepakanka lėšų“ |
| `1234 5678 9012 3456` | 422 – neteisingas numeris (Luhn) |

Galiojimo data – bet kuri ateities data (`MM/YY`), CVC – bet kurie 3 skaitmenys.

### Kainos ir pristatymas

- Kurjeris 4,99 €, paštomatas 2,99 €, atsiėmimas parduotuvėje – nemokamai. Nuo 50 € (po nuolaidos) – nemokamai.
- Grynaisiais negalima mokėti pasirinkus paštomatą.
- Sandėlio likutis nemažėja (kitaip bendras serveris greitai „išparduotų“ prekes), bet į krepšelį daugiau nei
  likutis įsidėti negalima (409 `OUT_OF_STOCK`).

---

## REST API

Pilna interaktyvi dokumentacija su pavyzdžiais – **`/docs`** (Swagger UI), specifikacija – `/openapi.json`.

### Autentifikacija

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "standartinis@test.lt", "password": "Slaptas123!", "remember": false }
```

Atsakyme gausite `token`. Jį siųskite kiekvienoje užklausoje, kuriai reikia prisijungimo:

```http
Authorization: Bearer <token>
```

Token galioja 24 val. (`remember: true` – 7 dienas). `POST /api/auth/logout` jį panaikina.

### Endpoint'ai

| Metodas | Kelias | 🔒 | Aprašymas |
| --- | --- | --- | --- |
| GET | `/api/health` | | Serverio būsena |
| GET | `/api/config` | | Pristatymo būdai, paštomatai, parduotuvės, bankai |
| POST | `/api/auth/register` | | Registracija → 201 / 409 `EMAIL_TAKEN` / 422 |
| POST | `/api/auth/login` | | Prisijungimas → 200 token / 401 / 403 |
| POST | `/api/auth/logout` | 🔒 | Atsijungimas → 204 |
| GET | `/api/users/me` | 🔒 | Mano duomenys |
| PATCH | `/api/users/me` | 🔒 | Profilio keitimas (`firstName`, `lastName`, `phone`, `newsletter`) |
| PUT | `/api/users/me/password` | 🔒 | Slaptažodžio keitimas → 204 / 400 `WRONG_PASSWORD` |
| DELETE | `/api/users/me` | 🔒 | Paskyros ištrynimas → 204 |
| GET | `/api/categories` | | Kategorijos |
| GET | `/api/products` | | `?q=&category=&sort=&inStock=true&page=1&limit=20` |
| GET | `/api/products/{id}` | | Prekė → 200 / 404 |
| GET | `/api/products/{id}/reviews` | | Atsiliepimai |
| POST | `/api/products/{id}/reviews` | 🔒 | Naujas atsiliepimas → 201 / 409 `REVIEW_EXISTS` |
| POST | `/api/promo-codes/validate` | | Kodo patikra be prisijungimo |
| GET | `/api/cart` | 🔒 | Krepšelis su sumomis |
| DELETE | `/api/cart` | 🔒 | Išvalyti → 204 |
| POST | `/api/cart/items` | 🔒 | Įdėti `{productId, quantity, size?, color?}` → 201 |
| PATCH | `/api/cart/items/{itemId}` | 🔒 | Pakeisti kiekį |
| DELETE | `/api/cart/items/{itemId}` | 🔒 | Pašalinti eilutę |
| POST | `/api/cart/promo` | 🔒 | Pritaikyti kodą |
| DELETE | `/api/cart/promo` | 🔒 | Pašalinti kodą |
| GET | `/api/orders` | 🔒 | Mano užsakymai |
| POST | `/api/orders` | 🔒 | Pateikti užsakymą iš krepšelio → 201 / 402 / 422 / 500 |
| GET | `/api/orders/{id}` | 🔒 | Užsakymas → 200 / 404 (svetimas irgi 404) |
| POST | `/api/orders/{id}/cancel` | 🔒 | Atšaukti → 200 / 409 `ORDER_NOT_CANCELLABLE` |
| POST | `/api/contact-messages` | | Kontaktų forma → 201 `{ticket}` |

### Klaidų formatas

Visos klaidos grąžinamos vienodai, todėl jas patogu tikrinti testuose:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Užklausoje yra klaidų. Žr. details.",
    "details": { "email": "Neteisingas el. pašto formatas.", "address.city": "Įveskite miestą." }
  }
}
```

| Statusas | Kada |
| --- | --- |
| 400 | Neteisingas JSON (`INVALID_JSON`), neteisingas dabartinis slaptažodis |
| 401 | Nėra / netinkamas / pasibaigęs token (`UNAUTHORIZED`, `INVALID_TOKEN`, `SESSION_EXPIRED`), blogi prisijungimo duomenys |
| 402 | Kortelė atmesta |
| 403 | Užblokuota paskyra, demo paskyros keitimas |
| 404 | Nerastas resursas arba maršrutas |
| 409 | Konfliktas: el. paštas užimtas, nepakanka sandėlyje, kodas jau pritaikytas, atsiliepimas jau parašytas |
| 410 | Nuolaidos kodas nebegalioja |
| 422 | Validacijos klaidos (`details` – laukas → pranešimas) |
| 500 | `klaidingas@test.lt` užsakymas |

### API testo pavyzdys (Playwright)

```ts
import { test, expect } from '@playwright/test';

test('registracija ir prisijungimas per API', async ({ request }) => {
  const email = `test-${Date.now()}@pavyzdys.lt`;
  const reg = await request.post('/api/auth/register', {
    data: { firstName: 'Testas', lastName: 'Testaitis', email, birthDate: '1995-06-01', country: 'LT', password: 'Testas123!' },
  });
  expect(reg.status()).toBe(201);

  const login = await request.post('/api/auth/login', { data: { email, password: 'Testas123!' } });
  const { token } = await login.json();

  const me = await request.get('/api/users/me', { headers: { Authorization: `Bearer ${token}` } });
  expect((await me.json()).user.email).toBe(email);

  await request.delete('/api/users/me', { headers: { Authorization: `Bearer ${token}` } });
});
```

`playwright.config.ts`: `use: { baseURL: 'https://qa-turgus-api.<subdomenas>.workers.dev' }`
(API testams) ir `https://edgardinnno.github.io/qa-turgus/` (UI testams – santykiniai keliai be pradinio `/`).

### Greitas prisijungimas UI testuose per API

Užuot kiekviename teste pildę prisijungimo formą, galite prisijungti per API ir paruošti naršyklę:

```ts
const { token, user } = await (await request.post(`${API}/auth/login`, { data: { email, password } })).json();
await context.addCookies([{ name: 'qa_session', value: token, url: 'https://edgardinnno.github.io' }]);
await context.addInitScript((u) => localStorage.setItem('qa_user', JSON.stringify(u)), user);
```

Arba prisijunkite vieną kartą `setup` projekte ir išsaugokite `storageState`.

---

## Ką galima praktikuoti

| Playwright tema | Kur |
| --- | --- |
| Page Object Model | Kiekvienas puslapis turi aiškią struktūrą ir `data-testid` |
| `getByRole` / `getByLabel` / `getByTestId` | Visi laukai turi `<label>`, `data-testid` beveik visur |
| API testai (`request`) | Visas REST API: CRUD, autentifikacija, validacija, klaidų kodai |
| UI + API kartu | Sukurkite duomenis per API, patikrinkite UI (ir atvirkščiai) |
| Fixtures + `storageState` | Sesija – slapukas `qa_session` + `localStorage.qa_user` |
| `page.route()` | Mockinkite `**/api/products**` – grąžinkite 1 prekę, 500 arba `route.abort()` (yra „Bandyti dar kartą“) |
| `waitForResponse()` | Pvz. palaukite `POST /api/cart/items` po „Į krepšelį“ paspaudimo |
| Timeout'ai, laukimas | `letas@test.lt` – 2,5–4 s kiekvienam atsakymui |
| `page.on('dialog')` | „Išvalyti krepšelį“ naudoja naršyklės `confirm()` |
| Modalinis langas | Prekės šalinimas, užsakymo atšaukimas (`data-testid="confirm-dialog"`) |
| `page.addLocatorHandler()` | Slapukų juosta pasirodo po ~0,8 s |
| `setInputFiles()` | Kontaktų formos priedas |
| `fill()` vs `pressSequentially()` | Kortelės numeris ir galiojimo data formatuojami automatiškai |
| Parametrizuoti testai | Nuolaidų kodai, testinės kortelės, validacijos klaidos |

### Užduočių idėjos

**UI:**
1. Prisijungimas: sėkmingas, neteisingas slaptažodis, užblokuotas vartotojas, tušti laukai.
2. Registracija: visos validacijos klaidos, jaunesnis nei 18 m., užimtas el. paštas → sėkminga registracija.
3. Svečio krepšelis išlieka prisijungus.
4. Pilnas pirkimas „end-to-end“ → užsakymas matomas paskyroje.

**API:**
5. Visi `POST /auth/register` validacijos atvejai (parametrizuotas testas su `details` tikrinimu).
6. Endpoint'ai su 🔒 be token → 401; su svetimo vartotojo užsakymo ID → 404.
7. Krepšelio sumų skaičiavimas su kiekvienu nuolaidos kodu ir pristatymo būdu.
8. `GET /products`: rikiavimas, puslapiavimas (`total`, `pages`), neteisingi parametrai → 422.
9. JSON schemos tikrinimas pagal `/openapi.json`.

**Kombinuoti:**
10. Sukurkite vartotoją ir užsakymą per API → patikrinkite UI paskyros puslapyje → ištrinkite per API.

### Rekomenduojama struktūra

```
tests/
  fixtures.ts           ← test.extend({ api, testUser, loggedInPage, … })
  api/
    ApiClient.ts        ← request apvalkalas su token
    auth.spec.ts, cart.spec.ts, orders.spec.ts, products.spec.ts
  ui/
    pages/              ← LoginPage, CatalogPage, CartPage, CheckoutPage, …
    components/         ← Header, ConfirmDialog, CookieBanner
    *.spec.ts
```

---

## Talpinimas internete

### Svetainė – GitHub Pages

Kiekvienas `git push` į `main` šaką automatiškai atnaujina https://edgardinnno.github.io/qa-turgus/.
API adresas internete nurodytas `js/config.js` (`PRODUCTION_API`).

### API – Cloudflare Workers

Vieną kartą:

```bash
cd api && npx wrangler login
npx wrangler d1 create qa-turgus-db
```

Gautą `database_id` įrašykite į `api/wrangler.toml`. Tada:

```bash
npm run db:migrate:remote && npm run deploy
```

Atnaujinant API pakanka `npm run deploy` (pakeitus DB schemą – pirmiausia `npm run db:migrate:remote`).
Pakeitus `data/products.json`, sugeneruokite naują seed failą (`npm run seed`) ir sukurkite naują migraciją.

---

## Failų struktūra

```
index.html, product.html, login.html, register.html, cart.html,
checkout.html, order.html, account.html, contact.html
css/styles.css
js/config.js          ← API adresas (lokalus / internetinis)
js/core.js            ← API klientas, autentifikacija, krepšelis, validacija, UI komponentai
js/pages/*.js         ← kiekvieno puslapio logika
data/products.json    ← prekių katalogas (iš jo generuojamas DB seed)
api/
  src/index.ts        ← maršrutai, klaidų tvarkymas, CORS, nakties valymas
  src/routes/         ← auth, users, products, cart, orders
  src/lib/            ← validacija, slaptažodžių hash'avimas, verslo taisyklės
  src/openapi.ts      ← OpenAPI specifikacija ir /docs
  migrations/         ← DB schema ir pradiniai duomenys
  wrangler.toml       ← Cloudflare konfigūracija
```

> Tai mokomasis projektas. Nenaudokite tikrų slaptažodžių, asmens ar kortelės duomenų.
