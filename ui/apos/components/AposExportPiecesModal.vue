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
      formValues: null
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
  padding: 60px;
}

::v-deep .apos-modal__body-main {
  display: flex;
  flex-direction: column;
  align-items: baseline;
}

.apos-export-pieces__heading {
  @include type-title;
  line-height: var(--a-line-tall);
  margin: 0;
  text-transform: capitalize;
}

.apos-export-pieces__description {
  @include type-base;
  max-width: 370px;
  line-height: var(--a-line-tallest);
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
