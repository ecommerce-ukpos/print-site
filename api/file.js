// api/file.js
//
// Hands the browser a short-lived Supabase signed URL for a file in the private
// `artwork` bucket, instead of streaming the file's bytes back through this
// function.
//
// Why: the previous version did `Buffer.from(await r.arrayBuffer()).toString('base64')`
// and returned it inside a JSON body. A Vercel function response is capped at
// 4.5MB, and base64 inflates by ~33%, so any source file over roughly 3.3MB could
// not come back at all. 113 files across 75 orders are over that line, several of
// them 30MB+. It also meant every byte of every artwork file made a pointless
// round trip through Vercel.
//
// With a signed URL the bytes go browser <-> Supabase directly. No size ceiling,
// no function bandwidth, and the bucket stays private.
//
// `?mode=b64` keeps the old inline behaviour for any caller that still needs the
// bytes in the response (the artwork assessor). That path is still subject to the
// 4.5MB cap and refuses oversized files up front with a clear error rather than
// letting the platform return an opaque 500.

const SUPABASE_URL = 'https://fqaxuhbcwoikeldnxuvv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const BUCKET = 'artwork';
const DEFAULT_EXPIRY_SECONDS = 3600;

// Vercel caps a function response at 4.5MB. base64 is 4 bytes per 3 bytes of
// input, so the largest source file that can survive the b64 path is ~3.3MB.
// Held a little under that to leave room for the JSON wrapper.
const B64_MAX_SOURCE_BYTES = 3_200_000;

const EXT_MIME = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
  eps: 'application/postscript',
  ai: 'application/postscript',
};

// The incoming `path` arrives already decoded by Vercel's query parser. Encode it
// again per segment before building a Supabase URL, so filenames containing
// spaces, '#', '+' or '&' do not silently produce a 404 or a wrong object.
function encodeStoragePath(p) {
  return String(p)
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

function mimeFromPath(p) {
  const m = /\.([a-z0-9]+)$/i.exec(String(p));
  if (!m) return 'application/octet-stream';
  return EXT_MIME[m[1].toLowerCase()] || 'application/octet-stream';
}

const authHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

// HEAD the object to learn its real content-type and size without pulling the
// body. Falls back to the extension if storage does not answer.
async function probeObject(encodedPath) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodedPath}`,
      { method: 'HEAD', headers: authHeaders }
    );
    if (!r.ok) return { ok: false, status: r.status };
    const len = r.headers.get('content-length');
    return {
      ok: true,
      mediaType: r.headers.get('content-type') || null,
      size: len ? parseInt(len, 10) : null,
    };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!SUPABASE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_ANON_KEY is not configured' });
  }

  const { path, mode, expires } = req.query;
  if (!path) return res.status(400).json({ error: 'path required' });

  const encodedPath = encodeStoragePath(path);
  if (!encodedPath) return res.status(400).json({ error: 'path required' });

  // ── Legacy inline base64 path ──────────────────────────────────────────────
  if (mode === 'b64') {
    const probe = await probeObject(encodedPath);
    if (probe.ok && probe.size && probe.size > B64_MAX_SOURCE_BYTES) {
      return res.status(413).json({
        error: 'File too large to inline',
        detail:
          `${probe.size} bytes exceeds the ${B64_MAX_SOURCE_BYTES} byte limit for ` +
          'base64 responses. Call this endpoint without mode=b64 to get a signed URL instead.',
        size: probe.size,
      });
    }

    const r = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodedPath}`,
      { headers: authHeaders }
    );
    if (!r.ok) return res.status(r.status).json({ error: 'File not found' });

    const contentType = r.headers.get('content-type') || mimeFromPath(path);
    const buffer = await r.arrayBuffer();
    if (buffer.byteLength > B64_MAX_SOURCE_BYTES) {
      return res.status(413).json({
        error: 'File too large to inline',
        size: buffer.byteLength,
      });
    }
    const b64 = Buffer.from(buffer).toString('base64');
    return res.status(200).json({ b64, mediaType: contentType });
  }

  // ── Signed URL path (default) ──────────────────────────────────────────────
  const expiresIn = Math.min(
    Math.max(parseInt(expires, 10) || DEFAULT_EXPIRY_SECONDS, 60),
    24 * 3600
  );

  const signRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${encodedPath}`,
    {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn }),
    }
  );

  if (!signRes.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await signRes.json());
    } catch (e) {
      /* body was not JSON */
    }
    // 400 from the sign endpoint means the object does not exist; keep 404 so
    // callers can tell "not uploaded yet" from "permission problem".
    const status = signRes.status === 400 ? 404 : signRes.status;
    return res.status(status).json({ error: 'File not found', detail });
  }

  const signed = await signRes.json();
  // Supabase has used both spellings across versions.
  const rel = signed.signedURL || signed.signedUrl;
  if (!rel) {
    return res.status(502).json({ error: 'Storage did not return a signed URL' });
  }

  const probe = await probeObject(encodedPath);

  return res.status(200).json({
    url: `${SUPABASE_URL}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`,
    mediaType: (probe.ok && probe.mediaType) || mimeFromPath(path),
    size: probe.ok ? probe.size : null,
    expiresIn,
  });
}
