import { ORIGIN } from './config.js';

// Money stays in integer cents from ingestion to chart rendering.
export function cents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const match = String(value).match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const amount = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(amount) ? amount : null;
}

export function classify(product) {
  const title = String(product.title || '');
  const type = String(product.product_type || '');
  if (/laptops?|notebooks?|desktop computers|all.in.one|servers|motherboards|power suppl/i.test(type)) return null;
  if (/\b(enclosure|no drive|adapter|riser|bracket|water ?block|cooling fan|heatsink only|memory card|flash drive)\b/i.test(title)) return null;
  if (/\b(laptop|notebook|gaming desktop|mini pc|workstation)\b/i.test(title) && !/memory|\bSSD\b|solid.state|graphics card/i.test(title)) return null;
  if (/GPU|graphics cards/i.test(type) || /\b(graphics card|video card|geforce|radeon)\b/i.test(title)) return 'GPU';
  if (/\bSSD\b|solid[ -]state drive/i.test(title)) return 'SSD';
  if (/RAM\/Memory/i.test(type) || /\b(SO-?DIMM|DIMM|SDRAM|DDR[345])\b/i.test(title) && /memory|\bRAM\b/i.test(title)) return 'RAM';
  return null;
}

export function normalize(products) {
  if (!Array.isArray(products)) throw new Error('Unexpected feed: products must be an array');
  const result = [];
  for (const product of products) {
    if (!product || typeof product !== 'object') continue;
    const category = classify(product);
    if (!category || !product.id || !product.handle || !Array.isArray(product.variants)) continue;
    for (const variant of product.variants) {
      const price = cents(variant.price);
      if (!variant.id || price === null || typeof variant.available !== 'boolean') continue;
      const image = product.images?.[0]?.src;
      result.push({
        id: `${product.id}:${variant.id}`, productId: String(product.id), variantId: String(variant.id),
        title: String(product.title), brand: String(product.vendor || product.title.split(' ')[0]),
        category, condition: String(variant.title || 'Unspecified'), price,
        compareAt: cents(variant.compare_at_price), available: variant.available,
        url: `${ORIGIN}/products/${encodeURIComponent(product.handle)}?variant=${variant.id}`,
        image: typeof image === 'string' && image.startsWith('https://') ? image : null,
      });
    }
  }
  return result;
}
