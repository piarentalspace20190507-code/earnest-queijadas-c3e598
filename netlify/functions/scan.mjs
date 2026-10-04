const QUERIES = [
  "DJI Mini 3 Pro モーター",
  "DJI Mini 3 Pro アーム",
  "DJI Mini 4 Pro ジンバル",
  "DJI Neo 補修 パーツ",
  "DJI Avata 2 補修 パーツ",
  "DJI Air 3 補修 パーツ"
];

const PROFIT_FEE = 0.10;
const SHIPPING = 1600;
const PACKING = 250;

async function reef(path, body, key) {
  const r = await fetch("https://api.reefapi.com" + path, {
    method: "POST",
    headers: {"x-api-key": key, "content-type": "application/json"},
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j?.error?.message || "ReefAPI request failed");
  return j;
}

function yen(v) { return Number.isFinite(Number(v)) ? Number(v) : null; }

function maxCost(sale) {
  const x = yen(sale);
  return x == null ? null : (0.9 * x - (SHIPPING + PACKING)) / 2;
}

function profit(sale, cost) {
  const x = yen(sale), y = yen(cost);
  return x == null || y == null ? null : 0.9*x - SHIPPING - PACKING - 2*y;
}

export default async () => {
  const key = process.env.REEF_KEY;
  if (!key) return new Response(JSON.stringify({ok:false,error:"REEF_KEY is not configured"}), {status:503,headers:{"content-type":"application/json"}});
  try {
    const candidates = [];
    for (const query of QUERIES) {
      const sold = await reef("/mercari/v1/search", {country:"jp",query,status:"sold_out",sort:"newest",page_size:20}, key);
      const live = await reef("/mercari/v1/search", {country:"jp",query,status:"on_sale",sort:"newest",page_size:20}, key);
      const soldRows = sold.data?.results || sold.data?.items || [];
      const liveRows = live.data?.results || live.data?.items || [];
      if (!soldRows.length) continue;

      const prices = soldRows.map(x=>yen(x.price)).filter(x=>x!=null);
      if (!prices.length) continue;
      const median = [...prices].sort((a,b)=>a-b)[Math.floor(prices.length/2)];
      const active = liveRows.length;
      const costCeiling = maxCost(median);

      const ae = await reef("/aliexpress/v1/search", {
        query, country:"JP", currency:"JPY", max_results:8, sort:"orders_desc"
      }, key);
      const aeRows = ae.data?.results || ae.data?.items || [];

      const suppliers = [];
      for (const p of aeRows.slice(0,5)) {
        const detail = await reef("/aliexpress/v1/product_detail", {
          product_id:p.product_id, country:"JP", currency:"JPY", language:"en"
        }, key);
        const product = detail.data?.product || {};
        const ship = product.shipping || {};
        const base = yen(product.price_current ?? product.price_min ?? p.price);
        const freight = ship.free === true ? 0 : yen(ship.shipping_cost);
        if (base == null || freight == null) continue;
        const landed = base + freight;
        if (costCeiling == null || landed > costCeiling) continue;
        const safe = Math.min(100, Math.round(
          (Number(product.seller_positive_rate ?? 0) * 0.55) +
          (Math.min(100, Number(product.review_count ?? 0) / 20) * 0.20) +
          (Math.min(100, Number(product.sold_count ?? 0) / 100) * 0.25)
        ));
        suppliers.push({
          productId:p.product_id,title:product.title || p.title,url:product.url || p.url,
          itemCost:base,shipping:freight,landedCost:landed,safe
        });
      }
      suppliers.sort((a,b)=>b.safe-a.safe || a.landedCost-b.landedCost);
      const best = suppliers[0];
      if (!best) continue;
      const p = profit(median,best.landedCost);
      if (p == null || p < 1000) continue;

      candidates.push({
        name:query, sale:median, cost:best.landedCost, profit:Math.round(p),
        trend:"要時系列集計", active, age:"要詳細取得", safe:best.safe,
        ai2:"再審査待ち", risk:best.safe>=85?"低":"中",
        evidence:{soldCount:prices.length,liveCount:active,source:"Mercari/ AliExpress via ReefAPI",supplier:best}
      });
    }
    candidates.sort((a,b)=>b.profit-a.profit);
    return new Response(JSON.stringify({ok:true,updatedAt:new Date().toISOString(),items:candidates.slice(0,5)}),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  } catch (e) {
    return new Response(JSON.stringify({ok:false,error:e.message}),{status:502,headers:{"content-type":"application/json; charset=utf-8"}});
  }
};