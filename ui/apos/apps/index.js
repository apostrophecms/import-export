export default () => {
  let ready = false;

  window.apos.util.onReady(() => {
    if (!ready) {
      ready = true;
      window.apos.bus.$on('export-download', openUrl);
      window.apos.bus.$on('import-duplicates', handleDuplicates);
    }
  });

  function openUrl(event) {
    if (event.url) {
      window.open(event.url, '_blank');
    }
  }

  function handleDuplicates(event) {
    // TODO: display modal to handle duplicates?
    console.log('event.duplicatedDocs', event.duplicatedDocs);
    console.log('event.duplicatedAttachments', event.duplicatedAttachments);
  }
};
