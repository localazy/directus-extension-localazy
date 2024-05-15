<template>
  <div>
    <div class="form grid">
      <div class="half">
        <p class="type-label">Automated upload to Localazy</p>
        <v-select
          v-model="localEdits.automated_upload"
          :items="automatedUploadOptions"
        />

      </div>
      <div class="half-right">
        <p class="configuration-description note">
          When enabled, content will be automatically uploaded to Localazy after its creation or update in Directus.
        </p>
      </div>

      <div class="half">
        <p class="type-label">Automated deprecation of Localazy source keys on deletion</p>
        <v-select
          v-model="localEdits.automated_deprecation"
          :items="automatedDeprecationOptions"
        />

      </div>
      <div class="half-right">
        <p class="configuration-description note">
          When enabled, Localazy source keys will be automatically set as
          <a href="https://localazy.com/faq/localazy/what-is-the-difference-between-hidden-and-deprecated-source-keys" target="_blank">
            deprecated
          </a>
          if an entry in source language is deleted in Directus.
        </p>
      </div>

      <div class="half">
        <p class="type-label">Source language synchronization</p>
        <v-select
          v-model="localEdits.import_source_language"
          :items="importSourceLanguageOptions"
        />

      </div>
      <div class="half-right">
        <p class="configuration-description note">
          When enabled, the import process will update the source language values in Directus. <br>
          You can choose either Directus or Localazy as the "Source of Truth" for modifying existing values to avoid conflicts.
        </p>
      </div>

      <div class="half">
        <p class="type-label">Export translations from Directus</p>
        <v-select
          v-model="localEdits.upload_existing_translations"
          :items="uploadExistingTranslationsOptions"
        />

      </div>
      <div class="half-right">
        <p class="configuration-description note">
          Enable the option to export all translation values from Directus,
          including content in languages other than the source language.<br>
          It is recommended to turn this feature on only for the initial synchronization and then disable it to speed up the export process.
        </p>
      </div>

      <div class="half">
        <p class="type-label">Empty values</p>
        <v-select
          v-model="localEdits.skip_empty_strings"
          :items="skipEmptyStringsOptions"
        />

      </div>
      <div class="half-right">
        <p class="configuration-description note">
          Choose whether to upload empty values. <br>
          This is useful when <span class="bold">Source language synchronization</span> is turned on since
          this allows you to finalize the source language content in Localazy.
        </p>
      </div>

      <div class="half">
        <p class="type-label">Synchronize Localazy languages</p>
        <v-select
          v-model="localEdits.create_missing_languages_in_directus"
          :items="directusMissingLanguagesOptions"
        />

      </div>
      <div class="half-right">
        <p class="configuration-description note">
          Automatically create missing languages in Directus when importing translations from Localazy.
        </p>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { PropType, computed, ref } from 'vue';
import { Item } from '@directus/types';
import { Settings } from '../../../../common/models/collections-data/settings';
import { CreateMissingLanguagesInDirectus } from '../../../../common/enums/create-missing-languages-in-directus';

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
const localEdits = computed<Settings>({
  get: () => props.edits,
  set: (value) => emit('update:edits', value),
});

const importSourceLanguageOptions = ref<Item[]>([
  {
    text: 'Import source language from Localazy',
    value: 1,
  },
  {
    text: "Don't import source language from Localazy",
    value: 0,
  },
]);

const uploadExistingTranslationsOptions = ref<Item[]>([
  {
    text: 'Export translations from Directus',
    value: 1,
  },
  {
    text: "Don't export translations from Directus",
    value: 0,
  },
]);

const skipEmptyStringsOptions = ref<Item[]>([
  {
    text: "Don't upload empty values to Localazy",
    value: 1,
  },
  {
    text: 'Upload empty values to Localazy',
    value: 0,
  },
]);

const directusMissingLanguagesOptions = ref<Item[]>([
  {
    text: 'Create non-hidden missing languages in Directus',
    value: CreateMissingLanguagesInDirectus.ONLY_NON_HIDDEN,
  },
  {
    text: 'Create all missing languages in Directus',
    value: CreateMissingLanguagesInDirectus.ALL,
  },
  {
    text: "Don't create missing languages in Directus",
    value: CreateMissingLanguagesInDirectus.NO,
  },
]);

const automatedUploadOptions = ref<Item[]>([
  {
    text: 'Allow automated upload',
    value: 1,
  },
  {
    text: 'Disable automated upload',
    value: 0,
  },
]);

const automatedDeprecationOptions = ref<Item[]>([
  {
    text: 'Allow automated deprecation',
    value: 1,
  },
  {
    text: 'Disable automated deprecation',
    value: 0,
  },
]);

</script>

<style lang="scss" scoped>
@import '../../styles/mixins/form-grid';
.form {
  @include form-grid;
  max-width: 1300px;
}

.configuration-description {
  margin-bottom: 40px;
  @media (min-width: 960px) {
    margin-top: 24px;
    margin-bottom: 0;
  }
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

.note {
  font-style: italic;
  font-size: 13px;
  line-height: 18px;
  color: var(--foreground-normal);

  & a {
    text-decoration: underline;
  }
}
</style>
