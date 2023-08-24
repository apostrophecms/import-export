export default () => {
  window.apos.util.onReady(onReady);

  function onReady() {
    window.apos.bus.$on('export-download', openUrl);
  }

  function openUrl(event) {
    if (!event.url) {
      return;
    }

    window.open(event.url, '_blank');
    window.apos.bus.$off('export-download', openUrl);
  }
};
