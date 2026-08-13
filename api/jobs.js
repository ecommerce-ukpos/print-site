const SUPABASE_URL = 'https://fqaxuhbcwoikeldnxuvv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {

    // 1. Fetch artwork_analysis rows
    const aaRes = await fetch(
      `${SUPABASE_URL}/rest/v1/artwork_analysis` +
      `?magento_order=not.is.null` +
      `&select=id,sage_order,magento_order,asset_filename,file_ext,` +
      `artwork_class,colour_mode,dpi_reported,upscale_recommended,` +
      `score_pct,overall_status,check_results,assessor_status,assessed_at,` +
      `artwork_url,notes,processed_at` +
      `&order=processed_at.desc&limit=500`,
      { headers: HEADERS }
    );
    const rows = await aaRes.json();
    if (!Array.isArray(rows)) return res.status(aaRes.status).json(rows);

    // 2. Get unique sage_orders and fetch matching order_manifest rows
    const sageOrders = [...new Set(rows.map(r => r.sage_order).filter(Boolean))];
    let manifestMap = {};
    if (sageOrders.length) {
      const omRes = await fetch(
        `${SUPABASE_URL}/rest/v1/order_manifest` +
        `?sage_order=in.(${sageOrders.join(',')})` +
        `&select=sage_order,company,customer_name,products_ordered`,
        { headers: HEADERS }
      );
      const manifests = await omRes.json();
      if (Array.isArray(manifests)) {
        manifests.forEach(m => { manifestMap[m.sage_order] = m; });
      }
    }

    // 3. Merge and normalise
    const jobs = rows.map(row => {
      const om = manifestMap[row.sage_order] || {};
      return {
        id:                  row.id,
        reference:           row.sage_order,
        magento_order:       row.magento_order,
        file_name:           row.asset_filename,
        file_type:           row.file_ext,
        source:              'pipeline',
        company:             om.company || '',
        customer_name:       om.customer_name || '',
        products_ordered:    om.products_ordered || '',
        artwork_class:       row.artwork_class,
        colour_mode:         row.colour_mode,
        dpi_reported:        row.dpi_reported,
        upscale_recommended: row.upscale_recommended,
        score_pct:           row.score_pct,
        overall_status:      row.overall_status,
        check_results:       row.check_results,
        assessor_status:     row.assessor_status,
        assessed_at:         row.assessed_at,
        artwork_url:         row.artwork_url,
        notes:               row.notes,
        uploaded_at:         row.processed_at,
        aa_id:               row.id
      };
    });

    return res.status(200).json(jobs);
  }

  // ── PATCH — update assessor_status ───────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id, assessor_status } = req.body;
    if (!id || !assessor_status) {
      return res.status(400).json({ error: 'id and assessor_status required' });
    }
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/artwork_analysis?id=eq.${id}`,
      {
        method: 'PATCH',
        headers: { ...HEADERS, Prefer: 'return=minimal' },
        body: JSON.stringify({ assessor_status, assessed_at: new Date().toISOString() })
      }
    );
    return res.status(r.status).end();
  }

  // ── POST — manual upload (legacy) ────────────────────────────────────────
  if (req.method === 'POST') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/jobs`, {
      method: 'POST',
      headers: { ...HEADERS, Prefer: 'return=representation' },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
