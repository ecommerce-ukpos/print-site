const SUPABASE_URL = 'https://fqaxuhbcwoikeldnxuvv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

export const config = { api: { bodyParser: { sizeLimit: '50mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { path, mediaType, data } = req.body;
  if (!path || !mediaType || !data) return res.status(400).json({ error: 'path, mediaType and data required' });

  // data is base64 — decode to binary buffer
  const binary = Buffer.from(data, 'base64');

  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/artwork/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': mediaType,
      'x-upsert': 'true',
    },
    body: binary,
  });

  const result = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: result });
  return res.status(200).json({ path: result.Key || path });
}
