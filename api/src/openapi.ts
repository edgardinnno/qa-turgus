// OpenAPI 3.1 specifikacija – rodoma /docs (Swagger UI) ir /openapi.json.
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (description: string, schema: object) => ({ description, content: { 'application/json': { schema } } });
const err = (description: string) => json(description, ref('Error'));
const body = (schema: object, example?: object) => ({
  required: true,
  content: { 'application/json': { schema, ...(example ? { example } : {}) } },
});
const auth = [{ bearerAuth: [] }];
const E401 = err('Nėra arba negalioja token (UNAUTHORIZED, INVALID_TOKEN, SESSION_EXPIRED)');
const E422 = err('Validacijos klaida (VALIDATION_ERROR) – laukų klaidos pateikiamos `details`');
const idParam = (name: string, description: string, example: string | number) => ({
  name, in: 'path', required: true, description, schema: { type: typeof example === 'number' ? 'integer' : 'string' }, example,
});

const str = { type: 'string' };
const num = { type: 'number' };
const int = { type: 'integer' };
const bool = { type: 'boolean' };
const nullable = (t: object) => ({ anyOf: [t, { type: 'null' }] });

export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'QA Turgus API',
    version: '1.0.0',
    description: [
      'Mokomosios parduotuvės **QA Turgus** REST API – skirta mokytis API testavimo (pvz. Playwright `request`).',
      '',
      '**Autentifikacija:** `POST /api/auth/login` grąžina `token`. Jį siųskite antraštėje `Authorization: Bearer <token>`.',
      '',
      '**Demo vartotojai** (slaptažodis `Slaptas123!`): `standartinis@test.lt`, `uzblokuotas@test.lt` (403), `letas@test.lt` (2,5–4 s vėlavimas), `klaidingas@test.lt` (užsakymai → 500).',
      'Demo paskyrų profilio keisti negalima (403 DEMO_ACCOUNT). Patikimiems testams registruokite savo vartotoją.',
      '',
      'Visos klaidos: `{ "error": { "code": "…", "message": "…", "details": { "laukas": "…" } } }`.',
    ].join('\n'),
  },
  servers: [{ url: '/api', description: 'Šis serveris' }],
  tags: [
    { name: 'Sistema' }, { name: 'Autentifikacija' }, { name: 'Vartotojas' }, { name: 'Prekės' },
    { name: 'Atsiliepimai' }, { name: 'Krepšelis' }, { name: 'Užsakymai' }, { name: 'Kontaktai' },
  ],
  paths: {
    '/health': {
      get: { tags: ['Sistema'], summary: 'Serverio būsena', responses: { 200: json('OK', { type: 'object', properties: { status: str, time: str } }) } },
    },
    '/config': {
      get: { tags: ['Sistema'], summary: 'Pristatymo būdai, paštomatai, parduotuvės, bankai, šalys', responses: { 200: json('OK', { type: 'object' }) } },
    },
    '/auth/register': {
      post: {
        tags: ['Autentifikacija'], summary: 'Naujo vartotojo registracija',
        requestBody: body(ref('RegisterRequest'), {
          firstName: 'Testas', lastName: 'Testaitis', email: 'testas@pavyzdys.lt', phone: '+37061234567',
          birthDate: '1995-06-01', country: 'LT', password: 'Testas123!', newsletter: false,
        }),
        responses: {
          201: json('Vartotojas sukurtas', { type: 'object', properties: { user: ref('User') } }),
          400: err('Neteisingas JSON (INVALID_JSON)'),
          409: err('El. paštas užimtas (EMAIL_TAKEN)'),
          422: E422,
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Autentifikacija'], summary: 'Prisijungimas – grąžina Bearer token',
        requestBody: body(ref('LoginRequest'), { email: 'standartinis@test.lt', password: 'Slaptas123!', remember: false }),
        responses: {
          200: json('Prisijungta', ref('LoginResponse')),
          401: err('Neteisingi duomenys (INVALID_CREDENTIALS)'),
          403: err('Paskyra užblokuota (ACCOUNT_LOCKED)'),
          422: E422,
        },
      },
    },
    '/auth/logout': {
      post: { tags: ['Autentifikacija'], summary: 'Atsijungimas (token panaikinamas)', security: auth, responses: { 204: { description: 'Atsijungta' }, 401: E401 } },
    },
    '/users/me': {
      get: { tags: ['Vartotojas'], summary: 'Prisijungusio vartotojo duomenys', security: auth, responses: { 200: json('OK', { type: 'object', properties: { user: ref('User') } }), 401: E401 } },
      patch: {
        tags: ['Vartotojas'], summary: 'Profilio atnaujinimas (bent vienas laukas)', security: auth,
        requestBody: body({ type: 'object', properties: { firstName: str, lastName: str, phone: nullable(str), newsletter: bool } }, { firstName: 'Naujas' }),
        responses: { 200: json('Atnaujinta', { type: 'object', properties: { user: ref('User') } }), 401: E401, 403: err('Demo paskyra (DEMO_ACCOUNT)'), 422: E422 },
      },
      delete: { tags: ['Vartotojas'], summary: 'Paskyros ištrynimas (patogu testų „teardown“)', security: auth, responses: { 204: { description: 'Ištrinta' }, 401: E401, 403: err('Demo paskyra (DEMO_ACCOUNT)') } },
    },
    '/users/me/password': {
      put: {
        tags: ['Vartotojas'], summary: 'Slaptažodžio keitimas', security: auth,
        requestBody: body({ type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: str, newPassword: str } }),
        responses: { 204: { description: 'Pakeista' }, 400: err('Neteisingas dabartinis slaptažodis (WRONG_PASSWORD)'), 401: E401, 403: err('Demo paskyra (DEMO_ACCOUNT)'), 422: E422 },
      },
    },
    '/categories': {
      get: { tags: ['Prekės'], summary: 'Kategorijų sąrašas', responses: { 200: json('OK', { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { id: str, name: str, productCount: int } } } } }) } },
    },
    '/products': {
      get: {
        tags: ['Prekės'], summary: 'Prekių sąrašas su paieška, filtrais ir puslapiavimu',
        parameters: [
          { name: 'q', in: 'query', schema: str, description: 'Paieška (be diakritikų: „sviesa“ randa „Šviesa“)' },
          { name: 'category', in: 'query', schema: { type: 'string', enum: ['elektronika', 'drabuziai', 'namai', 'sportas', 'knygos'] } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['popular', 'price-asc', 'price-desc', 'name-asc', 'name-desc', 'rating'], default: 'popular' } },
          { name: 'inStock', in: 'query', schema: { type: 'boolean' }, description: 'Tik turimos sandėlyje' },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: {
          200: json('OK', { type: 'object', properties: { items: { type: 'array', items: ref('Product') }, total: int, page: int, limit: int, pages: int } }),
          422: E422,
        },
      },
    },
    '/products/{id}': {
      get: {
        tags: ['Prekės'], summary: 'Viena prekė', parameters: [idParam('id', 'Prekės ID', 'p1')],
        responses: { 200: json('OK', { type: 'object', properties: { product: ref('Product') } }), 404: err('Prekė nerasta (PRODUCT_NOT_FOUND)') },
      },
    },
    '/products/{id}/reviews': {
      get: {
        tags: ['Atsiliepimai'], summary: 'Prekės atsiliepimai', parameters: [idParam('id', 'Prekės ID', 'p1')],
        responses: { 200: json('OK', { type: 'object', properties: { items: { type: 'array', items: ref('Review') }, total: int } }), 404: err('Prekė nerasta') },
      },
      post: {
        tags: ['Atsiliepimai'], summary: 'Parašyti atsiliepimą (vienas prekei)', security: auth, parameters: [idParam('id', 'Prekės ID', 'p1')],
        requestBody: body({ type: 'object', required: ['rating', 'text'], properties: { rating: { type: 'integer', minimum: 1, maximum: 5 }, text: { type: 'string', minLength: 10, maxLength: 500 } } }, { rating: 5, text: 'Puiki prekė, rekomenduoju!' }),
        responses: { 201: json('Sukurta', { type: 'object', properties: { review: ref('Review') } }), 401: E401, 404: err('Prekė nerasta'), 409: err('Jau parašėte (REVIEW_EXISTS)'), 422: E422 },
      },
    },
    '/promo-codes/validate': {
      post: {
        tags: ['Krepšelis'], summary: 'Nuolaidos kodo patikrinimas (be prisijungimo)',
        requestBody: body({ type: 'object', required: ['code'], properties: { code: str, subtotal: num } }, { code: 'PLAYWRIGHT10', subtotal: 40 }),
        responses: {
          200: json('Galioja', { type: 'object', properties: { promo: ref('Promo') } }),
          404: err('Kodas neegzistuoja (PROMO_NOT_FOUND)'), 410: err('Kodas nebegalioja (PROMO_EXPIRED)'), 422: err('Per maža suma (PROMO_MIN_AMOUNT) arba validacija'),
        },
      },
    },
    '/cart': {
      get: { tags: ['Krepšelis'], summary: 'Krepšelio turinys ir sumos', security: auth, responses: { 200: json('OK', ref('Cart')), 401: E401 } },
      delete: { tags: ['Krepšelis'], summary: 'Išvalyti krepšelį', security: auth, responses: { 204: { description: 'Išvalyta' }, 401: E401 } },
    },
    '/cart/items': {
      post: {
        tags: ['Krepšelis'], summary: 'Įdėti prekę (tas pats variantas – kiekis sumuojamas)', security: auth,
        requestBody: body({ type: 'object', required: ['productId'], properties: { productId: str, quantity: { type: 'integer', minimum: 1, maximum: 99, default: 1 }, size: str, color: str } }, { productId: 'p6', quantity: 2, size: 'M', color: 'Balta' }),
        responses: { 201: json('Krepšelis', ref('Cart')), 401: E401, 404: err('Prekė nerasta'), 409: err('Nepakanka sandėlyje (OUT_OF_STOCK)'), 422: err('Validacija: trūksta dydžio/spalvos, neteisingas kiekis') },
      },
    },
    '/cart/items/{itemId}': {
      patch: {
        tags: ['Krepšelis'], summary: 'Pakeisti kiekį', security: auth, parameters: [idParam('itemId', 'Krepšelio eilutės ID', 1)],
        requestBody: body({ type: 'object', required: ['quantity'], properties: { quantity: { type: 'integer', minimum: 1, maximum: 99 } } }, { quantity: 3 }),
        responses: { 200: json('Krepšelis', ref('Cart')), 401: E401, 404: err('CART_ITEM_NOT_FOUND'), 409: err('OUT_OF_STOCK'), 422: E422 },
      },
      delete: {
        tags: ['Krepšelis'], summary: 'Pašalinti eilutę', security: auth, parameters: [idParam('itemId', 'Krepšelio eilutės ID', 1)],
        responses: { 200: json('Krepšelis', ref('Cart')), 401: E401, 404: err('CART_ITEM_NOT_FOUND') },
      },
    },
    '/cart/promo': {
      post: {
        tags: ['Krepšelis'], summary: 'Pritaikyti nuolaidos kodą', security: auth,
        requestBody: body({ type: 'object', required: ['code'], properties: { code: str } }, { code: 'PLAYWRIGHT10' }),
        responses: {
          200: json('Krepšelis', ref('Cart')), 401: E401, 404: err('PROMO_NOT_FOUND'), 409: err('PROMO_ALREADY_APPLIED'),
          410: err('PROMO_EXPIRED'), 422: err('PROMO_MIN_AMOUNT, CART_EMPTY arba validacija'),
        },
      },
      delete: { tags: ['Krepšelis'], summary: 'Pašalinti nuolaidos kodą', security: auth, responses: { 200: json('Krepšelis', ref('Cart')), 401: E401 } },
    },
    '/orders': {
      get: { tags: ['Užsakymai'], summary: 'Mano užsakymai (naujausi pirmi)', security: auth, responses: { 200: json('OK', { type: 'object', properties: { items: { type: 'array', items: ref('Order') }, total: int } }), 401: E401 } },
      post: {
        tags: ['Užsakymai'], summary: 'Pateikti užsakymą iš krepšelio', security: auth,
        description: 'Testinės kortelės: `4242424242424242` – OK, `4000000000000002` – 402 atmesta, `4000000000009995` – 402 nepakanka lėšų.',
        requestBody: body(ref('OrderRequest'), {
          address: { firstName: 'Jonas', lastName: 'Jonaitis', phone: '+37060000000', street: 'Testuotojų g. 1', city: 'Vilnius', postal: 'LT-01234' },
          delivery: { method: 'courier' },
          payment: { method: 'card', card: { holder: 'Jonas Jonaitis', number: '4242424242424242', expiry: '12/30', cvc: '123' } },
        }),
        responses: {
          201: json('Sukurta', { type: 'object', properties: { order: ref('Order') } }), 401: E401,
          402: err('Mokėjimas atmestas (PAYMENT_DECLINED)'), 422: err('CART_EMPTY arba validacija'), 500: err('klaidingas@test.lt (SERVER_ERROR)'),
        },
      },
    },
    '/orders/{id}': {
      get: {
        tags: ['Užsakymai'], summary: 'Vienas užsakymas', security: auth, parameters: [idParam('id', 'Užsakymo nr.', 'ORD-123456')],
        responses: { 200: json('OK', { type: 'object', properties: { order: ref('Order') } }), 401: E401, 404: err('ORDER_NOT_FOUND (arba priklauso kitam)') },
      },
    },
    '/orders/{id}/cancel': {
      post: {
        tags: ['Užsakymai'], summary: 'Atšaukti užsakymą', security: auth, parameters: [idParam('id', 'Užsakymo nr.', 'ORD-123456')],
        responses: { 200: json('Atšaukta', { type: 'object', properties: { order: ref('Order') } }), 401: E401, 404: err('ORDER_NOT_FOUND'), 409: err('ORDER_NOT_CANCELLABLE') },
      },
    },
    '/contact-messages': {
      post: {
        tags: ['Kontaktai'], summary: 'Kontaktų formos žinutė (nesaugoma)',
        requestBody: body({ type: 'object', required: ['name', 'email', 'topic', 'message'], properties: { name: str, email: str, topic: { type: 'string', enum: ['order', 'return', 'account', 'other'] }, orderNumber: str, message: str, sendCopy: bool } }),
        responses: { 201: json('Priimta', { type: 'object', properties: { ticket: str } }), 422: E422 },
      },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: str, message: str, details: { type: 'object', additionalProperties: str } } } },
        example: { error: { code: 'VALIDATION_ERROR', message: 'Užklausoje yra klaidų. Žr. details.', details: { email: 'Neteisingas el. pašto formatas.' } } },
      },
      User: {
        type: 'object',
        properties: { id: int, email: str, firstName: str, lastName: str, phone: nullable(str), birthDate: str, country: str, newsletter: bool, isDemo: bool, createdAt: str },
      },
      RegisterRequest: {
        type: 'object', required: ['firstName', 'lastName', 'email', 'birthDate', 'country', 'password'],
        properties: {
          firstName: { type: 'string', minLength: 2, maxLength: 50 }, lastName: { type: 'string', minLength: 2, maxLength: 50 },
          email: { type: 'string', format: 'email' }, phone: { type: 'string', pattern: '^\\+370\\d{8}$' },
          birthDate: { type: 'string', format: 'date', description: 'Ne jaunesnis nei 18 m.' },
          country: { type: 'string', enum: ['LT', 'LV', 'EE', 'PL', 'DE', 'OTHER'] },
          password: { type: 'string', minLength: 8, description: 'Didžioji, mažoji raidė, skaičius ir specialusis simbolis' },
          newsletter: bool,
        },
      },
      LoginRequest: { type: 'object', required: ['email', 'password'], properties: { email: str, password: str, remember: { type: 'boolean', description: 'true – token galioja 7 d., kitaip 24 val.' } } },
      LoginResponse: { type: 'object', properties: { token: str, tokenType: { type: 'string', const: 'Bearer' }, expiresAt: str, user: ref('User') } },
      Product: {
        type: 'object',
        properties: {
          id: str, name: str, category: str, categoryName: str, price: num, oldPrice: nullable(num), rating: num, reviewsCount: int,
          stock: int, image: str, hue: int, description: str, specs: { type: 'object', additionalProperties: str },
          variants: { type: 'object', properties: { sizes: { type: 'array', items: str }, colors: { type: 'array', items: str } } },
        },
      },
      Review: { type: 'object', properties: { id: int, author: str, rating: int, text: str, createdAt: str } },
      Promo: { type: 'object', properties: { code: str, type: { type: 'string', enum: ['percent', 'shipping'] }, value: num, min: num, label: str } },
      Totals: {
        type: 'object',
        properties: { subtotal: num, discount: num, shipping: num, total: num, vat: num, promoCode: nullable(str), promoValid: bool, promoNote: str, freeShippingLeft: num, shippingMethod: str },
      },
      CartItem: {
        type: 'object',
        properties: { id: int, productId: str, name: str, price: num, image: str, hue: int, stock: int, size: nullable(str), color: nullable(str), quantity: int, lineTotal: num },
      },
      Cart: { type: 'object', properties: { items: { type: 'array', items: ref('CartItem') }, itemCount: int, promo: nullable(ref('Promo')), totals: ref('Totals') } },
      OrderRequest: {
        type: 'object', required: ['address', 'delivery', 'payment'],
        properties: {
          address: { type: 'object', required: ['firstName', 'lastName', 'phone', 'street', 'city', 'postal'], properties: { firstName: str, lastName: str, phone: str, street: str, city: str, postal: { type: 'string', example: 'LT-01234' }, notes: str } },
          delivery: { type: 'object', required: ['method'], properties: { method: { type: 'string', enum: ['courier', 'parcel', 'pickup'] }, location: { type: 'string', description: 'Privaloma parcel/pickup – žr. GET /config' } } },
          payment: {
            type: 'object', required: ['method'],
            properties: {
              method: { type: 'string', enum: ['card', 'bank', 'cash'] },
              card: { type: 'object', properties: { holder: str, number: str, expiry: { type: 'string', example: '12/30' }, cvc: str } },
              bank: str,
            },
          },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: str, status: { type: 'string', enum: ['processing', 'cancelled'] }, statusLabel: str, createdAt: str,
          items: { type: 'array', items: { type: 'object' } }, totals: ref('Totals'), address: { type: 'object' }, delivery: { type: 'object' }, payment: { type: 'object' },
        },
      },
    },
  },
};

export const docsHtml = `<!doctype html>
<html lang="lt">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QA Turgus API</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css">
  <style>body { margin: 0; } .topbar { display: none; }</style>
</head>
<body>
  <div id="swagger"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.min.js"></script>
  <script>
    SwaggerUIBundle({ url: './openapi.json', dom_id: '#swagger', persistAuthorization: true, tryItOutEnabled: true });
  </script>
</body>
</html>`;
