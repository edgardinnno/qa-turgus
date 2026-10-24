# QA Turgus – mokomoji parduotuvė Playwright testams

Statinė internetinė parduotuvė (HTML + CSS + JavaScript, be jokio backend), sukurta mokytis testų
automatizavimo su Playwright: Page Object Model, fixtures, `storageState`, tinklo užklausų mockinimas ir t. t.

Visi duomenys („duomenų bazė“) saugomi naršyklėje: vartotojai, krepšeliai ir užsakymai – `localStorage`,
sesija – slapuke `qa_session`. Kiekvienas Playwright `context` gauna švarią naršyklę, todėl testai vienas kitam netrukdo.

## Paleidimas

Puslapis kraunamas per `fetch()`, todėl jį reikia atidaryti per serverį (ne `file://`):

```bash
npx serve .
```

arba

```bash
python3 -m http.server 8080
```

### Patalpinimas internete

Tiesiog įkelkite visą aplanką į bet kurį statinį hostingą – jokio build žingsnio nėra:

- **GitHub Pages** – įkelkite į repozitoriją → Settings → Pages → „Deploy from branch“.
- **Netlify / Cloudflare Pages / Vercel** – nutempkite aplanką arba prijunkite repozitoriją (build komanda – tuščia).

Visos nuorodos santykinės, todėl veikia ir subkataloge (pvz. `vartotojas.github.io/qa-turgus/`).

## Puslapiai

| URL | Kas ten |
| --- | --- |
| `index.html` | Katalogas: paieška, kategorijos, rikiavimas, „tik turimos“, puslapiavimas (būsena saugoma URL: `?q=&cat=&sort=&stock=1&page=2`) |
| `product.html?id=p1` | Prekė: spalva (radio), dydis (select), kiekis, skirtukai, atsiliepimai, susijusios prekės |
| `login.html` | Prisijungimas, „Prisiminti mane“, `?redirect=` grąžinimas atgal |
| `register.html` | Registracija su validacija, slaptažodžio stiprumo indikatoriumi |
| `cart.html` | Krepšelis: kiekis, šalinimas, nuolaidos kodai, nemokamo pristatymo juosta |
| `checkout.html` | 4 žingsnių apmokėjimas (reikia prisijungti) |
| `order.html?id=ORD-123456` | Užsakymo patvirtinimas, atšaukimas |
| `account.html#profile` / `#password` / `#orders` | Profilis, slaptažodžio keitimas, užsakymų istorija |
| `contact.html` | Kontaktų forma su failo įkėlimu, DUK (accordion) |

## Testiniai duomenys

### Vartotojai (slaptažodis visiems: `Slaptas123!`)

| El. paštas | Elgsena |
| --- | --- |
| `standartinis@test.lt` | Įprastas vartotojas |
| `uzblokuotas@test.lt` | Paskyra užblokuota – prisijungimas nepavyksta |
| `letas@test.lt` | Visos „API“ užklausos trunka 2,5–4 s (timeout'ų ir laukimo praktikai) |
| `klaidingas@test.lt` | Užsakymo pateikimas visada baigiasi „Serverio klaida (500)“ |

Galite registruoti ir naujus vartotojus – jie gyvena tik toje naršyklėje.

### Nuolaidos kodai

| Kodas | Rezultatas |
| --- | --- |
| `PLAYWRIGHT10` | -10 % visam krepšeliui |
| `DIDELIS20` | -20 %, bet tik nuo 100 € (sumažinus krepšelį – kodas tampa negaliojantis) |
| `NEMOKAMAS` | Nemokamas pristatymas |
| `SENAS2024` | Klaida „galiojimas pasibaigęs“ |
| bet kas kita | Klaida „kodas neegzistuoja“ |

Kodai nejautrūs raidžių dydžiui.

### Testinės kortelės

| Numeris | Rezultatas |
| --- | --- |
| `4242 4242 4242 4242` | Sėkmingas mokėjimas |
| `4000 0000 0000 0002` | „Kortelė atmesta“ |
| `4000 0000 0000 9995` | „Nepakanka lėšų“ |
| `1234 5678 9012 3456` | Validacijos klaida (neteisingas Luhn) |

Galiojimo data – bet kuri ateities data (`MM/YY`), CVC – bet kurie 3 skaitmenys.

### Kainos ir pristatymas

- Kurjeris 4,99 €, paštomatas 2,99 €, atsiėmimas parduotuvėje – nemokamai.
- Nuo 50 € (po nuolaidos) pristatymas nemokamas.
- Mokėti grynaisiais negalima pasirinkus paštomatą.
- Kainų formatas: `14,99 €` (paprastas tarpas). Kainos elementai turi ir `data-value="14.99"`.

## Ką galima praktikuoti

| Playwright tema | Kur |
| --- | --- |
| Page Object Model | Kiekvienas puslapis turi aiškią struktūrą ir `data-testid` |
| `getByRole` / `getByLabel` | Visi laukai turi `<label>`, mygtukai – prasmingus pavadinimus |
| `getByTestId` | `data-testid` beveik visur (`login-email`, `add-to-cart`, `cart-item`, `summary-total` …) |
| Fixtures + `storageState` | Sesija saugoma slapuke `qa_session`, duomenys – `localStorage`; prisijunkite vieną kartą `setup` projekte |
| Auto-waiting, timeout'ai | Visos užklausos turi 250–700 ms vėlavimą; `letas@test.lt` – 2,5–4 s |
| `page.route()` mockinimas | Prekės kraunamos iš `data/products.json` – pakeiskite atsakymą, grąžinkite 500 arba `route.abort()` (yra „Bandyti dar kartą“ mygtukas) |
| `page.on('dialog')` | „Išvalyti krepšelį“ naudoja naršyklės `confirm()` |
| Modalinis langas | Prekės šalinimas, užsakymo atšaukimas, duomenų atstatymas (`data-testid="confirm-dialog"`) |
| `page.addLocatorHandler()` | Slapukų juosta pasirodo po ~0,8 s ir gali uždengti mygtukus apačioje |
| `setInputFiles()` | Kontaktų formos priedas (PNG/JPG/PDF iki 2 MB) |
| `fill()` vs `pressSequentially()` | Kortelės numeris ir galiojimo data formatuojami automatiškai |
| `toBeDisabled()` / `toBeEnabled()` | Profilio „Išsaugoti“ aktyvus tik pakeitus duomenis |
| Lentelės, sąrašai, filtravimas | `cart-item`, `order-row`, `product-card` + `filter({ hasText })` |
| Kelių skirtukų testai | Krepšelis sinchronizuojamas tarp skirtukų |
| Vizualiniai / mobilūs testai | Puslapis prisitaiko prie telefono ekrano |

### Užduočių idėjos

1. Prisijungimas: sėkmingas, neteisingas slaptažodis, užblokuotas vartotojas, tušti laukai.
2. Registracija: visos validacijos klaidos, jaunesnis nei 18 m., jau egzistuojantis el. paštas, sėkminga registracija → prisijungimas.
3. Paieška „sviesa“ randa „Šviesa“; rikiavimas pagal kainą tikrai rikiuoja (palyginkite `data-value`).
4. Prekė su dydžiu: be dydžio rodoma klaida; skirtingi dydžiai krepšelyje – atskiros eilutės.
5. Negalima įsidėti daugiau nei yra sandėlyje (pvz. `p19` – liko 2 vnt.).
6. Svečio krepšelis išlieka prisijungus.
7. Nuolaidų kodų lentelė kaip parametrizuotas testas (`for (const code of codes) test(...)`).
8. Pilnas pirkimas „end-to-end“ → užsakymo numeris matomas paskyroje.
9. `klaidingas@test.lt` → klaidos pranešimas, krepšelis neišvalomas.
10. Mockinkite `data/products.json`, kad grąžintų 1 prekę arba 500 klaidą.

### Rekomenduojama POM struktūra

```
tests/
  fixtures.ts          ← test.extend({ loginPage, catalogPage, cartPage, ... , loggedInPage })
  auth.setup.ts        ← prisijungia ir išsaugo storageState
  pages/
    BasePage.ts        ← header (krepšelio ženkliukas, vartotojo meniu, atsijungimas), toast
    LoginPage.ts
    RegisterPage.ts
    CatalogPage.ts
    ProductPage.ts
    CartPage.ts
    CheckoutPage.ts
    OrderPage.ts
    AccountPage.ts
  components/
    ConfirmDialog.ts
    CookieBanner.ts
```

## Duomenų atstatymas

- Mygtukas **„Atstatyti demo duomenis“** puslapio apačioje.
- Arba bet kuris URL su `?reset=1`, pvz. `index.html?reset=1`.
- Slapukų juostos galima išvengti iš anksto: `localStorage.setItem('qa_cookie_consent', 'all')`
  (pvz. per `page.addInitScript` arba `storageState`).

## Failų struktūra

```
index.html, product.html, login.html, register.html, cart.html,
checkout.html, order.html, account.html, contact.html
css/styles.css
js/core.js          ← „backend“ imitacija: auth, krepšelis, užsakymai, validacija, UI komponentai
js/pages/*.js       ← kiekvieno puslapio logika
data/products.json  ← prekių katalogas (21 prekė)
```

> Tai mokomasis projektas. Nenaudokite tikrų slaptažodžių, asmens ar kortelės duomenų.
