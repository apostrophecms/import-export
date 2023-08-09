<template>
  <AposModal
    :modal="modal"
    class="apos-export"
    v-on="{ esc: cancel }"
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
              Export Settings
            </div>
            <div class="apos-export__separator" />
            <div class="apos-export__settings-row apos-export__settings-row--red-colored">
              <div>Document format</div>
              <AposContextMenu
                :menu="[{
                  label: 'JSONP',
                  modifiers: ['selected', 'disabled']
                }]"
                :button="{
                  label: 'JSONP',
                  icon: 'chevron-down-icon',
                  modifiers: ['icon-right', 'disabled', 'export-pieces-format']
                }"
              />
            </div>
            <div class="apos-export__settings-row">
              <div>Include related documents</div>
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
              Related Documents Settings
            </div>
            <div class="apos-export__separator" />
            <div class="apos-export__settings-row apos-export__settings-row--column">
              <div>Include the following document types</div>
              <div v-if="relatedTypes && relatedTypes.length">
                <AposCheckbox
                  v-for="relatedType in relatedTypes"
                  :key="relatedType"
                  v-model="checkedProxy"
                  tabindex="-1"
                  :choice="{
                    value: relatedType,
                    label: relatedType
                  }"
                  :field="{
                    label: relatedType,
                    name: relatedType
                  }"
                  @updated="checkRelatedTypes"
                />
              </div>
              <div v-else>
                No Types
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

  emits: [ 'safe-close', 'modal-result' ],

  data() {
    return {
      modal: {
        active: false,
        showModal: false,
        disableHeader: true
      },
      formValues: null,
      relatedDocumentsDisabled: true,
      relatedTypes: null,
      checkedRelatedTypes: []
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

      if (!this.relatedDocumentsDisabled && !Array.isArray(this.relatedTypes)) {
        this.relatedTypes = await apos.http.get('/api/v1/@apostrophecms/import-export/related', {
          busy: true,
          qs: {
            moduleName: this.moduleName
          }
        });
      }
    },
    checkRelatedTypes(evt) {
      if (evt.target.checked) {
        this.checkedRelatedTypes.push(evt.target.value);
      } else {
        this.checkedRelatedTypes = this.checkedRelatedTypes.filter(relatedType => relatedType !== evt.target.value);
      }
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
  padding: 20px 35px;
}

::v-deep .apos-modal__body-main {
  display: flex;
  flex-direction: column;
  align-items: baseline;
}

::v-deep .apos-button.apos-button--export-pieces-format {
  background-color: var(--a-danger);
  color: var(--a-text-primary);
  border: 1px solid var(--a-text-primary);
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
  display: flex;
  flex-direction: column;
  align-items: baseline;
  min-width: 340px;
  font-size: var(--a-type-large);
}

.apos-export__settings {
  font-size: var(--a-type-large);
  font-weight: 600;
  color: var(--a-base-3);
  margin-top: 20px;
}

.apos-export__settings-row {
  font-size: var(--a-type-large);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 70px;
  height: 43px;
  width: 100%;
}

.apos-export__settings-row--red-colored {
  background-color: var(--a-danger);
  opacity: 0.5;
  position: relative;

  &::before {
    content: "";
    background-color: var(--a-danger);
    position: absolute;
    height: 100%;
    width: 110%;
    left: -5%;
    z-index: -1;
  }
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
  width: 120%;
  left: -10%;
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
