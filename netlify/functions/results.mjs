export default async () => {
  const raw = process.env.PRODUCT_RESULTS_JSON || "";
  if (!raw) return new Response(JSON.stringify({items:[],updatedAt:null}), {headers:{"content-type":"application/json; charset=utf-8"}});
  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : [];
    return new Response(JSON.stringify({items:items.slice(0,5),updatedAt:parsed.updatedAt || new Date().toISOString()}), {headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  } catch {
    return new Response(JSON.stringify({items:[],updatedAt:null,error:"invalid data"}), {status:500,headers:{"content-type":"application/json; charset=utf-8"}});
  }
};