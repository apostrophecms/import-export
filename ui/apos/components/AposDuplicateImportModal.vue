<template>
  <AposModal
    :modal="modal"
    class="apos-import-duplicate"
    @esc="cancel"
    @no-modal="$emit('safe-close')"
    @inactive="modal.active = false"
    @show-modal="modal.showModal = true"
    @ready="ready"
  >
    <template #main>
      <AposModalBody>
        <template #bodyMain>
          <h2 class="apos-import-duplicate__heading">
            {{ $t('aposImportExport:import', { type: moduleLabel }) }}
          </h2>
          <p class="apos-import-duplicate__description">
            <strong>{{ $t('aposImportExport:importDuplicateDetected') }}</strong><br>
            {{ $t('aposImportExport:importDuplicateMessage') }}
          </p>

          <div class="apos-import-duplicate__section">
            <AposButton
              class="apos-context-menu__btn"
              data-apos-test="contextMenuTrigger"
              :label="checked.length ? 'apostrophe:deselectAll' : 'apostrophe:selectAll'"
              type="quiet"
              role="button"
              @click.stop="deselect"
            />

            <div class="apos-import-duplicate__separator" />
            <div class="apos-import-duplicate__docs-list">
              <AposCheckbox
                v-for="doc in draftDocs"
                :key="doc.aposDocId"
                v-model="checkedProxy"
                tabindex="-1"
                :choice="{
                  value: doc.aposDocId,
                  label: doc.title
                }"
                :field="{
                  label: doc.title,
                  name: doc.aposDocId
                }"
                @updated="checkDoc"
              />
            </div>
          </div>

          <div class="apos-import-duplicate__separator apos-import-duplicate__separator--full-width" />

          <div class="apos-import-duplicate__btns">
            <AposButton
              class="apos-import-duplicate__btn"
              label="apostrophe:cancel"
              @click="cancel"
            />
            <AposButton
              ref="runImport"
              class="apos-import-duplicate__btn"
              :label="$t('aposImportExport:importDuplicateContinue')"
              type="primary"
              @click="runImport"
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
    type: {
      type: String,
      required: true
    },
    docs: {
      type: Array,
      required: true
    }
  },

  emits: [ 'safe-close', 'change' ],

  data() {
    return {
      modal: {
        active: false,
        type: 'overlay',
        showModal: false,
        disableHeader: true
      },
      draftDocs: this.docs.filter(({ aposMode }) => aposMode === 'draft'),
      checked: []
    };
  },

  computed: {
    moduleLabel() {
      const moduleOptions = apos.modules[this.type];
      const label = moduleOptions.pluralLabel;

      return this.$t(label).toLowerCase();
    },
    checkedProxy: {
      get() {
        return this.checked;
      },
      set(val) {
        console.log('val', val);
        console.log('this.checked', this.checked);
        this.$emit('change', val);
      }
    }
  },

  async mounted() {
    this.modal.active = true;
    this.checked = this.draftDocs.map(({ aposDocId }) => aposDocId);

    console.log('this.checked', this.checked);
  },

  methods: {
    ready() {
      this.$refs.runImport.$el.querySelector('button').focus();
    },
    async runImport() {
      const { action } = window.apos.modules[this.moduleName];

      try {
        await window.apos.http.post(`${action}/${this.action}`, {
          busy: true,
          body: {
            _ids: this.selectedDocIds,
            messages: this.messages,
            formatName: this.formatName
          }
        });
      } catch (error) {
        apos.notify(this.$t('aposImportExport:exportFailed'), {
          type: 'danger',
          dismiss: true
        });
      }

      this.modal.showModal = false;
    },
    async cancel() {
      this.modal.showModal = false;
    },
    toggleRelatedChildren() {
      this.relatedChildrenDisabled = !this.relatedChildrenDisabled;
    },
    checkDoc(evt) {
      const docId = evt.target.value;
      if (this.checked.includes(docId)) {
        this.checked = this.checked.filter((id) => id !== docId);
      } else {
        this.checked.push(docId);
      }
    },
    getRelatedTypeLabel(moduleName) {
      const moduleOptions = apos.modules[moduleName];
      return this.$t(moduleOptions.label);
    },
    onFormatChange(formatName) {
      this.formatName = this.formats.find(format => format.name === formatName).name;
    },
    deselect() {
      this.checked = this.checked.length
        ? []
        : this.draftDocs.map(({ aposDocId }) => aposDocId);
    }
  }
};
</script>

<style lang="scss" scoped>
.apos-import-duplicate {
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

.apos-import-duplicate__heading {
  @include type-title;
  line-height: var(--a-line-tall);
  margin: 0;
  text-transform: capitalize;
}

.apos-import-duplicate__description {
  @include type-base;
  font-size: var(--a-type-large);
  text-align: left;
  line-height: var(--a-line-tallest);
  margin-top: 15px;
  margin-bottom: 20px;
  padding: 10px;
  background-color: var(--a-warning-fade);
  color: var(--a-warning-dark);
}

.apos-import-duplicate__section {
  @include type-base;
  display: flex;
  flex-direction: column;
  align-items: baseline;
  min-width: 100%;
  width: 100%;
}

.apos-import-duplicate__settings {
  @include type-base;
  font-weight: 600;
  color: var(--a-base-3);
  margin-top: 20px;
}

.apos-import-duplicate__docs-list {
  width: 100%;
  max-height: calc(60vh - 220px);
  overflow-y: auto;
  padding-bottom: 15px;
}

.apos-import-duplicate__separator {
  background-color: var(--a-base-9);
  position: relative;
  height: 1px;
  width: calc(100% - 10px);
  margin: 10px 0;
}

.apos-import-duplicate__separator--full-width::before {
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

.apos-import-duplicate__btns {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  width: 100%;
  gap: 20px;
}

.apos-import-duplicate__btn ::v-deep .apos-button__label {
  text-transform: capitalize;
}

.apos-import-duplicate__related-list {
  max-height: 210px;
  overflow-y: overlay;
  width: 100%;
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
