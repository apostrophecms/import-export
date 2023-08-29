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
            {{ $t('aposImportExport:export', { type: moduleLabel }) }}
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
              <AposSelect
                :choices="extensions"
                :selected="extension"
                @change="onExtensionChange"
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

          <transition
            name="fade"
            :duration="200"
          >
            <div
              v-show="!relatedDocumentsDisabled"
              class="apos-export__section"
            >
              <div
                ref="container"
                class="apos-export__section-container"
              >
                <div class="apos-export__settings">
                  {{ $t('aposImportExport:exportModalIncludeRelatedSettings') }}
                </div>
                <div class="apos-export__separator" />
                <div class="apos-export__settings-row apos-export__settings-row--column">
                  <div class="apos-export__related-description">
                    {{ $t('aposImportExport:exportModalRelatedDocumentDescription') }}
                  </div>
                  <div
                    v-if="relatedTypes && relatedTypes.length"
                    class="apos-export__related-list"
                  >
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
            </div>
          </transition>

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
              :label="$t('aposImportExport:export', { type: moduleLabel })"
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
const CONTAINER_ITEM_HEIGHT = 24;
const CONTAINER_DESCRIPTION_HEIGHT = 95;
const CONTAINER_MINIMUM_HEIGHT = 120;

export default {
  props: {
    moduleName: {
      type: String,
      default: ''
    },
    checked: {
      type: Array,
      default: null
    },
    doc: {
      type: Object,
      default: null
    },
    action: {
      type: String,
      required: true
    },
    messages: {
      type: Object,
      default: () => ({})
    }
  },

  emits: [ 'change', 'safe-close', 'modal-result' ],

  data() {
    return {
      modal: {
        active: false,
        type: 'overlay',
        showModal: false,
        disableHeader: true
      },
      formValues: null,
      relatedDocumentsDisabled: true,
      relatedChildrenDisabled: true,
      relatedTypes: null,
      checkedRelatedTypes: [],
      type: this.moduleName,
      extension: 'zip'
    };
  },

  computed: {
    moduleLabel() {
      const moduleOptions = apos.modules[this.moduleName];
      const label = this.checked?.length > 1
        ? moduleOptions.pluralLabel
        : moduleOptions.label;

      return this.$t(label).toLowerCase();
    },

    checkedProxy: {
      get() {
        return this.checkedRelatedTypes;
      },
      set(val) {
        this.$emit('change', val);
      }
    },

    count() {
      return this.checked?.length || 1;
    },

    extensions() {
      return window.apos.modules['@apostrophecms/import-export'].extensions;
    }
  },

  async mounted() {
    this.modal.active = true;

    if (this.type === '@apostrophecms/page') {
      this.type = this.doc?.type;
    }
  },

  methods: {
    ready() {
      this.$refs.exportDocs.$el.querySelector('button').focus();
    },
    async exportDocs() {
      const docsId = this.checked
        ? this.checked
        : [ this.doc?._id ];

      const relatedTypes = this.relatedDocumentsDisabled
        ? []
        : this.checkedRelatedTypes;

      const { action } = window.apos.modules[this.moduleName];
      const result = await window.apos.http.post(`${action}/${this.action}`, {
        busy: true,
        body: {
          _ids: docsId,
          relatedTypes,
          messages: this.messages,
          extension: this.extension
        }
      });

      this.modal.showModal = false;
      this.$emit('modal-result', result);
    },
    async cancel() {
      this.modal.showModal = false;
      this.$emit('modal-result', false);
    },
    async toggleRelatedDocuments() {
      this.relatedDocumentsDisabled = !this.relatedDocumentsDisabled;

      if (!this.relatedDocumentsDisabled && this.relatedTypes === null) {
        this.relatedTypes = await apos.http.get('/api/v1/@apostrophecms/import-export/related', {
          busy: true,
          qs: {
            type: this.type
          }
        });
        this.checkedRelatedTypes = this.relatedTypes;
        const height = this.checkedRelatedTypes.length ? this.checkedRelatedTypes.length * CONTAINER_ITEM_HEIGHT + CONTAINER_DESCRIPTION_HEIGHT : CONTAINER_MINIMUM_HEIGHT;
        this.$refs.container.style.setProperty('--container-height', `${height}px`);
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
      const moduleOptions = apos.modules[moduleName];
      return this.$t(moduleOptions.label);
    },
    onExtensionChange(value) {
      this.extension = this.extensions.find(extension => extension.value === value).value;
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
  padding: 30px 20px;
  width: 375px;
}

::v-deep .apos-modal__body-main {
  display: flex;
  flex-direction: column;
  align-items: baseline;
}

::v-deep .apos-toggle__slider {
  display: flex;
}

::v-deep .apos-input--select {
  text-transform: capitalize;
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
  margin-top: 5px;
}

.apos-export__section {
  @include type-base;
  display: flex;
  flex-direction: column;
  align-items: baseline;
  min-width: 100%;
}

.apos-export__section-container {
  overflow: hidden;
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
  background-color: var(--a-base-9);
  position: relative;
  height: 1px;
  width: calc(100% - 10px);
  margin: 10px 0;
}

.apos-export__separator--full-width::before {
  content: "";
  background-color: var(--a-base-9);
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

.apos-export__btn ::v-deep .apos-button__label {
  text-transform: capitalize;
}

.apos-export__related-list {
  max-height: 210px;
  overflow-y: overlay;
  width: 100%;
}

.fade-enter-active {
  .apos-export__section-container {
    animation: expand .3s;
  }
}
.fade-leave-active {
  .apos-export__section-container {
    animation: expand .3s reverse;
  }
}

@keyframes expand {
  0% {
    height: 0;
  }

  100% {
    height: var(--container-height);
  }
}
</style>
