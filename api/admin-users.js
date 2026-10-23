// Admin user management API
// Uses Supabase service role key (SUPABASE_SERVICE_KEY env var) to manage auth users.
// Caller must provide a valid anon-role JWT (Authorization: Bearer <access_token>).
// Only emails in SUPERADMIN_EMAILS are permitted.

const SUPABASE_URL = 'https://fqaxuhbcwoikeldnxuvv.supabase.co';
const ANON_KEY     = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

const SUPERADMIN_EMAILS = ['apritchard@ukpos.com', 'ecommerce@ukpos.com'];

async function getCallerEmail(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.email || null;
}

function adminHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verify caller is a superadmin
  const callerEmail = await getCallerEmail(req.headers.authorization);
  if (!callerEmail || !SUPERADMIN_EMAILS.includes(callerEmail)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // GET — list all users
  if (req.method === 'GET') {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
      headers: adminHeaders()
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    // Return only the fields the admin UI needs
    const users = (data.users || []).map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      confirmed_at: u.confirmed_at,
      invited_at: u.invited_at
    }));
    return res.status(200).json({ users });
  }

  // POST — invite a new user
  if (req.method === 'POST') {
    const { email } = req.body || {};
    if (!email || !email.endsWith('@ukpos.com')) {
      return res.status(400).json({ error: 'A @ukpos.com email address is required.' });
    }
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/invite`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        email,
        data: {},
        redirect_to: 'https://print-site-kohl.vercel.app/login.html'
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.message || data.error_description || 'Failed to invite user.' });
    return res.status(200).json({ success: true, email: data.email });
  }

  // DELETE — remove a user
  if (req.method === 'DELETE') {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    // Prevent superadmins from deleting themselves or each other
    const targetRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      headers: adminHeaders()
    });
    const targetData = await targetRes.json();
    if (SUPERADMIN_EMAILS.includes(targetData?.email)) {
      return res.status(403).json({ error: 'Superadmin accounts cannot be deleted via this panel.' });
    }
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: adminHeaders()
    });
    if (!r.ok) {
      const data = await r.json();
      return res.status(r.status).json({ error: data.message || 'Failed to delete user.' });
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
