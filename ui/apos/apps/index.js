export default () => {
  let ready = false;

  apos.util.onReady(() => {
    if (!ready) {
      ready = true;
      apos.bus.$on('import-export-export-download', openUrl);
      apos.bus.$on('import-export-import-started', addBeforeUnloadListener);
      apos.bus.$on('import-export-import-ended', removeBeforeUnloadListener);
      apos.bus.$on('import-export-import-locale-differs', handleDifferentLocale);
      apos.bus.$on('import-export-import-duplicates', handleDuplicates);
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
    const continueImport = await apos.modal.execute('AposModalConfirm', event);

    if (continueImport) {
      try {
        const moduleAction = apos.modules[event.moduleName].action;

        await apos.http.post(`${moduleAction}/import-export-import`, {
          body: {
            overrideLocale: true,
            exportPath: event.exportPath
          }
        });
      } catch (error) {
        apos.notify('aposImportExport:importFailed', {
          type: 'danger',
          dismiss: true
        });
      }

      return;
    }

    // If not, we still need to clean the uploaded archive
    try {
      await apos.http.post('/api/v1/@apostrophecms/import-export/clean-export', {
        body: {
          exportPath: event.exportPath
        }
      });
    } catch (error) {
      apos.notify('aposImportExport:importCleanFailed', {
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
