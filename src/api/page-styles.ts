// Feuilles de style des pages rendues côté serveur (2026-11-12) : sorties des gabarits pour que csp.ts puisse
// autoriser chaque bloc <style> par son empreinte (style-src-elem sans 'unsafe-inline').
export const REVIEW_CSS = `
body{font-family:system-ui,-apple-system,sans-serif;background:#0e1117;color:#e6edf3;margin:0;padding:24px 16px;line-height:1.5}
main{max-width:560px;margin:0 auto}h1{font-size:20px;margin:0 0 4px}.job{color:#8b949e;margin:0 0 20px;font-family:monospace}
.box{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:14px 16px;margin:0 0 14px}
.lbl{font-size:12px;color:#8b949e;text-transform:uppercase;letter-spacing:.04em;margin:0 0 4px}
button{font:inherit;border:0;border-radius:8px;padding:12px 16px;width:100%;margin:8px 0 0;cursor:pointer}
.ok{background:#238636;color:#fff}.fix{background:#1f6feb;color:#fff}.bad{background:transparent;color:#f85149;border:1px solid #f8514966}
textarea{font:inherit;width:100%;box-sizing:border-box;min-height:90px;background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:8px;padding:10px}
.done{background:#23863622;border-color:#238636}`

export const PRICING_CSS = `
  body{font-family:system-ui,-apple-system,sans-serif;background:#0e1117;color:#e6edf3;margin:0;padding:48px 16px;text-align:center}
  h1{font-size:28px;margin:0 0 8px} .sub{color:#8b949e;margin:0 0 40px}
  .plans{display:flex;gap:24px;justify-content:center;flex-wrap:wrap;max-width:760px;margin:0 auto}
  .plan{background:#161b22;border:1px solid #30363d;border-radius:14px;padding:28px;width:300px;text-align:left}
  .plan.pro{border-color:#8957e5}
  .plan h2{margin:0 0 4px} .price{font-size:32px;font-weight:700;margin:0 0 16px} .price span{font-size:15px;color:#8b949e;font-weight:400}
  ul{list-style:none;padding:0;margin:0 0 24px} li{padding:6px 0;color:#c9d1d9} li::before{content:"✓ ";color:#3fb950}
  .cta{display:block;text-align:center;padding:10px;border-radius:8px;background:#238636;color:#fff;text-decoration:none;font-weight:500}
  .cta.ghost{background:transparent;border:1px solid #30363d;color:#c9d1d9}
`
