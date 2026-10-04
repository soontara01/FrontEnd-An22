import { printElement } from './print-element';

describe('printElement', () => {
  afterEach(() => document.body.replaceChildren());

  it('hides everything but the element while printing, sizes the page, then restores', () => {
    document.body.innerHTML = `
      <div id="nav"></div>
      <main><p id="other"></p><section><div id="target"></div><span id="sib"></span></section></main>
      <div id="overlay"></div>`;
    const target = document.getElementById('target')!;
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
      width: (80 * 96) / 25.4,
      height: (100 * 96) / 25.4,
    } as DOMRect);
    let during: { hidden: string[]; chain: string[]; mode: boolean; page: string } | undefined;
    vi.spyOn(window, 'print').mockImplementation(() => {
      during = {
        hidden: [...document.querySelectorAll('.print-hide')].map((e) => e.id),
        chain: [...document.querySelectorAll('.print-chain')].map((e) => e.tagName),
        mode: document.documentElement.classList.contains('print-receipt'),
        page: document.head.querySelector('style')?.textContent ?? '',
      };
      window.dispatchEvent(new Event('afterprint'));
    });

    printElement(target);

    expect(during?.hidden.sort()).toEqual(['nav', 'other', 'overlay', 'sib']);
    expect(during?.mode).toBe(true);
    expect(during?.chain).toEqual(['SECTION', 'MAIN']);
    expect(during?.page).toBe('@page { size: 80mm 105mm; margin: 0; }');
    expect(document.querySelectorAll('.print-hide, .print-chain')).toHaveLength(0);
    expect(document.documentElement.classList.contains('print-receipt')).toBe(false);
    expect(document.head.querySelector('style')).toBeNull();
  });
});
