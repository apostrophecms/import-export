<template>
  <AposModal
    :modal="modal"
    class="apos-export"
    @esc="cancel"
    @no-modal="$emit('safe-close')"
    @inactive="modal.active = false"
    @show-modal="modal.showModal = true"
    @ready="ready"
  >
    <template #main>
      <AposModalBody>
        <template #bodyMain>
          <h2 class="apos-export__heading">
            {{ $t('aposImportExport:export') }} {{ moduleLabel }}
          </h2>
          <p
            class="apos-export__description"
          >
            {{ $t('aposImportExport:exportModalDescription', { count, type: moduleLabel }) }}
          </p>

          <div class="apos-export__section">
            <div class="apos-export__settings">
              {{ $t('aposImportExport:exportModalSettingsLabel') }}
            </div>
            <div class="apos-export__separator" />

            <div class="apos-export__settings-row">
              <div>{{ $t('aposImportExport:exportModalDocumentFormat') }}</div>
              <AposContextMenu
                disabled
                :button="{
                  label: 'ZIP',
                  icon: 'chevron-down-icon',
                  modifiers: ['icon-right', 'disabled']
                }"
              />
            </div>

            <div
              v-if="moduleName === '@apostrophecms/page'"
              class="apos-export__settings-row"
            >
              <div>{{ $t('aposImportExport:exportModalIncludeChildren') }}</div>
              <AposToggle
                v-model="relatedChildrenDisabled"
                class="apos-export__toggle"
                @toggle="toggleRelatedChildren"
              />
            </div>

            <div class="apos-export__settings-row">
              <div>{{ $t('aposImportExport:exportModalIncludeRelated') }}</div>
              <AposToggle
                v-model="relatedDocumentsDisabled"
                class="apos-export__toggle"
                @toggle="toggleRelatedDocuments"
              />
            </div>
          </div>

          <div
            v-show="!relatedDocumentsDisabled"
            class="apos-export__section"
          >
            <div class="apos-export__settings">
              {{ $t('aposImportExport:exportModalIncludeRelatedSettings') }}
            </div>
            <div class="apos-export__separator" />
            <div class="apos-export__settings-row apos-export__settings-row--column">
              <div class="apos-export__related-description">
                {{ $t('aposImportExport:exportModalRelatedDocumentDescription') }}
              </div>
              <div v-if="relatedTypes && relatedTypes.length">
                <AposCheckbox
                  v-for="relatedType in relatedTypes"
                  :key="relatedType"
                  v-model="checkedProxy"
                  tabindex="-1"
                  :choice="{
                    value: relatedType,
                    label: getRelatedTypeLabel(relatedType)
                  }"
                  :field="{
                    label: getRelatedTypeLabel(relatedType),
                    name: relatedType
                  }"
                  @updated="checkRelatedTypes"
                />
              </div>
              <div v-else>
                {{ $t('aposImportExport:exportModalNoRelatedTypes') }}
              </div>
            </div>
          </div>

          <div class="apos-export__separator apos-export__separator--full-width" />

          <div class="apos-export__btns">
            <AposButton
              class="apos-export__btn"
              label="apostrophe:cancel"
              @click="cancel"
            />
            <AposButton
              ref="exportDocs"
              icon="apos-import-export-download-icon"
              class="apos-export__btn"
              label="aposImportExport:export"
              type="primary"
              @click="exportDocs"
            />
          </div>
        </template>
      </AposModalBody>
    </template>
  </AposModal>
</template>

<script>
export default {
  props: {
    moduleName: {
      type: String,
      default: ''
    },
    count: {
      type: Number,
      default: 1
    }
  },

  emits: [ 'change', 'safe-close', 'modal-result' ],

  data() {
    return {
      modal: {
        active: false,
        showModal: false,
        disableHeader: true
      },
      formValues: null,
      relatedDocumentsDisabled: true,
      relatedChildrenDisabled: true,
      relatedTypes: null,
      checkedRelatedTypes: [],
      type: this.moduleName
    };
  },

  computed: {
    moduleLabel() {
      const moduleOptions = window.apos.modules[this.moduleName];
      const label = this.count > 1 ? moduleOptions.pluralLabel : moduleOptions.label;
      return this.$t(label).toLowerCase();
    },

    checkedProxy: {
      get() {
        return this.checkedRelatedTypes;
      },
      set(val) {
        this.$emit('change', val);
      }
    }
  },

  async mounted() {
    this.modal.active = true;

    if (this.type === '@apostrophecms/page') {
      this.type = this.$attrs.doc?.type;
    }
  },

  methods: {
    ready() {
      this.$refs.exportDocs.$el.querySelector('button').focus();
    },
    exportDocs() {
      this.modal.showModal = false;
      const result = true;
      this.$emit('modal-result', result);
    },
    async cancel() {
      this.modal.showModal = false;
      this.$emit('modal-result', false);
    },
    async toggleRelatedDocuments() {
      this.relatedDocumentsDisabled = !this.relatedDocumentsDisabled;

      if (!this.relatedDocumentsDisabled && this.relatedTypes === null) {
        this.relatedTypes = await window.apos.http.get('/api/v1/@apostrophecms/import-export/related', {
          busy: true,
          qs: {
            type: this.type
          }
        });
      }
    },
    toggleRelatedChildren() {
      this.relatedChildrenDisabled = !this.relatedChildrenDisabled;
    },
    checkRelatedTypes(evt) {
      if (evt.target.checked) {
        this.checkedRelatedTypes.push(evt.target.value);
      } else {
        this.checkedRelatedTypes = this.checkedRelatedTypes.filter(relatedType => relatedType !== evt.target.value);
      }
    },
    getRelatedTypeLabel(moduleName) {
      const moduleOptions = window.apos.modules[moduleName];
      return this.$t(moduleOptions.label);
    }
  }
};
</script>

<style lang="scss" scoped>
.apos-export {
  z-index: $z-index-modal;
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

::v-deep .apos-modal__inner {
  top: auto;
  right: auto;
  bottom: auto;
  left: auto;
  height: auto;
  text-align: left;
}

::v-deep .apos-modal__overlay {
  .apos-modal+.apos-export & {
    display: block;
  }
}

::v-deep .apos-modal__body {
  padding: 20px 30px;
  width: 335px;
}

::v-deep .apos-modal__body-main {
  display: flex;
  flex-direction: column;
  align-items: baseline;
}

::v-deep .apos-toggle__slider {
  display: flex;
}

.apos-export__heading {
  @include type-title;
  line-height: var(--a-line-tall);
  margin: 0;
  text-transform: capitalize;
}

.apos-export__description {
  @include type-base;
  font-size: var(--a-type-large);
  text-align: left;
  line-height: var(--a-line-tallest);
}

.apos-export__section {
  @include type-base;
  display: flex;
  flex-direction: column;
  align-items: baseline;
  min-width: 100%;
}

.apos-export__settings {
  @include type-base;
  font-weight: 600;
  color: var(--a-base-3);
  margin-top: 20px;
}

.apos-export__settings-row {
  font-size: var(--a-type-base);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 70px;
  height: 43px;
  width: 100%;
}

.apos-export__settings-row--column {
  flex-direction: column;
  gap: 20px;
  align-items: baseline;
  height: auto;
  margin-bottom: 20px;
}

.apos-export__separator {
  background-color: var(--a-base-8);
  position: relative;
  height: 1px;
  width: 100%;
  margin: 10px 0;
}

.apos-export__separator--full-width::before {
  content: "";
  background-color: var(--a-base-8);
  position: absolute;
  height: 100%;
  width: calc(100% + 60px);
  left: -30px;
  right: 0;
}

::v-deep .apos-schema .apos-field {
  margin-bottom: $spacing-base;
}

.apos-export__btns {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  width: 100%;
  gap: 20px;
}
</style>
