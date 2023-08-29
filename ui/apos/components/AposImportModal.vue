<template>
  <AposModal
    class="apos-import"
    :modal="modal"
    @esc="cancel"
    @no-modal="$emit('safe-close')"
    @inactive="modal.active = false"
    @show-modal="modal.showModal = true"
    @ready="ready"
  >
    <template #main>
      <AposModalBody>
        <template #bodyMain>
          <h2 class="apos-import__heading">
            {{ $t('aposImportExport:import', { type: $t(labels.plural) }) }}
          </h2>
          <!-- eslint-disable vue/no-v-html -->
          <p
            class="apos-import__description"
            v-html="$t('aposImportExport:importModalDescription')"
          />
          <!-- eslint-enable vue/no-v-html -->
          <AposFile
            class="apos-import__file"
            allowed-extensions=".zip"
            @upload-file="uploadImportFile"
            @update="updateImportFile"
          />

          <div class="apos-import__separator" />

          <div class="apos-import__btns">
            <AposButton
              ref="cancelButton"
              class="apos-import__btn"
              label="apostrophe:cancel"
              @click="cancel"
            />
            <AposButton
              class="apos-import__btn"
              icon="apos-import-export-upload-icon"
              :label="$t('aposImportExport:import', { type: $t(labels.plural) })"
              type="primary"
              :disabled="!selectedFile"
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
    labels: {
      type: Object,
      default: () => ({
        singular: '',
        plural: ''
      })
    }
  },
  emits: [ 'safe-close' ],

  data () {
    return {
      modal: {
        active: false,
        type: 'overlay',
        showModal: false,
        disableHeader: true
      },
      selectedFile: null
    };
  },

  mounted() {
    this.modal.active = true;
  },

  methods: {
    ready() {
      this.$refs.cancelButton.$el.querySelector('button').focus();
    },
    uploadImportFile (file) {
      this.selectedFile = file || null;
    },
    updateImportFile () {
      this.selectedFile = null;
    },
    cancel () {
      this.modal.showModal = false;
    },
    async runImport () {
      // TODO: implement

      this.modal.showModal = false;
    }
  }
};
</script>

<style scoped lang='scss'>
.apos-import {
  z-index: $z-index-modal;
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  &__heading {
    @include type-title;
    line-height: var(--a-line-tall);
    margin: 0;
  }

  &__description {
    @include type-base;
    max-width: 370px;
    line-height: var(--a-line-tallest);
  }

  &__file {
    min-width: 370px;
  }

  &__separator {
    background-color: var(--a-base-9);
    position: relative;
    height: 1px;
    width: calc(100% - 10px);
    margin: 10px 0;

    &::before {
      content: "";
      background-color: var(--a-base-9);
      position: absolute;
      height: 100%;
      width: calc(100% + 60px);
      left: -30px;
      right: 0;
    }
  }

  &__btns {
    display: flex;
    justify-content: space-between;
    margin-top: 10px;
    width: 100%;
  }

  &__btn {
    & + & {
      margin-left: $spacing-double;
    }
  }
}

::v-deep {
  .apos-modal__inner {
    top: auto;
    right: auto;
    bottom: auto;
    left: auto;
    max-width: 700px;
    height: auto;
    text-align: left;
  }

  .apos-modal__body-main {
    display: flex;
    flex-direction: column;
    align-items: baseline;
  }

  .apos-modal__body {
    padding: 30px 20px;
  }
}

</style>
