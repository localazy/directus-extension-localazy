<template>
  <div class="languages-table" v-if="languageRows.length > 0">
    <div class="header">Language</div>
    <div class="header">Present in Localazy</div>
    <div class="header">Present in Directus</div>

    <template v-for="(data, index) in languageRows" :key="index">
      <div class="font-normal">
        {{ data.locale }}
        <span v-if="data.englishName">({{ data.englishName }})</span>
      </div>
      <div class="ml-2">
        <v-icon
          name="error"
          color="var(--danger)"
          v-if="!data.directus.recoznigedInLocalazy"
          title="Localazy does not recognize this language" />
        <v-icon
          name="visibility_off"
          v-else-if="data.localazy.hidden"
          title="This language is disabled in your Localazy project" />
        <v-icon
          name="check"
          color="var(--success)"
          v-else-if="data.localazy.present || data.localazy.presentMapped"
          title="This language has been added in your Localazy project" />
        <v-icon
          name="clear"
          color="var(--danger)"
          v-else
          title="This language has not been added in your Localazy project" />

        <span v-if="!data.directus.recoznigedInLocalazy">
          Unknown Localazy language
        </span>
        <span v-else-if="data.localazy.hidden">
          Disabled
        </span>
        <span v-else-if="data.localazy.presentMapped && !data.localazy.present">
          Mapped to {{ data.localazy.mappedTo }}
          <v-icon
            small
            name="help_outline"
            title="This language is defined in a different form in Localazy" />
        </span>
      </div>
      <div class="ml-2">
        <v-icon
          name="check"
          color="var(--success)"
          v-if="data.directus.present || data.directus.presentMapped"
          title="This language has been added in your Directus project" />
        <v-icon
          name="clear"
          color="var(--danger)"
          v-else
          title="This language has not been added in your Directus project" />

        <span v-if="data.directus.presentMapped && !data.directus.present">
          Mapped to {{ data.directus.mappedTo }}
          <v-icon
            small
            name="help_outline"
            title="This language is defined in a different form in Directus" />
        </span>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { findLocalazyLanguageByLocale } from '@localazy/languages';
import { uniqWith } from 'lodash';
import { useLocalazyStore } from '../../stores/localazy-store';
import { useDirectusLanguages } from '../../composables/use-directus-languages';
import { DirectusLocalazyAdapter } from '../../../../common/services/directus-localazy-adapter';

type Row = {
  locale: string;
  englishName?: string;
  localazyId?: number;
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
    recoznigedInLocalazy: boolean;
  };
};

const { localazyProject, settings } = storeToRefs(useLocalazyStore());
const { fetchDirectusLanguages } = useDirectusLanguages();

const directusLanguages = ref<string[]>([]);

watch(() => settings, (s) => {
  if (s.value?.language_collection && s.value?.language_code_field) {
    fetchDirectusLanguages(s.value?.language_collection, s.value?.language_code_field).then((languages) => {
      directusLanguages.value = languages;
    });
  }
}, { immediate: true, deep: true });

const languageRows = computed((): Row[] => {
  const localazyLanguages = (localazyProject.value?.languages || []);
  const localazyLocales = localazyLanguages.map((l) => l.code);
  // const allLanguages = uniq([...directusLanguages.value, ...localazyLocales]);

  const allLanguages = [...directusLanguages.value, ...localazyLocales]
    .map((locale) => {
      const directusFormLocale = DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage(locale);
      const localazyFormLocale = DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage(locale);
      const localazyLanguage = findLocalazyLanguageByLocale(localazyFormLocale);
      const projectLanguage = localazyLanguages.find((l) => l.code === localazyFormLocale);

      return {
        locale,
        localazyId: localazyLanguage?.localazyId,
        englishName: localazyLanguage?.name,
        localazy: {
          present: localazyLocales.includes(locale),
          presentMapped: localazyLocales.includes(localazyFormLocale),
          mappedTo: localazyFormLocale,
          hidden: (projectLanguage as any)?.published === false,
        },
        directus: {
          present: directusLanguages.value.includes(locale),
          presentMapped: directusLanguages.value.includes(directusFormLocale),
          mappedTo: directusFormLocale,
          recoznigedInLocalazy: !!localazyLanguage,
        },
      } as Row;
    });

  return uniqWith(allLanguages, (arrVal, othVal) => {
    if (arrVal.directus.present !== othVal.directus.present) {
      return DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage(arrVal.locale)
        === DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage(othVal.locale);
    }
    return arrVal.locale === othVal.locale;
  })
    .sort((a, b) => {
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
@import '../../styles/mixins/common';

.languages-table {
  @include common;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
}

.unknown-language {
  color: var(--danger);
}

.hidden-language {
  color: var(--info);
}
</style>
