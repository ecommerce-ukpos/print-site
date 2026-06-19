with open('public/designer/index.html', 'r') as f:
    html = f.read()

# ── 1. Replace Step 1 select with typeahead ──────────────────
# Find and replace the entire optgroup-laden select
old_select_start = '      <select class="sku-select" id="skuSelect" onchange="onSkuChange()">'
old_select_end = '      </select>'

start = html.find(old_select_start)
end = html.find(old_select_end, start) + len(old_select_end)

if start != -1 and end != -1:
    new_select = '''      <div class="sku-search-wrap">
        <input type="text" class="sku-search-input" id="skuSearchInput"
          placeholder="Search SKU or product name\u2026"
          autocomplete="off" spellcheck="false"
          oninput="onSkuSearch(this.value)"
          onfocus="onSkuSearch(this.value)"
          onkeydown="onSkuSearchKey(event)" />
        <div class="sku-search-dd" id="skuSearchDd"></div>
      </div>'''
    html = html[:start] + new_select + html[end:]
    print('\u2713 Step 1 select replaced with typeahead')
else:
    print('\u2717 Step 1 select not found - already replaced')

# ── 2. Fix onSkuSearch to show all on focus (0 char min) ────
html = html.replace(
    "if(!q||q.length<1){dd.classList.remove('show');return;}",
    "if(q===null||q===undefined){dd.classList.remove('show');return;}"
)

# ── 3. Better dropdown display format ───────────────────────
# "ABG1 — Aluminium Sign A1 pavement sign (594x841mm) · 150dpi · CMYK"
old_dd_html = (
    "'<span class=\"sku-dd-family\">'+(r.sku_family||'\\u2014')"
    "+'<span style=\"font-weight:400;color:#B4B2A9;margin-left:5px\">'+(r.template_code||'')+'</span></span>'"
    "+'<span class=\"sku-dd-name\">'+(r.product_name||r.sku_file||'\\u2014')+'</span>'"
    "+((dims||dpi)?'<span class=\"sku-dd-dims\">'+[dims,dpi,r.colour_profile].filter(Boolean).join(' \\u00b7 ')+'</span>':'')"
)
new_dd_html = (
    "'<span class=\"sku-dd-family\">'+(r.sku_family||'\\u2014')+'</span>'"
    "+'<span class=\"sku-dd-name\">'+(r.product_name||r.sku_file||'\\u2014')"
    "+(dims?' ('+dims+')':'')+'</span>'"
    "+((dpi||r.colour_profile)?'<span class=\"sku-dd-dims\">'+[dpi,r.colour_profile].filter(Boolean).join(' \\u00b7 ')+'</span>':'')"
)
if old_dd_html in html:
    html = html.replace(old_dd_html, new_dd_html)
    print('\u2713 Dropdown display format updated')
else:
    print('\u2717 Dropdown display format string not found - may already be updated')

# ── 4. Fix stale skuSelect references in init block ─────────
html = html.replace(
    "if(sku&&SKU_SPECS[sku]){document.getElementById('skuSelect').value=sku;onSkuChange();}",
    "if(sku&&SKU_SPECS[sku]){loadSkuDb().then(()=>applySkuRow({sku_family:sku,...SKU_SPECS[sku],sku_file:sku,product_name:SKU_SPECS[sku]?.label||sku}));}"
)
html = html.replace(
    "}else if(urlSku&&SKU_SPECS[urlSku]){document.getElementById('skuSelect').value=urlSku;onSkuChange();}",
    "}else if(urlSku&&SKU_SPECS[urlSku]){loadSkuDb().then(()=>applySkuRow({sku_family:urlSku,...SKU_SPECS[urlSku],sku_file:urlSku,product_name:SKU_SPECS[urlSku]?.label||urlSku}));}"
)
print('\u2713 Init block skuSelect references fixed')

with open('public/designer/index.html', 'w') as f:
    f.write(html)

print('\n\u2705 Done')