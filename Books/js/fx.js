/* ==========================================================
   Live exchange rates
   Streams prices over a WebSocket (Twelve Data, Finnhub or your own feed) and keeps
   AED rates for every currency up to date. Without a key it falls back to free
   reference rates (updated a few times a day). The dirham and other Gulf currencies
   pegged to the dollar always use their official pegs.
   ========================================================== */
const FX_PEGS = { AED: 1, USD: 3.6725, SAR: 0.97933, QAR: 1.00879, OMR: 9.5506, BHD: 9.7686 };
const FX_BASE_FIRST = new Set(["EUR", "GBP", "AUD", "NZD"]);   // quoted as XXX/USD; everything else USD/XXX
const FX_PROVIDERS = {
    off: { label: "Off — use the rates saved in the books" },
    free: { label: "Free reference rates (no key, updated a few times a day)" },
    twelvedata: { label: "Twelve Data — live WebSocket (API key)", key: true },
    finnhub: { label: "Finnhub — live WebSocket (API key)", key: true },
    custom: { label: "Your own WebSocket feed (URL)", url: true }
};

const LiveFX = {
    rates: {},          // AED per 1 unit
    usd: {},            // units of the currency per 1 USD (or USD per unit for base-first)
    updated: {},
    status: "off",      // off | connecting | live | polling | error
    detail: "",
    ws: null,
    _timer: null, _poll: null, _beat: null, _retry: 0, _cfgKey: "",
    listeners: new Set(),

    config() {
        const c = (typeof Store !== "undefined" && Store.data && Store.settings.finance && Store.settings.finance.liveFx) || {};
        return { provider: c.provider || "free", key: c.key || "", url: c.url || "" };
    },
    currencies() { return Object.keys(CURRENCIES).filter(c => !(c in FX_PEGS)); },
    pairOf(cur) { return FX_BASE_FIRST.has(cur) ? `${cur}/USD` : `USD/${cur}`; },

    /* AED per 1 unit from a price of the pair */
    fromPair(cur, price) {
        price = Number(price);
        if (!(price > 0)) return null;
        const usdPerUnit = FX_BASE_FIRST.has(cur) ? price : 1 / price;
        return Math.round(usdPerUnit * FX_PEGS.USD * 1e6) / 1e6;
    },
    set(cur, aed, source) {
        if (!(aed > 0) || !CURRENCIES[cur] || cur in FX_PEGS) return;
        const prev = this.rates[cur];
        this.rates[cur] = aed;
        this.updated[cur] = Date.now();
        if (source) this.source = source;
        if (prev !== aed) this.emitSoon();
    },
    /* Live rate if we have a recent one, else null */
    live(cur) {
        if (cur in FX_PEGS) return FX_PEGS[cur];
        const t = this.updated[cur];
        return t && Date.now() - t < 36 * 3600 * 1000 ? this.rates[cur] : null;
    },
    /* The rate a new record should use: pegged, live, or the rate saved in the books */
    rate(cur) {
        if (!cur || cur === "AED") return 1;
        if (cur in FX_PEGS) return FX_PEGS[cur];
        if (this.config().provider !== "off") { const l = this.live(cur); if (l) return l; }
        const saved = typeof Store !== "undefined" && Store.data ? num(Store.settings.finance?.rates?.[cur]) : 0;
        return saved || "";
    },
    onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
    emitSoon() {
        clearTimeout(this._emitT);
        this._emitT = setTimeout(() => this.listeners.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } }), 250);
    },
    setStatus(s, detail = "") { this.status = s; this.detail = detail; this.emitSoon(); },

    /* ---------- Start / stop ---------- */
    start() {
        const cfg = this.config();
        const key = JSON.stringify(cfg);
        if (key === this._cfgKey && this.status !== "off" && this.status !== "error") return;
        this.stop();
        this._cfgKey = key;
        if (cfg.provider === "off") { this.setStatus("off"); return; }
        this.fetchReference();                                  // something to show straight away
        if (cfg.provider === "free" || (FX_PROVIDERS[cfg.provider]?.key && !cfg.key) || (cfg.provider === "custom" && !cfg.url)) {
            this._poll = setInterval(() => this.fetchReference(), 30 * 60 * 1000);
            this.setStatus("polling", cfg.provider === "free" ? "" : "Add the API key in Finance settings to stream live prices.");
            return;
        }
        this.connect();
    },
    stop() {
        clearTimeout(this._timer); clearInterval(this._poll); clearInterval(this._beat);
        this._timer = this._poll = this._beat = null;
        if (this.ws) { try { this.ws.onclose = null; this.ws.close(); } catch { /* ignore */ } this.ws = null; }
        this._cfgKey = "";
    },
    restart() { this.stop(); this.start(); },

    async fetchReference() {
        try {
            const r = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
            if (!r.ok) throw new Error(r.status);
            const d = await r.json();
            if (!d || !d.rates) throw new Error("no rates");
            for (const cur of this.currencies()) {
                const perUsd = Number(d.rates[cur]);
                if (perUsd > 0) {
                    // Don't let a reference rate overwrite a fresher streamed price
                    if (this.status === "live" && this.updated[cur] && Date.now() - this.updated[cur] < 3600 * 1000) continue;
                    this.set(cur, Math.round(FX_PEGS.USD / perUsd * 1e6) / 1e6, "Reference rates");
                }
            }
            this.refAt = Date.now();
            this.emitSoon();
        } catch (e) {
            if (this.status === "polling") this.setStatus("polling", "Couldn't reach the reference rates. Using the rates saved in the books.");
        }
    },

    connect() {
        const cfg = this.config();
        const cur = this.currencies();
        let url, onOpen, onMsg;
        if (cfg.provider === "twelvedata") {
            url = `wss://ws.twelvedata.com/v1/quotes/price?apikey=${encodeURIComponent(cfg.key)}`;
            onOpen = ws => {
                ws.send(JSON.stringify({ action: "subscribe", params: { symbols: cur.map(c => this.pairOf(c)).join(",") } }));
                this._beat = setInterval(() => { try { ws.send(JSON.stringify({ action: "heartbeat" })); } catch { /* ignore */ } }, 10000);
            };
        } else if (cfg.provider === "finnhub") {
            url = `wss://ws.finnhub.io?token=${encodeURIComponent(cfg.key)}`;
            onOpen = ws => cur.forEach(c => ws.send(JSON.stringify({ type: "subscribe", symbol: "OANDA:" + this.pairOf(c).replace("/", "_") })));
        } else {
            url = cfg.url;
            onOpen = ws => ws.send(JSON.stringify({ action: "subscribe", symbols: cur.map(c => this.pairOf(c)) }));
        }
        onMsg = text => {
            let m; try { m = JSON.parse(text); } catch { return; }
            for (const q of this.quotesIn(m)) this.apply(q.symbol, q.price);
        };
        this.setStatus("connecting");
        let ws;
        try { ws = new WebSocket(url); } catch (e) { this.fail("Couldn't open the live feed: " + e.message); return; }
        this.ws = ws;
        ws.onopen = () => { this._retry = 0; this.setStatus("live", ""); try { onOpen(ws); } catch (e) { console.warn(e); } };
        ws.onmessage = ev => onMsg(typeof ev.data === "string" ? ev.data : "");
        ws.onerror = () => { /* onclose follows */ };
        ws.onclose = ev => {
            clearInterval(this._beat);
            this.ws = null;
            const auth = ev && (ev.code === 1008 || ev.code === 4001 || ev.code === 4003);
            this.fail(auth ? "The live feed refused the API key. Check it in Finance settings." : "Live feed disconnected — reconnecting…", !auth);
        };
    },
    fail(msg, retry = true) {
        // Keep rates moving with reference prices while the stream is down
        if (!this._poll) this._poll = setInterval(() => this.fetchReference(), 30 * 60 * 1000);
        this.setStatus(retry ? "connecting" : "error", msg);
        if (!retry) return;
        const wait = Math.min(60000, 2000 * Math.pow(2, this._retry++));
        clearTimeout(this._timer);
        this._timer = setTimeout(() => { if (this.config().provider !== "off") this.connect(); }, wait);
    },
    /* Any of the common message shapes → [{ symbol, price }] */
    quotesIn(m) {
        if (!m || typeof m !== "object") return [];
        if (Array.isArray(m)) return m.flatMap(x => this.quotesIn(x));
        if (m.type === "trade" && Array.isArray(m.data)) return m.data.map(d => ({ symbol: d.s, price: d.p }));           // Finnhub
        if (m.event === "price" || (m.symbol && (m.price !== undefined || m.bid !== undefined))) {                               // Twelve Data / generic
            const p = m.price !== undefined ? m.price : (Number(m.bid) + Number(m.ask)) / 2;
            return [{ symbol: m.symbol, price: p }];
        }
        if (m.s && m.p !== undefined) return [{ symbol: m.s, price: m.p }];
        if (m.rates && typeof m.rates === "object") return Object.entries(m.rates).map(([c, v]) => ({ symbol: "USD/" + c, price: v }));
        return [];
    },
    apply(symbol, price) {
        const s = String(symbol || "").toUpperCase().replace(/^[A-Z]+:/, "").replace("_", "/");
        const [a, b] = s.split("/");
        if (!a || !b) return;
        let cur, aed;
        if (b === "USD") { cur = a; aed = Number(price) * FX_PEGS.USD; }
        else if (a === "USD") { cur = b; aed = FX_PEGS.USD / Number(price); }
        else if (b === "AED") { cur = a; aed = Number(price); }
        else return;
        if (!(aed > 0) || !isFinite(aed)) return;
        this.set(cur, Math.round(aed * 1e6) / 1e6, "Live");
    },

    label() {
        const cfg = this.config();
        if (cfg.provider === "off") return "Live rates off";
        if (this.status === "live") return "Live";
        if (this.status === "connecting") return "Connecting…";
        if (this.status === "error") return "Live feed error";
        return "Reference rates";
    }
};

/* ---------- The FX rates panel (top bar button) ---------- */
const FXPanel = {
    open() {
        const dlg = $("#fxDialog");
        if (!dlg) return;
        LiveFX.start();
        this.draw();
        if (!dlg.open) { dlg.showModal(); if (typeof Motion !== "undefined") Motion.pop(dlg); }
        this._off && this._off();
        this._off = LiveFX.onChange(() => { if (dlg.open) this.draw(); });
        dlg.addEventListener("close", () => { this._off && this._off(); this._off = null; }, { once: true });
    },
    draw() {
        const body = $("#fxBody");
        if (!body) return;
        const saved = (Store.settings.finance && Store.settings.finance.rates) || {};
        const docCur = typeof App !== "undefined" && App.doc ? App.doc.currency : null;
        const editing = typeof App !== "undefined" && App.view === "create" && docCur && docCur !== "AED";
        const canSave = typeof Server !== "undefined" && Server.online ? Server.can("accounting") || Server.can("settings") : true;
        const tone = { live: "good", connecting: "warn", polling: "info", error: "bad", off: "mute" }[LiveFX.status] || "mute";
        const rows = Object.keys(CURRENCIES).filter(c => c !== "AED").map(c => {
            const peg = c in FX_PEGS;
            const live = LiveFX.live(c);
            const book = num(saved[c]);
            const diff = live && book ? (live - book) / book * 100 : null;
            const t = LiveFX.updated[c];
            return `<tr${c === docCur ? ' class="fx-cur"' : ""}><td><b>${c}</b> <span class="muted">${esc(CURRENCIES[c].name)}</span></td>
<td class="num">${live ? fmtRate(live) : '<span class="muted">—</span>'}${peg ? ' <span class="pill pill-neutral">Peg</span>' : ""}</td>
<td class="num">${book ? fmtRate(book) : '<span class="muted">not set</span>'}</td>
<td class="num">${diff === null || peg ? "" : `<span class="${Math.abs(diff) > 1 ? "warn-text" : "muted"}">${diff > 0 ? "+" : ""}${diff.toFixed(2)}%</span>`}</td>
<td class="muted">${peg ? "Fixed" : t ? relTime(t) : ""}</td></tr>`;
        }).join("");
        body.innerHTML = `
<div class="fx-status"><span class="pill pill-${tone}">${esc(LiveFX.label())}</span><span class="muted">${esc(LiveFX.detail || (LiveFX.status === "live" ? "Prices stream as they change." : LiveFX.status === "polling" ? "Free reference rates. Add a Twelve Data or Finnhub key in Finance settings to stream live prices." : ""))}</span></div>
<div class="table-card"><table class="dtable fx-table"><thead><tr><th>Currency</th><th class="num">Live (AED per 1)</th><th class="num">In the books</th><th class="num">Diff.</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="hint">New invoices, bills, payments and expenses in a foreign currency take the live rate automatically. ${canSave ? "Save them as the book rates to use them as the fallback everywhere." : ""}</p>`;
        const acts = $("#fxActions");
        if (acts) acts.innerHTML = `${editing ? `<button type="button" class="btn btn-ghost" id="fxUseDoc">Use ${docCur} rate on this document</button>` : ""}${canSave ? `<button type="button" class="btn btn-ghost" id="fxSave">Save as book rates</button>` : ""}<a class="btn btn-quiet" href="https://www.xe.com/currencyconverter/" target="_blank" rel="noopener">Open XE</a>`;
        $("#fxUseDoc")?.addEventListener("click", () => {
            const r = LiveFX.rate(docCur);
            if (!r) { toast(`No rate for ${docCur} yet.`, "warn"); return; }
            App.doc.fx.rate = r;
            const inp = $(`[data-bind="fx.rate"]`); if (inp) inp.value = r;
            if (typeof changed === "function") changed();
            toast(`Exchange rate set to ${fmtRate(r)}.`, "good");
        });
        $("#fxSave")?.addEventListener("click", () => {
            const fin = Store.settings.finance = Store.settings.finance || {};
            fin.rates = { ...(fin.rates || {}) };
            let n = 0;
            for (const c of Object.keys(CURRENCIES)) { const l = LiveFX.live(c); if (l && c !== "AED") { fin.rates[c] = l; n++; } }
            fin.ratesDate = todayISO();
            Store.save();
            toast(`Saved ${n} rates as the book rates for ${fmtDate(fin.ratesDate)}.`, "good");
            this.draw();
        });
    }
};
