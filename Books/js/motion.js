/* ==========================================================
   EVAM Books — motion helpers (anime.js, optional)

   Everything here is decoration: if anime.js did not load, or the user
   asked the system for reduced motion, every helper simply does nothing
   (or jumps straight to the end state). Safe to call from any module:

     Motion.enter(el | list, { stagger, delay, y })   fade + small rise
     Motion.stagger(container, selector)             enter children one by one
     Motion.countUp(el, { duration })               animate the number shown in el
     Motion.draw(svgPath, { duration, delay })      draw a line from start to end
     Motion.pop(el)                                 dialog / popover spring-in
     Motion.toastIn(el) / Motion.toastOut(el, done)
     Motion.slideIn(el, { from: "left" | "right" | "bottom" })
   ========================================================== */
const Motion = (() => {
    const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
    const ok = () => typeof anime !== "undefined" && !reduced();
    const list = t => !t ? [] : (t instanceof Element ? [t] : Array.from(t)).filter(Boolean);
    const clear = els => els.forEach(el => { el.style.opacity = ""; el.style.transform = ""; });
    const EASE = "cubicBezier(.2,.7,.2,1)";

    function enter(targets, { stagger = 45, delay = 0, y = 8, duration = 420 } = {}) {
        const els = list(targets);
        if (!els.length || !ok()) return;
        try {
            els.forEach(el => { el.style.opacity = "0"; el.style.transform = `translateY(${y}px)`; });
            anime({
                targets: els, opacity: [0, 1], translateY: [y, 0], duration, easing: EASE,
                delay: anime.stagger(stagger, { start: delay }),
                complete: () => clear(els)
            });
            // never leave anything invisible, whatever happens to the animation
            setTimeout(() => clear(els), duration + delay + stagger * els.length + 400);
        } catch { clear(els); }
    }

    function stagger(container, selector = ":scope > *", opts = {}) {
        if (!container) return;
        let kids;
        try { kids = container.querySelectorAll(selector); } catch { kids = container.children; }
        enter(Array.from(kids).slice(0, 24), opts);
    }

    /* Numbers like "AED 286,445.00", "-1,200", "12%": only the digits animate, the format is kept */
    function countUp(el, { duration = 900, delay = 0 } = {}) {
        if (!el || !ok()) return;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) if (/\d/.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode);
        nodes.forEach(node => {
            const text = node.nodeValue;
            const m = /(-?)([\d,]+)(\.(\d+))?/.exec(text);
            if (!m) return;
            const target = Number((m[1] || "") + m[2].replace(/,/g, "") + (m[3] || ""));
            if (!isFinite(target) || Math.abs(target) < 1) return;
            const dec = m[4] ? m[4].length : 0;
            const grouped = m[2].includes(",");
            const fmtN = v => {
                const s = Math.abs(v).toFixed(dec);
                const [i, f] = s.split(".");
                const ii = grouped ? i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : i;
                return (v < 0 ? "-" : "") + ii + (f !== undefined ? "." + f : "");
            };
            const before = text.slice(0, m.index), after = text.slice(m.index + m[0].length);
            const o = { v: 0 };
            try {
                anime({
                    targets: o, v: target, duration, delay, easing: "easeOutExpo", round: false,
                    update: () => { node.nodeValue = before + fmtN(o.v) + after; },
                    complete: () => { node.nodeValue = text; }
                });
                setTimeout(() => { node.nodeValue = text; }, duration + delay + 300);
            } catch { node.nodeValue = text; }
        });
    }

    function draw(path, { duration = 1100, delay = 0 } = {}) {
        if (!path || !ok() || typeof path.getTotalLength !== "function") return;
        try {
            const len = path.getTotalLength();
            path.style.strokeDasharray = len;
            path.style.strokeDashoffset = len;
            anime({ targets: path, strokeDashoffset: [len, 0], duration, delay, easing: "easeInOutCubic",
                complete: () => { path.style.strokeDasharray = ""; path.style.strokeDashoffset = ""; } });
        } catch { path.style.strokeDasharray = ""; path.style.strokeDashoffset = ""; }
    }

    function fade(el, { duration = 600, delay = 0, from = 0 } = {}) {
        if (!el || !ok()) return;
        try { el.style.opacity = String(from); anime({ targets: el, opacity: [from, 1], duration, delay, easing: "easeOutQuad", complete: () => { el.style.opacity = ""; } }); }
        catch { el.style.opacity = ""; }
    }

    function grow(els, { duration = 700, delay = 0, axis = "y" } = {}) {
        const xs = list(els);
        if (!xs.length || !ok()) return;
        try {
            xs.forEach(el => { el.style.transformOrigin = axis === "y" ? "bottom" : "left"; });
            anime({ targets: xs, [axis === "y" ? "scaleY" : "scaleX"]: [0, 1], duration, easing: "easeOutExpo", delay: anime.stagger(40, { start: delay }),
                complete: () => xs.forEach(el => { el.style.transform = ""; }) });
        } catch { xs.forEach(el => { el.style.transform = ""; }); }
    }

    function pop(el) {
        if (!el || !ok()) return;
        try {
            anime.remove(el);
            anime({ targets: el, opacity: [0, 1], scale: [0.965, 1], translateY: [6, 0], duration: 520, easing: "spring(1, 90, 14, 0)",
                complete: () => clear([el]) });
        } catch { clear([el]); }
    }

    function slideIn(el, { from = "left", duration = 380 } = {}) {
        if (!el || !ok()) return;
        const prop = from === "bottom" ? "translateY" : "translateX";
        const start = from === "left" ? "-100%" : "100%";
        try { anime.remove(el); anime({ targets: el, [prop]: [start, "0%"], duration, easing: "cubicBezier(.16,1,.3,1)", complete: () => { el.style.transform = ""; } }); }
        catch { el.style.transform = ""; }
    }

    function toastIn(el) {
        if (!el) return;
        el.classList.add("in");
        if (!ok()) return;
        try { anime({ targets: el, opacity: [0, 1], translateY: [14, 0], scale: [0.98, 1], duration: 460, easing: "spring(1, 100, 15, 0)", complete: () => clear([el]) }); }
        catch { clear([el]); }
    }
    function toastOut(el, done) {
        if (!el) return;
        if (!ok()) { el.classList.remove("in"); setTimeout(done, 200); return; }
        try { anime({ targets: el, opacity: [1, 0], translateY: [0, 8], duration: 220, easing: "easeInQuad", complete: done }); }
        catch { done(); }
    }

    return { ok, enter, stagger, countUp, draw, fade, grow, pop, slideIn, toastIn, toastOut, reduced };
})();
window.Motion = Motion;
