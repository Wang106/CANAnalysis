/* Shared navigation lifecycle. Ordinary pages stay fixed; CAN may collapse after chart creation. */
(() => {
  'use strict';
  const nav = document.getElementById('topNav');
  if (!nav) return;
  const trigger = nav.querySelector('.nav-peek');
  const links = nav.querySelector('.top-nav-inner');
  let closing = false;
  const collapseOnCharts = nav.dataset.collapse === 'charts';
  let collapseEnabled = false;

  function open() {
    if (closing) return;
    nav.classList.remove('nav-sweep');
    nav.classList.add('nav-open');
    trigger.setAttribute('aria-expanded', 'true');
    links.inert = false;
  }

  function close() {
    if (!collapseEnabled) return;
    if (!nav.classList.contains('nav-open')) return;
    closing = true;
    if (links.contains(document.activeElement)) trigger.focus({preventScroll: true});
    nav.classList.remove('nav-open', 'nav-sweep');
    trigger.setAttribute('aria-expanded', 'false');
    links.inert = true;
    // Restart the existing inward light sweep alongside the closing transition.
    void nav.offsetWidth;
    nav.classList.add('nav-sweep');
    closing = false;
  }

  function collapse() {
    if (!collapseOnCharts) return;
    collapseEnabled = true;
    nav.classList.remove('nav-fixed');
    close();
  }

  nav.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') open();
  });
  nav.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') close();
  });
  nav.addEventListener('click', open);
  nav.addEventListener('focusin', open);
  nav.addEventListener('focusout', event => {
    if (!nav.contains(event.relatedTarget)) close();
  });
  nav.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
  function dismissOutside(event) {
    if (!nav.contains(event.target)) close();
  }
  document.addEventListener('pointerdown', dismissOutside);
  document.addEventListener('click', dismissOutside);

  function initialize() {
    collapseEnabled = false;
    nav.classList.add('nav-fixed');
    open();
  }
  window.__siteNav = {open, close, collapse};
  if (document.readyState === 'complete') initialize();
  else window.addEventListener('load', initialize, {once: true});
  window.addEventListener('pageshow', event => {
    if (event.persisted && (!collapseOnCharts || !collapseEnabled)) initialize();
  });
})();
