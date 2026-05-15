<template>
  <div class="automation-form">
    <div class="form grid">
      <header class="section-header">
        <h2 class="section-title">Export</h2>
        <p class="note section-description">From Directus to Localazy &mdash; triggered by changes to translatable content inside Directus.</p>
      </header>

      <div class="half">
        <p class="type-label">Enable automated export</p>
        <v-select v-model="localEdits.automated_upload" :items="enabledOptions" />
      </div>
      <div class="half-right">
        <p class="note configuration-description">
          When enabled, content saved in Directus is pushed to Localazy automatically &mdash; create and update events on translatable
          collections and translation strings.
        </p>
      </div>

      <div :class="['settings-group', { disabled: !localEdits.automated_upload }]">
        <div class="grid">
          <div class="half">
            <p class="type-label">Also deprecate Localazy source keys on Directus delete</p>
            <v-select v-model="localEdits.automated_deprecation" :items="enabledOptions" :disabled="!localEdits.automated_upload" />
            <p class="note hint">
              When on, deleting a translatable entry in Directus marks the matching Localazy source keys as
              <a href="https://localazy.com/faq/localazy/what-is-the-difference-between-hidden-and-deprecated-source-keys" target="_blank">
                deprecated
              </a>
              rather than leaving them active.
            </p>
          </div>
          <div class="half-right">
            <p class="note configuration-description">
              Deprecation is a sub-behaviour of automated export &mdash; if export is off, deletes are not propagated to Localazy regardless
              of this setting.
            </p>
          </div>
        </div>
      </div>

      <header class="section-header section-header-divider">
        <h2 class="section-title">Import</h2>
        <p class="note section-description">From Localazy to Directus &mdash; triggered by Localazy's <code>project_published</code> webhook.</p>
      </header>

      <div class="half">
        <p class="type-label">Enable automated import</p>
        <v-select v-model="localEdits.automated_import" :items="enabledOptions" />
      </div>
      <div class="half-right">
        <p class="note configuration-description">
          When enabled, the Directus instance will import translations from Localazy each time the
          <code>project_published</code> event fires. Requires the automation bundle and a registered webhook (below).
        </p>
      </div>

      <div :class="['settings-group', { disabled: !localEdits.automated_import }]">
        <div class="grid">
          <div class="half">
            <p class="type-label">Webhook user (Admin role required)</p>
            <v-select
              v-model="localEdits.automated_import_user"
              :items="adminUserItems"
              :loading="loadingUsers"
              :disabled="!localEdits.automated_import"
              placeholder="Select an Admin user"
              :allow-other="false"
              show-deselect
            />
            <p class="note hint">
              Only Admin-role users are listed. Webhook-driven writes are attributed to this Directus user, so it must have full schema
              access.
            </p>
          </div>
          <div class="half-right">
            <p class="note configuration-description">
              The bundle in PR F will refuse to act on webhook events until this is set — webhook writes touch the same `ItemsService` and
              `FieldsService` paths as a manual import.
            </p>
          </div>

          <div class="half">
            <p class="type-label">Languages to import on webhook event</p>
            <v-select
              v-model="selectedLanguages"
              :items="languageItems"
              :disabled="!localEdits.automated_import"
              placeholder="All configured languages"
              multiple
              show-deselect
            />
            <p class="note hint">Empty selection imports all languages configured for this Localazy project (same as the Import button).</p>
          </div>
          <div class="half-right">
            <p class="note configuration-description">
              The webhook handler resolves these against the Localazy project's available languages each time an event fires; codes that
              disappear from the project are silently skipped.
            </p>
          </div>

          <div class="webhook-section">
            <h3 class="webhook-title">Webhook registration</h3>
            <p class="note webhook-description">
              Automated import relies on a webhook: Localazy calls this Directus site whenever translations are ready. Use the button below
              to register the webhook, or remove it later.
            </p>
            <WebhookSetup />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useApi } from '@directus/extensions-sdk';
import type { Item } from '@directus/types';
import { useLocalazyStore } from '../../stores/localazy-store';
import { Settings } from '../../../../common/models/collections-data/settings';
import WebhookSetup from './WebhookSetup.vue';

const localEdits = defineModel<Settings>('edits', { required: true });

const api = useApi();
const { localazyProject } = storeToRefs(useLocalazyStore());

const enabledOptions: Item[] = [
  { text: 'Enabled', value: true },
  { text: 'Disabled', value: false },
];

type AdminUser = { id: string; first_name: string | null; last_name: string | null; email: string };

const adminUsers = ref<AdminUser[]>([]);
const loadingUsers = ref(false);

/**
 * Filter for users whose role has at least one policy with `admin_access = true`.
 * In Directus 11, `admin_access` lives on `directus_policies`, not on `directus_roles`
 * (which was the v10 shape). The traversal is
 * `directus_users.role` (m2o) → `directus_roles.policies` (o2m to `directus_access`)
 * → `directus_access.policy` (m2o to `directus_policies`) → `admin_access`.
 * Excluding non-admin users client-side instead would still leak their existence
 * via the API response, and we'd pay the bandwidth for a list we then discard.
 */
const ADMIN_USERS_FILTER = { role: { policies: { policy: { admin_access: { _eq: true } } } } } as const;

async function loadAdminUsers(): Promise<void> {
  loadingUsers.value = true;
  try {
    const result = await api.get<{ data: AdminUser[] }>('/users', {
      params: {
        filter: ADMIN_USERS_FILTER,
        fields: ['id', 'first_name', 'last_name', 'email'],
        limit: -1,
      },
    });
    adminUsers.value = result.data.data ?? [];
  } catch {
    adminUsers.value = [];
  } finally {
    loadingUsers.value = false;
  }
}

function userLabel(user: AdminUser): string {
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return name ? `${name} (${user.email})` : user.email;
}

const adminUserItems = computed<Item[]>(() => adminUsers.value.map((u) => ({ text: userLabel(u), value: u.id })));

/**
 * Languages dropdown: project.languages is undefined until the localazy store finishes
 * hydrating. Returning an empty array in that window keeps the select rendered and
 * disabled-looking without throwing.
 */
const languageItems = computed<Item[]>(() => {
  const langs = localazyProject.value?.languages ?? [];
  return langs.map((l) => ({ text: `${l.name} (${l.code})`, value: l.code }));
});

/**
 * The persisted form stores `automated_import_languages` as a JSON-encoded string (mirrors
 * `language_mappings`'s storage). Adapt it to a real array for the multi-select. Parse
 * failures fall back to `[]` rather than crashing the form — a corrupted value just means
 * "treat as empty / all languages", which is the same as the empty-string default.
 */
const selectedLanguages = computed<string[]>({
  get() {
    try {
      const parsed = JSON.parse(localEdits.value.automated_import_languages || '[]');
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  },
  set(next) {
    localEdits.value.automated_import_languages = JSON.stringify(next ?? []);
  },
});

onMounted(() => {
  void loadAdminUsers();
});
</script>

<style lang="scss" scoped>
@use '../../styles/mixins/form-grid' as *;

.automation-form {
  display: flex;
  flex-direction: column;
}

.form {
  @include form-grid;
  max-width: 1300px;
}

.grid {
  @include form-grid;
}

.settings-group {
  grid-column: 1 / span 2;
  transition: opacity var(--fast) var(--transition);

  &.disabled {
    opacity: 0.55;
  }
}

.section-header {
  grid-column: 1 / span 2;
  margin-bottom: 8px;
}

.section-header-divider {
  margin-top: 16px;
  padding-top: 32px;
  border-top: 1px solid var(--border-subdued);
}

.section-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 4px 0;
  color: var(--foreground-normal);
}

.section-description {
  margin: 0;
}

.webhook-section {
  grid-column: 1 / span 2;
  margin-top: 32px;
}

.webhook-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--foreground-normal);
}

.webhook-description {
  margin-bottom: 16px;
}

.configuration-description {
  margin-bottom: 40px;
  @media (min-width: 960px) {
    margin-top: 24px;
    margin-bottom: 0;
  }
}

.note {
  font-style: italic;
  font-size: 13px;
  line-height: 18px;
  color: var(--foreground-normal);

  & a {
    text-decoration: underline;
  }

  code {
    background: var(--background-subdued);
    padding: 1px 4px;
    border-radius: 4px;
    font-style: normal;
  }
}

.hint {
  margin-top: 6px;
  color: var(--foreground-subdued);
}
</style>
