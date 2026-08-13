const SUPABASE_URL = 'https://fqaxuhbcwoikeldnxuvv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const SB_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

// Normalise an artwork_analysis row into the shape the dashboard expects
function normaliseAA(row) {
  return {
    id: row.id,
    _source_table: 'artwork_analysis',
    _aa_id: row.id,
    // Reference columns
    reference: row.sage_order,
    sage_order: row.sage_order,
    magento_order: row.magento_order,
    order_number: row.magento_order,
    company: row.company || null,
    customer_name: row.customer_name || null,
    // File columns
    file_name: row.asset_filename,
    file_type: row.file_ext,
    file_size_kb: row.file_size_kb,
    sku: row.sku || null,
    source: 'pipeline',
    // Dates
    uploaded_at: row.processed_at,
    assessed_at: row.assessed_at || null,
    // Assessment
    score_pct: null,        // not stored on artwork_analysis — requires AI assessment pass
    overall_status: row.assessor_status === 'approved' ? 'pass'
                  : row.assessor_status === 'hold'     ? 'fail'
                  : null,
    results: null,
    assessor_status: row.assessor_status,
    assessor_note: row.assessor_note,
    // Artwork analysis fields
    _class: row.artwork_class,
    artwork_class: row.artwork_class,
    colour_mode: row.colour_mode,
    _upscale: row.upscale_recommended,
    upscale_recommended: row.upscale_recommended,
    _notes: row.notes,
    notes: row.notes,
    dpi_reported: row.dpi_reported,
    width_px: row.width_px,
    height_px: row.height_px,
    // Storage
    storage_path: row.storage_path,
    artwork_url: row.artwork_url,
  };
}

// Normalise a legacy jobs row into the same shape
function normaliseJob(row) {
  return {
    id: row.id,
    _source_table: 'jobs',
    _aa_id: null,
    reference: row.reference,
    sage_order: row.reference,
    magento_order: row.order_number,
    order_number: row.order_number,
    company: null,
    customer_name: row.customer_name,
    file_name: row.file_name,
    file_type: row.file_type,
    file_size_kb: null,
    sku: row.sku || null,
    source: row.source || 'manual',
    uploaded_at: row.uploaded_at,
    assessed_at: row.assessed_at,
    score_pct: row.score_pct,
    overall_status: row.overall_status,
    results: row.results,
    assessor_status: null,
    assessor_note: null,
    _class: null,
    artwork_class: null,
    colour_mode: null,
    _upscale: null,
    upscale_recommended: null,
    _notes: null,
    notes: null,
    dpi_reported: null,
    width_px: null,
    height_px: null,
    storage_path: row.storage_path,
    artwork_url: null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    // Fetch from both tables in parallel
    // artwork_analysis: only rows with a magento_order (linked orders only)
    // Join to order_manifest to get customer_name and company
    const [aaRes, jobsRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/artwork_analysis` +
        `?select=*,order_manifest(customer_name,company)` +
        `&magento_order=not.is.null` +
        `&order=processed_at.desc&limit=1000`,
        { headers: SB_HEADERS }
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/jobs?order=uploaded_at.desc&limit=200`,
        { headers: SB_HEADERS }
      ),
    ]);

    const [aaData, jobsData] = await Promise.all([
      aaRes.json(),
      jobsRes.json(),
    ]);

    const aaRows = Array.isArray(aaData)
      ? aaData.map(row => {
          // Flatten the joined order_manifest fields
          const manifest = row.order_manifest || {};
          return normaliseAA({ ...row, customer_name: manifest.customer_name || null, company: manifest.company || null });
        })
      : [];

    const jobRows = Array.isArray(jobsData)
      ? jobsData.map(normaliseJob)
      : [];

    // Merge: artwork_analysis first (bulk pipeline), then manual jobs
    // Deduplicate by id just in case
    const seen = new Set();
    const merged = [...aaRows, ...jobRows].filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    return res.status(200).json(merged);
  }

  if (req.method === 'POST') {
    // Manual uploads still write to jobs table
    const r = await fetch(`${SUPABASE_URL}/rest/v1/jobs`, {
      method: 'POST',
      headers: { ...SB_HEADERS, Prefer: 'return=representation' },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
