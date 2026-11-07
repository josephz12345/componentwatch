// Synthetic, deterministic fixtures. Never presented as live VIPOutlet prices.
const specs = [
  ['GPU', 'NVIDIA', 'GeForce RTX 4070 SUPER', '12 GB GDDR6X · ASUS Dual OC', 45900, 59900, 'Like New'],
  ['SSD', 'SAMSUNG', '990 PRO NVMe SSD', '2 TB · PCIe 4.0 · 7,450 MB/s', 11900, 18999, 'New Damaged Box'],
  ['RAM', 'CORSAIR', 'Vengeance DDR5', '32 GB (2 × 16 GB) · 6000 MT/s', 7400, 10999, 'Like New'],
  ['GPU', 'AMD', 'Radeon RX 7800 XT', '16 GB GDDR6 · Sapphire Pulse', 36900, 49999, 'Refurbished'],
  ['SSD', 'WESTERN DIGITAL', 'WD_BLACK SN850X', '1 TB · PCIe 4.0 · 7,300 MB/s', 6900, 9999, 'New'],
  ['RAM', 'G.SKILL', 'Trident Z5 RGB', '32 GB (2 × 16 GB) · DDR5-6400', 8900, 12999, 'New Damaged Box'],
  ['GPU', 'MSI', 'GeForce RTX 4060 Ventus', '8 GB GDDR6 · Dual fan OC', 22900, 29999, 'Like New'],
  ['SSD', 'CRUCIAL', 'T500 Performance SSD', '2 TB · PCIe 4.0 · 7,400 MB/s', 10900, 16999, 'Like New'],
  ['RAM', 'KINGSTON', 'FURY Beast DDR4', '64 GB (2 × 32 GB) · 3200 MT/s', 9500, 14999, 'New'],
  ['GPU', 'INTEL', 'Arc A770 Limited Edition', '16 GB GDDR6 · PCIe 4.0', 21900, 34999, 'Refurbished'],
  ['SSD', 'SAMSUNG', '870 EVO SATA SSD', '1 TB · 2.5 inch · 560 MB/s', 5900, 8999, 'Like New'],
  ['RAM', 'CRUCIAL', 'Pro DDR5 Memory', '48 GB (2 × 24 GB) · 5600 MT/s', 9900, 13999, 'New Damaged Box'],
];
export function demoSeed(now = Date.now()) {
  const products = specs.map((s, i) => ({
    id: `demo-${i+1}`, productId: `demo-${i+1}`, variantId: `fixture-${i+1}`, category: s[0], brand: s[1], title: s[2], subtitle: s[3],
    price: s[4], compareAt: s[5], condition: s[6], available: i !== 9, url: null, image: null,
    watched: [0, 1, 2, 4].includes(i), target: null, low: s[4], previous: s[4] + (i % 3 === 0 ? 2000 : 1000),
    firstSeen: new Date(now-7*86400000).toISOString(), lastSeen: new Date(now).toISOString(),
  }));
  const histories = Object.fromEntries(products.map((p, i) => [p.id, Array.from({length: 15}, (_, j) => ({
    at: new Date(now-(14-j)*12*3600000).toISOString(), available: +p.available,
    price: p.price + (j === 14 ? 0 : Math.max(0, Math.round((14-j)*170 + Math.sin(j*1.8+i)*650)/100)*100),
  }))]));
  const events = [
    {id: 3, productId: 'demo-1', kind:'price_drop', message:'GeForce RTX 4070 SUPER dropped to $459.00', at:new Date(now-80000).toISOString()},
    {id: 2, productId: 'demo-5', kind:'restock', message:'WD_BLACK SN850X is back in stock', at:new Date(now-230000).toISOString()},
    {id: 1, productId: 'demo-3', kind:'price_drop', message:'Vengeance DDR5 dropped to $74.00', at:new Date(now-510000).toISOString()},
  ];
  return { products, histories, events };
}
export function demoChange(products, step) {
  const index = Math.floor(step / 3) % products.length;
  const product = products[index];
  if (step % 3 !== 0) return null;
  const next = { ...product, previous: product.price, price: Math.max(1500, product.price + (Math.floor(step/3)%2 ? -100 : 100)), lastSeen: new Date().toISOString() };
  next.low = Math.min(next.low, next.price);
  return next;
}
