export default () => {
  let ready = false;

  window.apos.util.onReady(() => {
    if (!ready) {
      ready = true;
      window.apos.bus.$on('export-download', openUrl);
    }
  });

  function openUrl(event) {
    if (event.url) {
      window.open(event.url, '_blank');
    }
  }
};
