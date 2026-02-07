window.onerror = (msg, src, line) => {
  document.getElementById('statusBar').innerHTML = '<span style="color:red">ERR: ' + msg + ' at ' + src + ':' + line + '</span>';
};
window.addEventListener('unhandledrejection', e => {
  document.getElementById('statusBar').innerHTML = '<span style="color:red">PROMISE: ' + e.reason + '</span>';
});
