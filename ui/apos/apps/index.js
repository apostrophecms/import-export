export default () => {
  window.apos.util.onReady(openExportUrl);

  function openExportUrl() {
    window.apos.bus && window.apos.bus.$on('export-download', event => {
      if (!event.url) {
        return;
      }
      window.open(event.url, '_blank');
    });
  }
};
