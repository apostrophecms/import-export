export default () => {
  let ready = false;

  apos.util.onReady(() => {
    if (!ready) {
      ready = true;
      apos.bus.$on('export-download', openUrl);
      apos.bus.$on('import-started', addBeforeUnloadListener);
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

  async function handleDuplicates(event) {
    if (event.duplicatedDocs.length) {
      await apos.modal.execute('AposDuplicateImportModal', {
        docs: event.duplicatedDocs,
        importedAttachments: event.importedAttachments,
        type: event.type,
        exportPath: event.exportPath
      });
    }

    window.removeEventListener('beforeunload', warningImport);
  }

  function warningImport(event) {
    event.preventDefault();
    event.returnValue = 'You are currently importing document, you should stay during the process.';
  }
};
