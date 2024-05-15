<template>
  <div>
    <v-divider :inline-title="false" large>
      Localazy project
    </v-divider>

    <div class="form grid">
      <div class="full">
        <logout-button v-if="isLoggedIn" />
        <login-button v-else />
      </div>
    </div>

    <v-divider :inline-title="false" large>
      Directus project
    </v-divider>
    <div class="form">
      <div class="half">
        <p class="type-label">Languages collection</p>
        <v-select
          v-model="localEdits.language_collection"
          :items="possibleLanguageCollections"
          :disabled="isDemo"
        />
        <p class="note input-note">
          Read an <a href="https://docs.directus.io/guides/headless-cms/content-translations.html" target="_blank">official guide</a>
          how to prepare Directus for content translation
        </p>
      </div>
      <div class="half-right" />

      <div class="half">
        <p class="type-label">Language code field</p>
        <v-select
          :disabled="!localEdits.language_collection || isDemo"
          v-model="localEdits.language_code_field"
          :items="possibleLanguageCodeFields"
        />
        <p class="note input-note">
          Field representing the <a href="https://www.iso.org/iso-639-language-codes.html" target="_blank">ISO 639</a>
          code of the language (e.g.en for English)
        </p>
      </div>
      <div class="half-right" />

      <div class="half">
        <p class="type-label">Source language</p>
        <v-select
          :disabled="!localEdits.language_code_field || isDemo"
          v-model="localEdits.source_language"
          :items="languageSelectOptions"
          :class="{ 'input-error': !localEdits.language_code_field || isNotRecognizedLocalazyLanguage }"
        />
        <p class="note input-note input-note-error" v-if="isNotRecognizedLocalazyLanguage">
          Selected language doesn't match any <a href="https://www.iso.org/iso-639-language-codes.html" target="_blank">ISO 639</a>
          language code recognized by Localazy.
        </p>
        <p class="note input-note" v-else>
          Main language of your content
        </p>
      </div>
      <div class="half-right" />

    </div>
  </div>
</template>

<script lang="ts" setup>
import { useItems, useStores } from '@directus/extensions-sdk';
import {
  PropType, Ref, computed, ref, watch, watchEffect,
} from 'vue';
import { AppCollection, Field, Item } from '@directus/types';
import { storeToRefs } from 'pinia';
import { getLocalazyLanguages } from '@localazy/languages';
import { SelectItem } from '../../models/directus/internals/select-item';
import { Settings } from '../../../../common/models/collections-data/settings';
import { getConfig } from '../../../../common/config/get-config';
import { DirectusLocalazyAdapter } from '../../../../common/services/directus-localazy-adapter';
import LoginButton from './LoginButton.vue';
import LogoutButton from './LogoutButton.vue';
import { useLocalazyStore } from '../../stores/localazy-store';

const props = defineProps({
  edits: {
    type: Object as PropType<Settings>,
    required: true,
  },
  collection: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['update:edits']);

const isDemo = computed(() => getConfig().APP_MODE === 'demo');
const localEdits = computed<Settings>({
  get: () => props.edits,
  set: (value) => {
    emit('update:edits', value);
  },
});

const { useCollectionsStore, useFieldsStore } = useStores();
const { collections } = storeToRefs(useCollectionsStore());
const { getFieldsForCollectionSorted } = useFieldsStore();
const languageCollectionName = computed(() => localEdits.value.language_collection);
const localazyStore = useLocalazyStore();
const {
  hydrate,
} = localazyStore;
const { localazyData } = storeToRefs(localazyStore);

const languagesMap = computed(() => {
  const languages = getLocalazyLanguages();
  const map: Record<string, string> = {};
  languages.forEach((lang) => {
    map[lang.locale] = lang.name;
  });
  return map;
});
const isLoggedIn = computed(() => !!localazyData.value?.access_token);

const isNotRecognizedLocalazyLanguage = computed(() => {
  const directusSourceLanguage = localEdits.value.source_language;
  if (directusSourceLanguage) {
    const localazyForm = DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage(directusSourceLanguage);
    return languagesMap.value[localazyForm] === undefined;
  }
  return false;
});

hydrate();

const { items } = useItems(languageCollectionName, {
  fields: ref(['*']),
  limit: ref(-1),
  sort: ref(null),
  search: ref(null),
  filter: ref(null),
  page: ref(null),
});

const possibleLanguageCollections = (collections?.value as AppCollection[])
  .filter((col) => !col.collection.startsWith('directus_') && !col.collection.startsWith('localazy_'))
  .map((col) => {
    const item: SelectItem = {
      text: col.name,
      value: col.collection,
    };
    return item;
  });

const possibleLanguageCodeFields = computed((): SelectItem[] => {
  const fields = props.edits.language_collection
    ? getFieldsForCollectionSorted(props.edits.language_collection) as Field[]
    : [];

  return fields
    .filter((field) => field.type === 'string')
    .map((field) => {
      const item: SelectItem = {
        text: field.name,
        value: field.field,
      };
      return item;
    });
});

const languages: Ref<Item[]> = ref([]);
const languageSelectOptions = computed(() => languages.value.map((item) => {
  const option: SelectItem = {
    text: item[localEdits.value.language_code_field],
    value: item[localEdits.value.language_code_field],
  };
  return option;
}));

watchEffect(() => {
  const lookupLanguageCollection = possibleLanguageCollections.find((col) => col.value.toLocaleLowerCase() === 'languages');
  if (lookupLanguageCollection) {
    localEdits.value.language_collection = lookupLanguageCollection.value;
  }
});

watchEffect(() => {
  const lookupLanguageCodeField = possibleLanguageCodeFields.value.find((col) => col.value.toLocaleLowerCase() === 'code');
  if (lookupLanguageCodeField) {
    localEdits.value.language_code_field = lookupLanguageCodeField.value;
  }
});

watchEffect(() => {
  const lookupLanguageCodeField = possibleLanguageCodeFields.value.find((col) => col.value.toLocaleLowerCase() === 'code');
  if (lookupLanguageCodeField) {
    localEdits.value.language_code_field = lookupLanguageCodeField.value;
  }
});

watchEffect(() => {
  if (items.value) {
    languages.value = items.value;
  }
});

watch(
  () => localEdits.value.language_collection,
  () => {
    localEdits.value.language_code_field = '';
  },
);

watch(
  () => localEdits.value.language_code_field,
  () => {
    localEdits.value.source_language = '';
  },
);

</script>

<style lang="scss" scoped>
@import '../../styles/mixins/form-grid';
.form {
  @include form-grid;
  max-width: 1300px;
}

.v-form .first-visible-field :deep(.v-divider) {
  margin-top: 0;
}

.v-divider {
  margin-top: 50px;
  margin-bottom: 50px;
  grid-column-start: 1;
  grid-column-end: 3;
}

.bold {
  font-weight: 500;
}

.input-note {
  margin-top: 4px;
  margin-left: 4px;

  margin-bottom: 40px;
  @media (min-width: 960px) {
    margin-bottom: 0;
  }
}

.input-note-error {
  color: var(--danger)!important;
}

.note {
  font-style: italic;
  font-size: 13px;
  line-height: 18px;
  color: var(--foreground-normal);

  & a {
    text-decoration: underline;
  }
}

.input-error {
  & ::v-deep(.input) {
    border-color: var(--danger);
  }
}
</style>
