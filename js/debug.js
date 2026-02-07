window.onerror = (msg, src, line, col, err) => {
  document.getElementById('statusBar').innerHTML = 
    `<span style="color:var(--danger)">${msg}<br>${src}:${line}</span>`;
};
