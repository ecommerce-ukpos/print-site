// Admin user management API — Print Site
// Uses Supabase service role key (SUPABASE_SERVICE_KEY env var).
// Caller must send a valid user JWT (Authorization: Bearer <access_token>).
// Only users with role=super_admin and status=approved in the profiles table are permitted.

const SUPABASE_URL = 'https://fqaxuhbcwoikeldnxuvv.supabase.co';
const ANON_KEY     = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

function svcHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };
}

function anonHeaders(token) {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

// Verify the caller is an approved super_admin — returns { userId, email } or null
async function getCallerProfile(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  // Fetch caller's user record
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!userRes.ok) return null;
  const userData = await userRes.json();
  const userId = userData?.id;
  if (!userId) return null;
  // Fetch their profile via service role (bypasses RLS)
  const profRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,email,role,status`,
    { headers: svcHeaders() }
  );
  if (!profRes.ok) return null;
  const profiles = await profRes.json();
  const profile = profiles?.[0];
  if (!profile || profile.role !== 'super_admin' || profile.status !== 'approved') return null;
  return profile;
}

// Write an audit log entry (best-effort)
async function writeAudit(actor, action, target, details) {
  await fetch(`${SUPABASE_URL}/rest/v1/admin_audit_log`, {
    method: 'POST',
    headers: { ...svcHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      actor_id: actor.id,
      actor_email: actor.email,
      action,
      target_id: target?.id || null,
      target_email: target?.email || null,
      details: details || null
    })
  }).catch(() => {});
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const caller = await getCallerProfile(req.headers.authorization);
  if (!caller) return res.status(403).json({ error: 'Forbidden — super_admin access required.' });

  // ── GET — list all profiles ──────────────────────────────────────────────
  if (req.method === 'GET') {
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=id,email,full_name,role,status,requested_at,approved_at,rejected_at,rejection_reason,last_sign_in_at,created_at&order=created_at.asc`,
      { headers: svcHeaders() }
    );
    const profiles = await profRes.json();
    if (!profRes.ok) return res.status(profRes.status).json(profiles);
    return res.status(200).json({ profiles });
  }

  // ── POST — invite a new user ─────────────────────────────────────────────
  if (req.method === 'POST' && req.body?.action === 'invite') {
    const { email, role } = req.body;
    if (!email || !email.endsWith('@ukpos.com')) {
      return res.status(400).json({ error: 'A @ukpos.com email address is required.' });
    }
    const targetRole = ['user', 'super_admin'].includes(role) ? role : 'user';
    const invRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/invite`, {
      method: 'POST',
      headers: svcHeaders(),
      body: JSON.stringify({ email, data: {}, redirect_to: 'https://print-site-kohl.vercel.app/login.html' })
    });
    const invData = await invRes.json();
    const alreadyExists = invData?.message?.toLowerCase().includes('already') || invData?.error_description?.toLowerCase().includes('already');
    if (!invRes.ok && !alreadyExists) {
      return res.status(invRes.status).json({ error: invData.message || invData.error_description || 'Failed to invite user.' });
    }
    // Invited by a super_admin = auto-approved with the specified role
    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: { ...svcHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ role: targetRole, status: 'approved', approved_at: new Date().toISOString(), approved_by: caller.id })
    });
    // If no existing profile row (brand new user), the trigger will create one on auth insert
    await writeAudit(caller, 'invite', { email }, { role: targetRole });
    return res.status(200).json({ success: true, email });
  }

  // ── PATCH — approve / reject / revoke / promote / demote / set_password ──
  if (req.method === 'PATCH') {
    const { action, userId, reason, role, password } = req.body || {};
    if (!action || !userId) return res.status(400).json({ error: 'action and userId are required.' });

    // Fetch target profile
    const targetRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,email,role,status`, { headers: svcHeaders() });
    const targets = await targetRes.json();
    const target = targets?.[0];
    if (!target) return res.status(404).json({ error: 'User not found.' });

    if (action === 'approve') {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH', headers: { ...svcHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'approved', approved_at: new Date().toISOString(), approved_by: caller.id, rejected_at: null, rejection_reason: null })
      });
      await writeAudit(caller, 'approve', target);
      return res.status(200).json({ success: true });
    }

    if (action === 'reject' || action === 'revoke') {
      if (target.id === caller.id) return res.status(403).json({ error: 'Cannot revoke your own access.' });
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH', headers: { ...svcHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'rejected', rejected_at: new Date().toISOString(), rejection_reason: reason || null })
      });
      await writeAudit(caller, action, target, { reason });
      return res.status(200).json({ success: true });
    }

    if (action === 'set_role') {
      if (!['user', 'super_admin'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
      if (target.id === caller.id && role !== 'super_admin') return res.status(403).json({ error: 'Cannot demote yourself.' });
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH', headers: { ...svcHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({ role })
      });
      await writeAudit(caller, role === 'super_admin' ? 'promote' : 'demote', target, { new_role: role });
      return res.status(200).json({ success: true });
    }

    if (action === 'set_password') {
      if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'PUT', headers: svcHeaders(),
        body: JSON.stringify({ password })
      });
      if (!r.ok) { const d = await r.json(); return res.status(r.status).json({ error: d.message || 'Failed to set password.' }); }
      await writeAudit(caller, 'set_password', target);
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  }

  // ── DELETE — remove user entirely ────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    // Fetch target
    const targetRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,email,role,status`, { headers: svcHeaders() });
    const targets = await targetRes.json();
    const target = targets?.[0];
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.role === 'super_admin') return res.status(403).json({ error: 'Super admin accounts cannot be deleted via this panel.' });
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: svcHeaders() });
    if (!r.ok) { const d = await r.json(); return res.status(r.status).json({ error: d.message || 'Failed to delete user.' }); }
    await writeAudit(caller, 'delete', target);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
