const HIDE_CLASS = 'print-hide';
const MODE_CLASS = 'print-receipt';
const CHAIN_CLASS = 'print-chain';
const PX_PER_MM = 96 / 25.4;

/**
 * Prints one element on its own page sized to it (e.g. an 80 mm receipt; `'A4'` = normal A4
 * pages, for documents that may run over several pages):
 * every sibling along its ancestor chain is hidden, the ancestors lose their padding / margins
 * (`.print-chain`) and an `@page` rule with the element's measured size is added. Everything is undone after
 * printing. The element must have layout on screen (e.g. kept off-screen, not `display: none`).
 */
export function printElement(element: HTMLElement, page: 'fit' | 'A4' = 'fit'): void {
  const doc = element.ownerDocument;
  const win = doc.defaultView;
  if (!win) return;

  const hidden: Element[] = [];
  const chain: Element[] = [];
  for (let node: Element | null = element; node && node !== doc.body; node = node.parentElement) {
    if (node !== element) {
      node.classList.add(CHAIN_CLASS);
      chain.push(node);
    }
    for (const sibling of Array.from(node.parentElement?.children ?? [])) {
      if (sibling !== node && !sibling.classList.contains(HIDE_CLASS)) {
        sibling.classList.add(HIDE_CLASS);
        hidden.push(sibling);
      }
    }
  }
  const rect = element.getBoundingClientRect();
  const width = Math.ceil(rect.width / PX_PER_MM);
  // A little extra so the last line never spills onto a second page.
  const height = Math.ceil(rect.height / PX_PER_MM) + 5;
  const style = doc.createElement('style');
  style.textContent =
    page === 'A4'
      ? '@page { size: A4; margin: 0; }'
      : `@page { size: ${width}mm ${height}mm; margin: 0; }`;
  doc.head.appendChild(style);
  doc.documentElement.classList.add(MODE_CLASS);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    hidden.forEach((el) => el.classList.remove(HIDE_CLASS));
    chain.forEach((el) => el.classList.remove(CHAIN_CLASS));
    style.remove();
    doc.documentElement.classList.remove(MODE_CLASS);
    win.removeEventListener('afterprint', cleanup);
  };
  win.addEventListener('afterprint', cleanup);
  win.print();
  // print() blocks in most browsers; afterprint covers the others.
  if (!('onafterprint' in win)) cleanup();
}
