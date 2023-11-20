export default () => {
  let ready = false;

  apos.util.onReady(() => {
    if (!ready) {
      ready = true;
      apos.bus.$on('export-download', openUrl);
      apos.bus.$on('import-started', addBeforeUnloadListener);
      apos.bus.$on('import-ended', removeBeforeUnloadListener);
      apos.bus.$on('import-locale-differs', handleDifferentLocale);
      apos.bus.$on('import-duplicates', handleDuplicates);
    }
  });

  function openUrl(event) {
    if (event.url) {
      window.open(event.url, '_blank');
    }
  }

  function addBeforeUnloadListener() {
    window.addEventListener('beforeunload', warningImport);
  }

  function removeBeforeUnloadListener() {
    window.removeEventListener('beforeunload', warningImport);
  }

  async function handleDifferentLocale(event) {
    console.log('handleDifferentLocale');
    const result = await apos.modal.execute('AposModalConfirm', event);
    console.log('🚀 ~ file: index.js:31 ~ handleDifferentLocale ~ result:', result);

    if (result) {
      try {
        await apos.http.post('/api/v1/@apostrophecms/import-export/import', {
          body: {
            exportPath: event.exportPath,
            jobId: event.jobId,
            notificationId: event.notificationId
          }
        });
      } catch (error) {
        apos.notify(this.$t('aposImportExport:importFailed'), {
          type: 'danger',
          dismiss: true
        });
      }

      return;
    }

    try {
      await apos.http.post('/api/v1/@apostrophecms/import-export/clean-export', {
        body: {
          exportPath: event.exportPath,
          jobId: event.jobId,
          notificationId: event.notificationId
        }
      });
    } catch (error) {
      apos.notify(this.$t('aposImportExport:importCleanFailed'), {
        type: 'warning',
        interpolate: {
          exportPath: event.exportPath
        }
      });
    }
  }

  async function handleDuplicates(event) {
    if (event.duplicatedDocs.length) {
      await apos.modal.execute('AposDuplicateImportModal', event);
    }
  }

  function warningImport(event) {
    event.preventDefault();
    event.returnValue = '';
  }
};
