/* ==========================================================
   EVAM Books — hand-made SVG charts (no library)

     Charts.area(host, { labels, series: [{ name, values, color }], format, height })
         Smooth area chart with gradient fill, gridlines, crosshair and tooltip.
         color is a CSS colour or variable, e.g. "var(--chart-1)".
     Charts.donut(host, { items: [{ label, value, color }], center, sub, format })
     Charts.compact(v)  →  "12.5k", "1.2M"

   Both redraw on resize and animate in with Motion when it is available.
   ========================================================== */
const Charts = (() => {
    const NS = "http://www.w3.org/2000/svg";
    const compact = v => {
        const a = Math.abs(v), s = v < 0 ? "-" : "";
        if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
        if (a >= 1e3) return s + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "k";
        return s + Math.round(a);
    };
    const niceMax = v => {
        if (v <= 0) return 1;
        const p = Math.pow(10, Math.floor(Math.log10(v)));
        const n = v / p;
        return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
    };
    const escH = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    /* Monotone cubic interpolation (no overshoot below zero) */
    function smoothPath(pts) {
        const n = pts.length;
        if (!n) return "";
        if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
        const dx = [], dy = [], m = [], t = [];
        for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dy[i] / dx[i]; }
        t[0] = m[0]; t[n - 1] = m[n - 2];
        for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
        for (let i = 0; i < n - 1; i++) {
            if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
            const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
            if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
        }
        let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
        for (let i = 0; i < n - 1; i++) {
            const c1x = pts[i][0] + dx[i] / 3, c1y = pts[i][1] + t[i] * dx[i] / 3;
            const c2x = pts[i + 1][0] - dx[i] / 3, c2y = pts[i + 1][1] - t[i + 1] * dx[i] / 3;
            d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${pts[i + 1][0].toFixed(2)},${pts[i + 1][1].toFixed(2)}`;
        }
        return d;
    }

    function observe(host, draw) {
        let w = host.clientWidth;
        if (host._chartRO) host._chartRO.disconnect();
        if (typeof ResizeObserver === "undefined") return;
        host._chartRO = new ResizeObserver(() => {
            if (!host.isConnected) { host._chartRO.disconnect(); return; }
            if (Math.abs(host.clientWidth - w) > 2) { w = host.clientWidth; draw(false); }
        });
        host._chartRO.observe(host);
    }

    /* ---------- Area chart ---------- */
    function area(host, opts) {
        const { labels = [], series = [], format = v => String(v), height = 240, titles = labels } = opts;
        const uid = "c" + Math.random().toString(36).slice(2, 8);
        const draw = (animate = true) => {
            const W = Math.max(260, host.clientWidth || 600), H = height === "auto" ? Math.max(220, Math.min(420, host.clientHeight || 250)) : height;
            const padL = 44, padR = 14, padT = 14, padB = 30;
            const iw = W - padL - padR, ih = H - padT - padB;
            const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
            const n = labels.length;
            const x = i => padL + (n <= 1 ? iw / 2 : i * iw / (n - 1));
            const y = v => padT + ih - (Math.max(0, v) / max) * ih;
            const ticks = [0, .25, .5, .75, 1].map(f => f * max);
            const svg = `<svg class="chart-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escH(opts.aria || "Chart")}">
<defs>${series.map((s, k) => `<linearGradient id="${uid}g${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style="stop-color:${s.color};stop-opacity:.26"/><stop offset="70%" style="stop-color:${s.color};stop-opacity:.05"/><stop offset="100%" style="stop-color:${s.color};stop-opacity:0"/></linearGradient>`).join("")}</defs>
<g class="chart-grid">${ticks.map(t => `<line x1="${padL}" x2="${W - padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`).join("")}</g>
<g class="chart-ylab">${ticks.map(t => `<text x="${padL - 10}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${compact(t)}</text>`).join("")}</g>
<g class="chart-xlab">${labels.map((l, i) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle"}">${escH(l)}</text>`).join("")}</g>
${series.map((s, k) => { const pts = s.values.map((v, i) => [x(i), y(v)]); const line = smoothPath(pts); return `<path class="chart-area" data-k="${k}" d="${line} L${x(n - 1).toFixed(2)},${(padT + ih).toFixed(2)} L${x(0).toFixed(2)},${(padT + ih).toFixed(2)} Z" style="fill:url(#${uid}g${k})"/><path class="chart-line" data-k="${k}" d="${line}" style="stroke:${s.color}"/>`; }).join("")}
<line class="chart-cross" x1="0" x2="0" y1="${padT}" y2="${padT + ih}" style="opacity:0"/>
${series.map((s, k) => `<circle class="chart-dot" data-k="${k}" r="4.5" cx="0" cy="0" style="stroke:${s.color};opacity:0"/>`).join("")}
<rect class="chart-hit" x="${padL - 10}" y="${padT}" width="${iw + 20}" height="${ih}" fill="transparent"/>
</svg>`;
            host.innerHTML = `<div class="chart" style="height:${H}px">${svg}<div class="chart-tip" role="status" aria-live="polite" hidden></div></div>`;
            const root = host.firstElementChild, s = $("svg", root), tip = $(".chart-tip", root);
            const cross = $(".chart-cross", s), dots = $$(".chart-dot", s), hit = $(".chart-hit", s);
            const show = i => {
                const cx = x(i);
                cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.style.opacity = 1;
                dots.forEach((d, k) => { d.setAttribute("cx", cx); d.setAttribute("cy", y(series[k].values[i])); d.style.opacity = 1; });
                const net = series.length === 2 ? series[0].values[i] - series[1].values[i] : null;
                tip.innerHTML = `<div class="ct-title">${escH(titles[i])}</div>${series.map(se => `<div class="ct-row"><i style="background:${se.color}"></i><span>${escH(se.name)}</span><b>${escH(format(se.values[i]))}</b></div>`).join("")}${net !== null && opts.netLabel ? `<div class="ct-row ct-net"><span>${escH(opts.netLabel)}</span><b class="${net < 0 ? "neg" : ""}">${escH(format(net))}</b></div>` : ""}`;
                tip.hidden = false;
                const tw = tip.offsetWidth, left = cx + 14 + tw > W ? cx - 14 - tw : cx + 14;
                tip.style.left = Math.max(0, left) + "px";
                tip.style.top = Math.max(0, Math.min(...series.map(se => y(se.values[i]))) - 20) + "px";
            };
            const hide = () => { cross.style.opacity = 0; dots.forEach(d => { d.style.opacity = 0; }); tip.hidden = true; };
            const at = e => { const r = s.getBoundingClientRect(); const px = (e.touches ? e.touches[0].clientX : e.clientX) - r.left; return Math.max(0, Math.min(n - 1, Math.round(n <= 1 ? 0 : (px - padL) / (iw / (n - 1))))); };
            hit.addEventListener("pointermove", e => show(at(e)));
            hit.addEventListener("pointerdown", e => show(at(e)));
            hit.addEventListener("pointerleave", hide);
            if (animate && typeof Motion !== "undefined") {
                $$(".chart-line", s).forEach((p, k) => Motion.draw(p, { duration: 1100, delay: 80 + k * 120 }));
                $$(".chart-area", s).forEach((p, k) => Motion.fade(p, { duration: 900, delay: 350 + k * 120 }));
            }
        };
        draw(true);
        observe(host, draw);
    }

    /* ---------- Donut ---------- */
    function donut(host, opts) {
        const { items = [], format = v => String(v), center = "", sub = "" } = opts;
        const total = items.reduce((s, i) => s + Math.max(0, i.value), 0) || 1;
        const R = 52, C = 2 * Math.PI * R, gap = items.length > 1 ? 2.2 : 0;
        let acc = 0;
        const segs = items.map((it, k) => {
            const len = Math.max(0, it.value) / total * C;
            const seg = `<circle class="donut-seg" data-k="${k}" r="${R}" cx="64" cy="64" style="stroke:${it.color};stroke-dasharray:${Math.max(0.001, len - gap).toFixed(2)} ${C.toFixed(2)};stroke-dashoffset:${(-acc).toFixed(2)}"/>`;
            acc += len;
            return seg;
        }).join("");
        host.innerHTML = `<div class="donut"><svg viewBox="0 0 128 128" role="img" aria-label="${escH(opts.aria || "Breakdown")}"><circle class="donut-track" r="${R}" cx="64" cy="64"/><g transform="rotate(-90 64 64)">${segs}</g></svg>
<div class="donut-center"><b>${escH(center)}</b><span>${escH(sub)}</span></div></div>`;
        const segEls = $$(".donut-seg", host), b = $(".donut-center b", host), sp = $(".donut-center span", host);
        segEls.forEach(el => {
            const it = items[Number(el.dataset.k)];
            el.addEventListener("pointerenter", () => { host.classList.add("hovering"); el.classList.add("on"); b.textContent = Math.round(it.value / total * 100) + "%"; sp.textContent = it.label; });
            el.addEventListener("pointerleave", () => { host.classList.remove("hovering"); el.classList.remove("on"); b.textContent = center; sp.textContent = sub; });
        });
        if (typeof Motion !== "undefined" && Motion.ok()) {
            const g = $("g", host);
            const o = { p: 0 };
            try { g.style.opacity = "0"; anime({ targets: o, p: 1, duration: 900, easing: "easeOutExpo", update: () => { g.style.opacity = String(Math.min(1, o.p * 1.6)); g.setAttribute("transform", `rotate(${(-90 - 50 * (1 - o.p)).toFixed(2)} 64 64)`); }, complete: () => { g.style.opacity = ""; g.setAttribute("transform", "rotate(-90 64 64)"); } }); }
            catch { g.style.opacity = ""; g.setAttribute("transform", "rotate(-90 64 64)"); }
        }
    }

    return { area, donut, compact, smoothPath };
})();
window.Charts = Charts;
