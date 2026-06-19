with open('public/designer/index.html', 'r') as f:
    html = f.read()

# Show all SKUs on focus, filter as you type, min 0 chars
html = html.replace(
    "oninput=\"onSkuSearch(this.value)\"",
    "oninput=\"onSkuSearch(this.value)\" onfocus=\"onSkuSearch(this.value)\""
)

# Change min query length from 1 to 0 so focus shows everything
html = html.replace(
    "if(!q||q.length<1){dd.classList.remove('show');return;}",
    "if(q===null||q===undefined){dd.classList.remove('show');return;}"
)

# Better display format: "ABG1 — Aluminium Sign A1 (594×841mm)"
html = html.replace(
    "'<span class=\"sku-dd-name\">'+(r.product_name||r.sku_file||'\\u2014')+'</span>'+",
    "'<span class=\"sku-dd-name\">'+(r.product_name||r.sku_file||'\\u2014')+(w?' ('+Math.round(w)+'\\u00d7'+Math.round(h)+'mm)':'')+'</span>'+",
)

# Remove the separate dims line since we folded it into name
html = html.replace(
    "((dims||dpi)?'<span class=\"sku-dd-dims\">'+[dims,dpi,r.colour_profile].filter(Boolean).join(' \\u00b7 ')+'</span>':'')+",
    "((dpi||r.colour_profile)?'<span class=\"sku-dd-dims\">'+[dpi,r.colour_profile].filter(Boolean).join(' \\u00b7 ')+'</span>':'')+",
)

with open('public/designer/index.html', 'w') as f:
    f.write(html)

print("Done")