/**
 * shell.js — UKPOS Print Site shared navigation shell
 * Injects the persistent topbar (right-side account menu) and the left
 * nav sidebar (4 workflow steps) into every inner page.
 *
 * Each page must:
 *  1. Load Supabase SDK before this file.
 *  2. Have const sb = supabase.createClient(...) defined before this file.
 *  3. Have class="main" on the main content wrapper.
 *  4. Have id="sidebar" on its own icon-sidebar (if present) — shell.js
 *     will leave it in place and add the nav sidebar alongside it.
 *     On the designer page set data-has-own-sidebar="true" on <body>.
 *
 * Shell injects:
 *  - #shell-topbar   fixed top bar with logo, page title slot, and account menu
 *  - #shell-nav      fixed left nav sidebar (collapses on designer pages)
 *
 * Pages that already have a fixed .sidebar will gain a second sidebar
 * to the left of it (the nav), and the existing icon-bar shifts right.
 */

(function () {
  'use strict';

  /* ── Constants ── */
  const SUPA_URL = 'https://fqaxuhbcwoikeldnxuvv.supabase.co';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxYXh1aGJjd29pa2VsZG54dXZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNjk2NTQsImV4cCI6MjA5Njc0NTY1NH0.0XtMq5p6L9pnRilG5GUI5j72zPNuhl4PnD9ihDxeT1c';

  const NAV_ITEMS = [
    { href: '/dashboard',        icon: '📥', label: 'Artwork Submissions', step: '1' },
    { href: '/artwork-assessor', icon: '🔍', label: 'Artwork Assessor',    step: '2' },
    { href: '/designer',         icon: '🎛️', label: 'Designer',            step: '3' },
    { href: '/print-jobs',       icon: '🖨️', label: 'Print Jobs',          step: '4' },
  ];

  /* ── Detect current page ── */
  const path = window.location.pathname.replace(/\/$/, '') || '/';

  /* ── Designer pages have their own left sidebar — collapse nav to icons ── */
  const hasOwnSidebar = document.body.dataset.hasOwnSidebar === 'true'
    || document.getElementById('sidebar') !== null;

  /* ── Inject CSS ── */
  const style = document.createElement('style');
  style.textContent = `
    /* ── Shell topbar ── */
    #shell-topbar {
      position: fixed; top: 0; left: 0; right: 0; height: 48px; z-index: 200;
      background: #fff; border-bottom: 0.5px solid #D3D1C7;
      display: flex; align-items: center; padding: 0 16px; gap: 12px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #shell-topbar .tb-logo {
      display: flex; align-items: center; gap: 8px; text-decoration: none; flex-shrink: 0;
    }
    #shell-topbar .tb-logo-icon {
      width: 26px; height: 26px; background: #F47920; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; flex-shrink: 0;
    }
    #shell-topbar .tb-logo-text {
      font-size: 13px; font-weight: 700; color: #2C2C2A; letter-spacing: -0.01em;
    }
    #shell-topbar .tb-divider { color: #D3D1C7; font-size: 13px; }
    #shell-topbar .tb-site { font-size: 12px; color: #888780; }
    #shell-topbar .tb-spacer { flex: 1; }

    /* account menu trigger */
    #shell-topbar .tb-account {
      display: flex; align-items: center; gap: 8px; cursor: pointer;
      padding: 5px 10px; border-radius: 7px; border: 0.5px solid #E8E6DE;
      background: #fff; transition: background 0.12s; position: relative;
      font-family: inherit;
    }
    #shell-topbar .tb-account:hover { background: #F5F4F0; }
    #shell-topbar .tb-account-avatar {
      width: 24px; height: 24px; border-radius: 50%; background: #F47920;
      color: #fff; font-size: 11px; font-weight: 700;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    #shell-topbar .tb-account-name {
      font-size: 12px; font-weight: 500; color: #2C2C2A; max-width: 160px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #shell-topbar .tb-account-role {
      font-size: 10px; color: #888780;
    }
    #shell-topbar .tb-account-info { display: flex; flex-direction: column; }
    #shell-topbar .tb-caret { color: #B4B2A9; font-size: 10px; margin-left: 2px; }

    /* dropdown */
    #shell-account-menu {
      display: none; position: absolute; top: calc(100% + 6px); right: 0;
      background: #fff; border: 0.5px solid #D3D1C7; border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1); min-width: 220px; z-index: 300;
      overflow: hidden; font-family: 'Inter', -apple-system, sans-serif;
    }
    #shell-account-menu.open { display: block; }
    #shell-account-menu .am-header {
      padding: 12px 14px 10px; border-bottom: 0.5px solid #E8E6DE;
    }
    #shell-account-menu .am-email {
      font-size: 12px; color: #2C2C2A; font-weight: 500; word-break: break-all;
    }
    #shell-account-menu .am-role {
      font-size: 10px; color: #888780; margin-top: 2px;
    }
    #shell-account-menu .am-item {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 14px; font-size: 12px; color: #2C2C2A; text-decoration: none;
      cursor: pointer; border: none; background: none; width: 100%; text-align: left;
      font-family: inherit; transition: background 0.1s;
    }
    #shell-account-menu .am-item:hover { background: #F5F4F0; }
    #shell-account-menu .am-item.danger { color: #DC2626; }
    #shell-account-menu .am-item.danger:hover { background: #FEF2F2; }
    #shell-account-menu .am-item .am-icon { font-size: 14px; width: 18px; text-align: center; }
    #shell-account-menu .am-divider { height: 0.5px; background: #E8E6DE; margin: 4px 0; }

    /* ── Shell nav sidebar ── */
    #shell-nav {
      position: fixed; left: 0; top: 48px; bottom: 0; z-index: 190;
      width: 52px; background: #fff; border-right: 0.5px solid #D3D1C7;
      display: flex; flex-direction: column; overflow: hidden;
      transition: width 0.2s ease;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #shell-nav:hover { width: 200px; }
    /* When the page has its OWN sidebar, keep nav always collapsed */
    body[data-has-own-sidebar="true"] #shell-nav { width: 52px !important; }

    #shell-nav .sn-item {
      height: 40px; display: flex; align-items: center; gap: 10px;
      padding: 0 14px; text-decoration: none; cursor: pointer;
      white-space: nowrap; overflow: hidden; border: none; background: none;
      width: 100%; text-align: left; font-family: inherit;
      border-left: 3px solid transparent; flex-shrink: 0;
    }
    #shell-nav .sn-item:hover { background: #F5F4F0; }
    #shell-nav .sn-item.active { background: #FFF0E6; border-left-color: #F47920; }
    #shell-nav .sn-icon {
      font-size: 15px; width: 22px; text-align: center; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }
    #shell-nav .sn-step {
      width: 18px; height: 18px; border-radius: 50%; background: #E8E6DE;
      color: #888780; font-size: 9px; font-weight: 700;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    #shell-nav .sn-item.active .sn-step { background: #F47920; color: #fff; }
    #shell-nav .sn-label {
      font-size: 12px; font-weight: 500; color: #2C2C2A;
      opacity: 0; white-space: nowrap; pointer-events: none; transition: opacity 0.12s ease 0.05s;
    }
    #shell-nav .sn-item.active .sn-label { color: #C75E0A; }
    #shell-nav:hover .sn-label { opacity: 1; }
    body[data-has-own-sidebar="true"] #shell-nav .sn-label { opacity: 0 !important; }
    #shell-nav .sn-divider { height: 0.5px; background: #E8E6DE; margin: 6px 10px; flex-shrink: 0; }
    #shell-nav .sn-spacer { flex: 1; }

    /* ── Offset existing content for the shell ── */
    /* Pages that already use margin-left:52px for their own sidebar
       get an extra 52px shift to account for the shell nav */
    body.shell-injected .main { margin-top: 48px; }
    /* If page has its own sidebar (designer etc), shift it right by 52px */
    body[data-has-own-sidebar="true"] .sidebar { left: 52px !important; }
    body[data-has-own-sidebar="true"] .main { margin-left: 104px !important; }
    /* Pages WITHOUT their own sidebar: just offset for shell-nav */
    body:not([data-has-own-sidebar="true"]).shell-injected .main { margin-left: 52px; margin-top: 48px; }
  `;
  document.head.appendChild(style);

  /* ── Build topbar HTML ── */
  const topbar = document.createElement('div');
  topbar.id = 'shell-topbar';
  topbar.innerHTML = `
    <a class="tb-logo" href="/">
      <div class="tb-logo-icon">🖨️</div>
      <span class="tb-logo-text">UKPOS</span>
    </a>
    <span class="tb-divider">/</span>
    <span class="tb-site">Print Site</span>
    <div class="tb-spacer"></div>
    <div class="tb-account" id="shell-account-btn" onclick="window.__shellToggleMenu()">
      <div class="tb-account-avatar" id="shell-avatar">?</div>
      <div class="tb-account-info">
        <div class="tb-account-name" id="shell-username">Loading…</div>
        <div class="tb-account-role" id="shell-role"></div>
      </div>
      <span class="tb-caret">▼</span>
      <div id="shell-account-menu">
        <div class="am-header">
          <div class="am-email" id="shell-menu-email">—</div>
          <div class="am-role" id="shell-menu-role">—</div>
        </div>
        <a class="am-item" href="/account/">
          <span class="am-icon">👤</span> My Account
        </a>
        <a class="am-item" href="/admin/" id="shell-admin-link" style="display:none">
          <span class="am-icon">🛡️</span> Admin Panel
        </a>
        <div class="am-divider"></div>
        <button class="am-item danger" onclick="window.__shellSignOut()">
          <span class="am-icon">↩</span> Sign out
        </button>
      </div>
    </div>
  `;
  document.body.prepend(topbar);

  /* ── Build nav sidebar HTML ── */
  const nav = document.createElement('nav');
  nav.id = 'shell-nav';

  let navHtml = '';
  NAV_ITEMS.forEach(item => {
    const isActive = path === item.href || path.startsWith(item.href + '/');
    navHtml += `
      <a class="sn-item${isActive ? ' active' : ''}" href="${item.href}">
        <span class="sn-step">${item.step}</span>
        <span class="sn-label">${item.label}</span>
      </a>`;
  });

  nav.innerHTML = `
    ${navHtml}
    <div class="sn-spacer"></div>
    <div class="sn-divider"></div>
  `;
  document.body.insertBefore(nav, topbar.nextSibling);

  /* ── Mark body ── */
  document.body.classList.add('shell-injected');

  /* ── Close menu on outside click ── */
  document.addEventListener('click', function (e) {
    const btn = document.getElementById('shell-account-btn');
    const menu = document.getElementById('shell-account-menu');
    if (menu && !btn.contains(e.target)) menu.classList.remove('open');
  });

  /* ── Globals ── */
  window.__shellToggleMenu = function () {
    document.getElementById('shell-account-menu').classList.toggle('open');
  };

  window.__shellSignOut = async function () {
    if (typeof sb !== 'undefined') await sb.auth.signOut();
    window.location.href = '/login.html';
  };

  /* ── Auth + populate UI ── */
  window.__shellInit = async function () {
    if (typeof sb === 'undefined') return;
    await sb.auth.refreshSession();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = '/login.html'; return; }

    const email = session.user.email;
    if (!email.endsWith('@ukpos.com')) {
      await sb.auth.signOut();
      window.location.href = '/login.html';
      return;
    }

    // Populate topbar
    const name = email.split('@')[0];
    const initials = name.slice(0, 2).toUpperCase();
    document.getElementById('shell-avatar').textContent = initials;
    document.getElementById('shell-username').textContent = name;
    document.getElementById('shell-menu-email').textContent = email;

    // Check profile
    const { data: profile } = await sb.from('profiles')
      .select('role, status')
      .eq('id', session.user.id)
      .maybeSingle();

    if (!profile || profile.status !== 'approved') {
      window.location.href = '/pending.html';
      return;
    }

    const roleLabel = profile.role === 'super_admin' ? 'Super Admin' : 'User';
    document.getElementById('shell-role').textContent = roleLabel;
    document.getElementById('shell-menu-role').textContent = roleLabel;

    if (profile.role === 'super_admin') {
      document.getElementById('shell-admin-link').style.display = '';
    }

    return { session, profile };
  };

  /* Auto-run on DOMContentLoaded */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.__shellInit);
  } else {
    window.__shellInit();
  }

})();
