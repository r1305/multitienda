window.motoIcon = function (color, label) {
  var el = document.createElement('div');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label || 'Repartidor');
  el.title = label || 'Repartidor';
  el.style.cssText = 'width:36px;height:36px;border-radius:50%;border:2px solid #fff;box-sizing:border-box;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;background:' + color;
  el.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/>' +
    '<path d="M5 17h2l4-6h5l3 6"/><path d="M14 7h3l2 4"/><path d="M8 11h4"/></svg>';
  return el;
};
