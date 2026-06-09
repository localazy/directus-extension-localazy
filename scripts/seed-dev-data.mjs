#!/usr/bin/env node
// Seeds the local Directus dev database with a minimal translatable
// `articles` collection following the Directus "Generate Translations"
// convention (parent + `_translations` junction + `languages` collection).
// Runs once after `directus bootstrap` against the running server.

const baseUrl = process.env.DIRECTUS_URL ?? 'http://localhost:8055';
const email = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const password = process.env.ADMIN_PASSWORD ?? 'd1r3ctu5';

async function login() {
  const r = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`login failed: ${r.status} ${await r.text()}`);
  const { data } = await r.json();
  return data.access_token;
}

async function api(token, path, method, body) {
  const r = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

async function main() {
  const token = await login();

  console.log('[seed] creating languages collection');
  await api(token, '/collections', 'POST', {
    collection: 'languages',
    // display_template controls how a language relation renders in lists and
    // in the translations interface. Without it, Directus falls back to the
    // primary-key object and renders "[object Object]" for the language pill.
    meta: { icon: 'translate', display_template: '{{name}} ({{code}})' },
    schema: {},
    fields: [
      {
        field: 'code',
        type: 'string',
        meta: { interface: 'input', width: 'full' },
        schema: { is_primary_key: true, is_nullable: false, length: 16 },
      },
      {
        field: 'name',
        type: 'string',
        meta: { interface: 'input', width: 'full' },
        schema: {},
      },
      {
        field: 'direction',
        type: 'string',
        meta: {
          interface: 'select-dropdown',
          options: {
            choices: [
              { text: 'Left to Right', value: 'ltr' },
              { text: 'Right to Left', value: 'rtl' },
            ],
          },
          width: 'full',
        },
        schema: { default_value: 'ltr' },
      },
    ],
  });

  await api(token, '/items/languages', 'POST', [
    { code: 'en', name: 'English', direction: 'ltr' },
    { code: 'de', name: 'German', direction: 'ltr' },
    { code: 'fr', name: 'French', direction: 'ltr' },
  ]);

  console.log('[seed] creating articles collection');
  await api(token, '/collections', 'POST', {
    collection: 'articles',
    meta: { icon: 'article' },
    schema: {},
    fields: [
      {
        field: 'id',
        type: 'integer',
        meta: { hidden: true, interface: 'input', readonly: true },
        schema: { is_primary_key: true, has_auto_increment: true },
      },
      {
        field: 'status',
        type: 'string',
        meta: {
          interface: 'select-dropdown',
          options: {
            choices: [
              { text: 'Published', value: 'published' },
              { text: 'Draft', value: 'draft' },
              { text: 'Archived', value: 'archived' },
            ],
          },
          width: 'full',
        },
        schema: { default_value: 'draft' },
      },
      {
        field: 'title',
        type: 'string',
        meta: { interface: 'input', width: 'full' },
        schema: {},
      },
    ],
  });

  console.log('[seed] creating articles_translations collection');
  await api(token, '/collections', 'POST', {
    collection: 'articles_translations',
    meta: { hidden: true, icon: 'translate' },
    schema: {},
    fields: [
      {
        field: 'id',
        type: 'integer',
        meta: { hidden: true, interface: 'input', readonly: true },
        schema: { is_primary_key: true, has_auto_increment: true },
      },
    ],
  });

  await api(token, '/fields/articles_translations', 'POST', {
    field: 'articles_id',
    type: 'integer',
    meta: { hidden: true, interface: 'input' },
    schema: {},
  });
  await api(token, '/fields/articles_translations', 'POST', {
    field: 'languages_code',
    type: 'string',
    // Hidden from the per-translation form. Directus' translations interface
    // determines the language by the row's position in the parent's
    // translation list — the FK is not user-editable inline. Without
    // hidden:true, the field tries to render the resolved language object
    // as the value of a plain text input, surfacing "[object Object]".
    meta: { interface: 'input', hidden: true },
    schema: { length: 16 },
  });
  await api(token, '/fields/articles_translations', 'POST', {
    field: 'title',
    type: 'string',
    meta: { interface: 'input', width: 'full' },
    schema: {},
  });
  await api(token, '/fields/articles_translations', 'POST', {
    field: 'body',
    type: 'text',
    meta: { interface: 'input-multiline', width: 'full' },
    schema: {},
  });

  // Alias field on the parent — this is what makes the `translations` interface appear.
  await api(token, '/fields/articles', 'POST', {
    field: 'translations',
    type: 'alias',
    meta: {
      interface: 'translations',
      special: ['translations'],
      width: 'full',
    },
  });

  console.log('[seed] creating relations');
  // junction → parent. `one_field: 'translations'` + `junction_field: 'languages_code'`
  // is what flips this from a plain O2M into Directus' translations shape.
  await api(token, '/relations', 'POST', {
    collection: 'articles_translations',
    field: 'articles_id',
    related_collection: 'articles',
    meta: {
      many_collection: 'articles_translations',
      many_field: 'articles_id',
      one_collection: 'articles',
      one_field: 'translations',
      junction_field: 'languages_code',
      one_deselect_action: 'nullify',
      sort_field: null,
    },
    schema: { on_delete: 'SET NULL' },
  });
  await api(token, '/relations', 'POST', {
    collection: 'articles_translations',
    field: 'languages_code',
    related_collection: 'languages',
    meta: {
      many_collection: 'articles_translations',
      many_field: 'languages_code',
      one_collection: 'languages',
      one_field: null,
      junction_field: 'articles_id',
    },
    schema: { on_delete: 'SET NULL' },
  });

  console.log('[seed] inserting demo articles');
  const article1 = await api(token, '/items/articles', 'POST', {
    status: 'published',
    title: 'Welcome to Localazy',
  });
  const article2 = await api(token, '/items/articles', 'POST', {
    status: 'draft',
    title: 'Getting started with translations',
  });

  await api(token, '/items/articles_translations', 'POST', [
    {
      articles_id: article1.data.id,
      languages_code: 'en',
      title: 'Welcome to Localazy',
      body: 'Hello from the Localazy Directus extension.',
    },
    {
      articles_id: article1.data.id,
      languages_code: 'de',
      title: 'Willkommen bei Localazy',
      body: 'Hallo von der Localazy Directus Extension.',
    },
    {
      articles_id: article2.data.id,
      languages_code: 'en',
      title: 'Getting started with translations',
      body: 'A second article you can use to test sync flows.',
    },
  ]);

  console.log('[seed] done');
}

main().catch((e) => {
  console.error('[seed] failed:', e);
  process.exit(1);
});
