// Render fixtures/company-logos.md through the app, then run at desktop and
// mobile widths with: agent-browser ... eval "$(cat test/company-logos.browser.js)"
(() => {
  /** @param {unknown} condition @param {string} message @returns {asserts condition} */
  function check(condition, message) { if (!condition) throw new Error(message); }
  /** @param {string} text */
  function cellFor(text) {
    const cell = [...document.querySelectorAll('.tabulator-cell, td')]
      .find(element => element.textContent?.includes(text));
    check(cell, `missing cell: ${text}`);
    return cell;
  }
  const pair = cellFor('ALPHA');
  const images = [...pair.querySelectorAll('img')];
  const textNodes = [...pair.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
  /** @param {Node} node */
  const textRect = node => { const range = document.createRange(); range.selectNodeContents(node); return range.getBoundingClientRect(); };
  check(images.length === 2 && textNodes.length === 2, 'company pairs were not preserved');
  const cellRect = pair.getBoundingClientRect();
  images.forEach((image, i) => {
    const box = image.getBoundingClientRect();
    const text = textRect(textNodes[i]);
    check(getComputedStyle(image).display === 'block', 'logo is not on its own row');
    check(Math.abs((box.left + box.right) / 2 - (cellRect.left + cellRect.right) / 2) < 1, 'logo is not centered');
    check(box.width <= 64 && box.height <= 40 && getComputedStyle(image).objectFit === 'contain', 'logo dimensions or fit changed');
    check(text.top >= box.bottom - 1 && text.bottom <= cellRect.bottom + 1, 'company text is not below logo or is clipped');
    check(Math.abs((text.left + text.right) / 2 - (cellRect.left + cellRect.right) / 2) < 1, 'company text is not centered');
  });
  check(textRect(textNodes[0]).bottom <= images[1].getBoundingClientRect().top + 1, 'company pairs are out of order');
  check(getComputedStyle(pair).display === 'inline-block', 'Tabulator cell display changed');
  const long = cellFor('AVeryLongUnbrokenCompanyName');
  const longText = [...long.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
  check(longText, 'long name is missing');
  const longRange = document.createRange(); longRange.selectNodeContents(longText);
  const longRects = [...longRange.getClientRects()];
  check(longRects.length > 1, 'long name did not wrap');
  check(longRects.every(rect => rect.left >= long.getBoundingClientRect().left && rect.right <= long.getBoundingClientRect().right && rect.bottom <= long.getBoundingClientRect().bottom), 'long name is clipped');
  check(getComputedStyle(cellFor('EXMPL')).textAlign === 'center', 'Google favicon cell is not centered');
  const nativeCell = cellFor('SmallCo');
  check(getComputedStyle(nativeCell).textAlign === 'center', 'native logo table is not centered');
  const nativeText = [...nativeCell.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
  check(nativeText, 'native company name is missing');
  const nativeRange = document.createRange(); nativeRange.selectNodeContents(nativeText);
  const nativeRects = [...nativeRange.getClientRects()];
  check(nativeRects.every(rect => rect.right <= nativeCell.getBoundingClientRect().right && rect.bottom <= nativeCell.getBoundingClientRect().bottom), 'native company name is clipped');
  if (innerWidth < 500) check(nativeRects.length > 1, 'native company name did not wrap');
  check(getComputedStyle(cellFor('Plain company')).textAlign === 'left', 'plain company cell changed');
  const ordinary = cellFor('Ordinary image');
  const ordinaryImage = ordinary.querySelector('img');
  check(ordinaryImage && getComputedStyle(ordinary).textAlign === 'left' && ordinaryImage.getBoundingClientRect().width === 20, 'ordinary image cell changed');
  check(document.documentElement.scrollWidth <= innerWidth, 'table overflows the page');
  return { passed: true, viewport: innerWidth, cellWidth: cellRect.width, logoWidth: images[0].getBoundingClientRect().width, longTextLines: longRects.length };
})()
