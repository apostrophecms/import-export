<template>
  <AposModal
    :modal="modal"
    class="apos-export-pieces"
    v-on="{ esc: cancel }"
    @no-modal="$emit('safe-close')"
    @inactive="modal.active = false"
    @show-modal="modal.showModal = true"
    @ready="ready"
  >
    <template #main>
      <AposModalBody>
        <template #bodyMain>
          <h2 class="apos-export-pieces__heading">
            {{ $t('aposImportExport:export') }} {{ moduleLabel }}
          </h2>
          <p
            class="apos-export-pieces__description"
          >
            {{ $t('aposImportExport:exportModalDescription', { count, type: moduleLabel }) }}
          </p>
          <div class="apos-export-pieces__settings">
            Export settings
          </div>
          <div class="apos-export-pieces__separator"></div>
          <div class="apos-export-pieces__settings-row apos-export-pieces__settings-row--red-colored">
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
          <div class="apos-export-pieces__settings-row">
            <div>Include related documents</div>
            <AposToggle v-model="unrelatedDocumentsDisabled" />
          </div>
          <div class="apos-export-pieces__separator apos-export-pieces__separator--full-width"></div>

          <div class="apos-export-pieces__btns">
            <AposButton
              class="apos-export-pieces__btn"
              label="apostrophe:cancel"
              @click="cancel"
            />
            <AposButton
              ref="exportPieces"
              class="apos-export-pieces__btn"
              label="aposImportExport:export"
              type="primary"
              @click="exportPieces"
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
      unrelatedDocumentsDisabled: true
    };
  },

  computed: {
    moduleLabel() {
      const moduleOptions = window.apos.modules[this.moduleName];
      const label = this.count > 1 ? moduleOptions.pluralLabel : moduleOptions.label;
      return this.$t(label).toLowerCase();
    }
  },

  async mounted() {
    this.modal.active = true;
  },

  methods: {
    ready() {
      this.$refs.exportPieces.$el.querySelector('button').focus();
    },
    exportPieces() {
      this.modal.showModal = false;
      const result = true;
      this.$emit('modal-result', result);
    },
    async cancel() {
      this.modal.showModal = false;
      this.$emit('modal-result', false);
    }
  }
};
</script>

<style lang="scss" scoped>
.apos-export-pieces {
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
  max-width: 700px;
  height: auto;
  text-align: center;
}

::v-deep .apos-modal__overlay {
  .apos-modal+.apos-export-pieces & {
    display: block;
  }
}

::v-deep .apos-modal__body {
  padding: 30px;
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

.apos-export-pieces__heading {
  @include type-title;
  line-height: var(--a-line-tall);
  margin: 0;
  text-transform: capitalize;
}

.apos-export-pieces__description {
  @include type-base;
  font-size: var(--a-type-large);
  max-width: 370px;
  line-height: var(--a-line-tallest);
}

.apos-export-pieces__settings {
  font-size: var(--a-type-large);
  font-weight: 600;
  color: var(--a-base-3);
  margin-top: 20px;
}

.apos-export-pieces__settings-row {
  font-size: var(--a-type-large);
  display: flex;
  align-items: center;
  gap: 70px;
  height: 43px;
}

.apos-export-pieces__settings-row--red-colored {
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

.apos-export-pieces__separator {
  background-color: var(--a-base-8);
  position: relative;
  height: 1px;
  width: 100%;
  margin: 10px 0;
}

.apos-export-pieces__separator--full-width::before {
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

.apos-export-pieces__btns {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  width: 100%;
  gap: 20px;
}
</style>
