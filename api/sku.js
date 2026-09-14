// api/sku.js
//
// Two changes from the previous version.
//
// 1. Archived rows are no longer returned by search.
//    `sku_specs` deactivates a template by prefixing `sku_file` with `ARCHIVED_`,
//    but this endpoint had no filter, so archived rows came back and could win
//    the match. Order 0001243855 is the case in point: all three rows carrying
//    sku_family 'ABC5A1' are archived, and the designer's "exact sku_family match
//    first" rule picked one of them over the live template (which is filed under
//    family 'ABC5'). 61 archived rows were reachable this way.
//
//    Exact lookup by `?file=` is deliberately NOT filtered — that is used to
//    re-open a specific stored template, including a historic one, and a saved job
//    must keep resolving to the row it was designed against.
//
//    `?include_archived=1` opts search back in for admin use.
//
// 2. template_w_mm / template_h_mm are now returned.
//    The client derived its canvas size from finished_w_mm only. 146 live rows
//    have no finished_*_mm but do carry template_*_mm, and a null there left the
//    designer with no dimensions at all — dead Full Size button and a placeholder
//    template box. The client now falls back to the template size.

const SUPABASE_URL = 'https://fqaxuhbcwoikeldnxuvv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const SELECT = [
  'variant_sku',
  'sku_family',
  'sku_file',
  'product_name',
  'template_code',
  'template_w_mm',
  'template_h_mm',
  'finished_w_mm',
  'finished_h_mm',
  'bleed_w_mm',
  'bleed_h_mm',
  'safe_w_mm',
  'safe_h_mm',
  'required_dpi',
  'colour_profile',
  'single_or_double_sided',
  'template_pdf_path',
  'template_pdf_path_side2',
  'template_img_path',
  'template_img_path_side2',
  'svg_trim',
  'svg_bleed',
  'svg_safe',
  'svg_viewbox',
].join(',');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPABASE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_ANON_KEY is not configured' });
  }

  const {
    file,
    search,
    limit = 200,
    offset = 0,
    include_archived: includeArchived,
  } = req.query;

  let url = `${SUPABASE_URL}/rest/v1/sku_specs?select=${SELECT}`;

  if (file) {
    // Exact row lookup — archived rows stay reachable on purpose.
    url += `&sku_file=eq.${encodeURIComponent(file)}`;
  } else {
    if (search) {
      const s = encodeURIComponent(search);
      url +=
        `&or=(variant_sku.ilike.*${s}*,sku_family.ilike.*${s}*,` +
        `product_name.ilike.*${s}*,template_code.ilike.*${s}*,sku_file.ilike.*${s}*)`;
    }
    // Note: matching on `ARCHIVED*` rather than `ARCHIVED_*` because PostgREST
    // passes the pattern to SQL LIKE, where `_` is itself a single-character
    // wildcard. The prefix alone is unambiguous here.
    if (includeArchived !== '1' && includeArchived !== 'true') {
      url += `&sku_file=not.ilike.ARCHIVED*`;
    }
  }

  url += `&limit=${limit}&offset=${offset}&order=variant_sku.asc,sku_family.asc,sku_file.asc`;

  const r = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data });
  return res.status(200).json(data);
}
