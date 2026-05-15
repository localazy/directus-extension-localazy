<template>
  <div v-if="languageRows.length > 0" class="languages-table">
    <div class="row header-row">
      <div class="cell header">Language</div>
      <div class="cell header">Present in Localazy</div>
      <div class="cell header">Present in Directus</div>
    </div>

    <div v-for="(data, index) in languageRows" :key="index" class="row">
      <div class="cell language-cell font-normal">
        <span class="locale">{{ data.locale }}</span>
        <span v-if="data.directusName" class="english-name">({{ data.directusName }})</span>
        <span v-else-if="data.englishName" class="english-name">({{ data.englishName }})</span>
        <span v-if="data.customMapping" class="mapping-chip" :title="mappingTooltip(data.customMapping)">
          <v-icon small name="swap_horiz" />
          <span class="mapping-codes">
            <code>{{ data.customMapping.directusCode }}</code>
            <span class="mapping-arrow">↔</span>
            <code>{{ data.customMapping.localazyCode }}</code>
          </span>
        </span>
      </div>
      <div class="cell">
        <v-icon
          v-if="!data.directus.recognizedInLocalazy"
          name="error"
          color="var(--danger)"
          title="Localazy does not recognize this language"
        />
        <v-icon v-else-if="data.localazy.hidden" name="visibility_off" title="This language is disabled in your Localazy project" />
        <v-icon
          v-else-if="data.localazy.present || data.localazy.presentMapped"
          name="check"
          color="var(--success)"
          title="This language has been added in your Localazy project"
        />
        <v-icon v-else name="clear" color="var(--danger)" title="This language has not been added in your Localazy project" />

        <span v-if="!data.directus.recognizedInLocalazy"> Unknown Localazy language </span>
        <span v-else-if="data.localazy.hidden"> Disabled </span>
        <span v-else-if="data.localazy.presentMapped && !data.localazy.present">
          Mapped to {{ data.localazy.mappedTo }}
          <v-icon small name="help_outline" title="This language is defined in a different form in Localazy" />
        </span>
      </div>
      <div class="cell">
        <v-icon
          v-if="data.directus.present || data.directus.presentMapped"
          name="check"
          color="var(--success)"
          title="This language has been added in your Directus project"
        />
        <v-icon v-else name="clear" color="var(--danger)" title="This language has not been added in your Directus project" />

        <span v-if="data.directus.presentMapped && !data.directus.present">
          Mapped to {{ data.directus.mappedTo }}
          <v-icon small name="help_outline" title="This language is defined in a different form in Directus" />
        </span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia';
import { computed, PropType, ref, watch } from 'vue';
import { findLocalazyLanguageByLocale } from '@localazy/languages';
import { uniqWith } from 'lodash';
import { useLocalazyStore } from '../../stores/localazy-store';
import { useDirectusLanguages } from '../../composables/use-directus-languages';
import { DirectusLocalazyAdapter } from '../../../../common/services/directus-localazy-adapter';
import { Settings } from '../../../../common/models/collections-data/settings';
import { LanguageMapping, LanguageMappings } from '../../../../common/models/language-mapping';

type Row = {
  locale: string;
  englishName?: string;
  directusName?: string;
  localazyId?: number;
  customMapping: LanguageMapping | null;
  localazy: {
    present: boolean;
    presentMapped: boolean;
    mappedTo: string;
    hidden: boolean;
  };
  directus: {
    present: boolean;
    presentMapped: boolean;
    mappedTo: string;
    recognizedInLocalazy: boolean;
  };
};

const props = defineProps({
  settings: {
    type: Object as PropType<Settings | null>,
    required: true,
  },
});

const { localazyProject } = storeToRefs(useLocalazyStore());
const { fetchDirectusLanguageRows } = useDirectusLanguages();

const directusLanguageRows = ref<{ code: string; name: string | null }[]>([]);
const directusLanguages = computed(() => directusLanguageRows.value.map((r) => r.code));
const directusNameByCode = computed(() => {
  const map = new Map<string, string>();
  directusLanguageRows.value.forEach((row) => {
    if (row.name) map.set(row.code, row.name);
  });
  return map;
});

watch(
  () => props.settings,
  (s) => {
    if (s?.language_collection && s?.language_code_field) {
      // Fire-and-forget: rejection logs through fetchDirectusLanguageRows' own try/catch.
      void fetchDirectusLanguageRows(s.language_collection, s.language_code_field).then((rows) => {
        directusLanguageRows.value = rows;
      });
    }
  },
  { immediate: true, deep: true },
);

const customMappings = computed((): LanguageMappings => {
  try {
    const parsed = JSON.parse(props.settings?.language_mappings || '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as LanguageMappings).filter((m) => m?.directusCode && m?.localazyCode) : [];
  } catch {
    return [];
  }
});

function findCustomMapping(locale: string, directusFormLocale: string, localazyFormLocale: string): LanguageMapping | null {
  return (
    customMappings.value.find(
      (m) =>
        m.directusCode === locale ||
        m.localazyCode === locale ||
        m.directusCode === directusFormLocale ||
        m.localazyCode === localazyFormLocale,
    ) || null
  );
}

function mappingTooltip(m: LanguageMapping): string {
  const base = `Custom mapping: Directus "${m.directusCode}" ↔ Localazy "${m.localazyCode}"`;
  return m.description ? `${base} — ${m.description}` : base;
}

const languageRows = computed((): Row[] => {
  const localazyLanguages = localazyProject.value?.languages || [];
  const localazyLocales = localazyLanguages.map((l) => l.code);

  const allLanguages = [...directusLanguages.value, ...localazyLocales].map((locale) => {
    const directusFormLocale = DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage(locale);
    const localazyFormLocale = DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage(locale);
    const localazyLanguage = findLocalazyLanguageByLocale(localazyFormLocale);
    const projectLanguage = localazyLanguages.find((l) => l.code === localazyFormLocale);

    return {
      locale,
      localazyId: localazyLanguage?.localazyId,
      englishName: localazyLanguage?.name,
      directusName: directusNameByCode.value.get(locale) ?? directusNameByCode.value.get(directusFormLocale),
      customMapping: findCustomMapping(locale, directusFormLocale, localazyFormLocale),
      localazy: {
        present: localazyLocales.includes(locale),
        presentMapped: localazyLocales.includes(localazyFormLocale),
        mappedTo: localazyFormLocale,
        hidden: (projectLanguage as { published?: boolean } | undefined)?.published === false,
      },
      directus: {
        present: directusLanguages.value.includes(locale),
        presentMapped: directusLanguages.value.includes(directusFormLocale),
        mappedTo: directusFormLocale,
        recognizedInLocalazy: !!localazyLanguage,
      },
    } as Row;
  });

  return uniqWith(allLanguages, (arrVal, othVal) => {
    if (arrVal.directus.present !== othVal.directus.present) {
      return (
        DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage(arrVal.locale) ===
        DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage(othVal.locale)
      );
    }
    return arrVal.locale === othVal.locale;
  }).sort((a, b) => {
    const isASourceLanguage = a.localazyId === localazyProject.value?.sourceLanguage;
    const isBSourceLanguage = b.localazyId === localazyProject.value?.sourceLanguage;
    if (isASourceLanguage && !isBSourceLanguage) {
      return -1;
    }
    if (!isASourceLanguage && isBSourceLanguage) {
      return 1;
    }
    return a.locale.localeCompare(b.locale);
  });
});
</script>

<style lang="scss" scoped>
@use '../../styles/mixins/common' as *;

$divider-color: var(--border-normal, var(--theme--border-color-accent));
$radius: var(--border-radius, var(--theme--border-radius));
$bg-card: var(--background-normal, var(--theme--background-normal, var(--theme--background)));
$bg-subdued: var(--background-subdued, var(--theme--background-subdued));
$fg-normal: var(--foreground-normal, var(--theme--foreground));
$fg-subdued: var(--foreground-subdued, var(--theme--foreground-subdued));
$fg-accent: var(--foreground-accent, var(--theme--foreground-accent, var(--theme--foreground)));
$mono: var(--family-monospace, var(--theme--family-monospace, ui-monospace, SFMono-Regular, Menlo, monospace));

.languages-table {
  @include common;
  display: flex;
  flex-direction: column;
  background-color: $bg-card;
  border: 1px solid $divider-color;
  border-radius: $radius;
  overflow: hidden;
}

.row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  align-items: center;
  position: relative;

  &:not(:last-child)::after {
    content: '';
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 0;
    height: 1px;
    background-color: $divider-color;
  }

  &.header-row::after {
    left: 0;
    right: 0;
  }
}

.header-row {
  background-color: $bg-subdued;
}

.cell {
  padding: 7px 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
}

.header {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: $fg-accent;
}

.language-cell {
  flex-wrap: wrap;
}

.locale {
  font-weight: 500;
}

.english-name {
  color: $fg-subdued;
}

.mapping-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 2px 8px;
  background: $bg-subdued;
  border: 1px solid $divider-color;
  border-radius: $radius;
  font-size: 12px;
  color: $fg-normal;

  code {
    background: transparent;
    font-family: $mono;
    font-size: 12px;
  }
}

.mapping-codes {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.mapping-arrow {
  color: var(--foreground-subdued);
}

.unknown-language {
  color: var(--danger);
}

.hidden-language {
  color: var(--info);
}
</style>
