/* Shared navigation lifecycle for every site page. */
(() => {
  'use strict';
  const nav = document.getElementById('topNav');
  if (!nav) return;
  const trigger = nav.querySelector('.nav-peek');
  const links = nav.querySelector('.top-nav-inner');
  let introTimer;
  let closing = false;

  function open() {
    if (closing) return;
    clearTimeout(introTimer);
    nav.classList.remove('nav-sweep');
    nav.classList.add('nav-open');
    trigger.setAttribute('aria-expanded', 'true');
    links.inert = false;
  }

  function close() {
    clearTimeout(introTimer);
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

  function intro() {
    open();
    introTimer = setTimeout(close, 1000);
  }
  if (document.readyState === 'complete') intro();
  else window.addEventListener('load', intro, {once: true});
  window.addEventListener('pagehide', () => clearTimeout(introTimer));
  window.addEventListener('pageshow', event => {
    if (event.persisted) intro();
  });
})();
