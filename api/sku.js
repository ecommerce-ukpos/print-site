const SUPABASE_URL = 'https://fqaxuhbcwoikeldnxuvv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { file, search, limit = 200, offset = 0 } = req.query;

  let url = `${SUPABASE_URL}/rest/v1/sku_specs?select=sku_family,sku_file,product_name,template_code,finished_w_mm,finished_h_mm,bleed_w_mm,bleed_h_mm,safe_w_mm,safe_h_mm,required_dpi,colour_profile,single_or_double_sided,template_pdf_path,template_pdf_path_side2`;

  if (file) {
    url += `&sku_file=eq.${encodeURIComponent(file)}`;
  } else if (search) {
    url += `&or=(sku_family.ilike.*${encodeURIComponent(search)}*,product_name.ilike.*${encodeURIComponent(search)}*,template_code.ilike.*${encodeURIComponent(search)}*)`;
  }

  url += `&limit=${limit}&offset=${offset}&order=sku_family.asc,sku_file.asc`;

  const r = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data });
  return res.status(200).json(data);
}
