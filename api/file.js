const SUPABASE_URL = 'https://fqaxuhbcwoikeldnxuvv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'path required' });

  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/artwork/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    }
  });

  if (!r.ok) return res.status(r.status).json({ error: 'File not found' });

  const contentType = r.headers.get('content-type') || 'application/octet-stream';
  const buffer = await r.arrayBuffer();
  const b64 = Buffer.from(buffer).toString('base64');

  return res.status(200).json({ b64, mediaType: contentType });
}
