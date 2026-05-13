<template>
  <div class="automation-form">
    <div class="form grid">
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
              Localazy needs a public URL to post events to. This block registers / removes the webhook on Localazy directly — no Directus
              server round-trip required.
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
 * Filter to `role.admin_access._eq: true`. Directus' standard filter syntax for traversing
 * relations — same shape the Directus admin uses internally. The role lookup walks one
 * level: `directus_users.role` is m2o → `directus_roles`, which has an `admin_access`
 * boolean. Excluding non-admin users client-side instead would still leak their existence
 * via the API response, and we'd pay the bandwidth for a list we then discard.
 */
const ADMIN_USERS_FILTER = { role: { admin_access: { _eq: true } } } as const;

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
