export default () => {
  window.apos.util.onReady(openExportUrl);

  function openExportUrl() {
    // For batch operations (i.e when multiples docs are exported)
    window.apos.bus && window.apos.bus.$on('export-download', event => {
      if (!event.downloadUrl) {
        return;
      }
      window.open(event.downloadUrl, '_blank');
    });
  }
};
