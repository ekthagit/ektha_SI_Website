/* ==========================================================
   Rich text editor + shared SVG icons
   ========================================================== */

const ICON_PATHS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3"/><rect x="8" y="13" width="8" height="6"/>',
    file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M12 11v6M9 14h6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    up: '<path d="M18 15l-6-6-6 6"/>',
    more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    minus: '<path d="M5 12h14"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    note: '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    box: '<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
    bullets: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="3"/>',
    numbers: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 5l1.5-1v5M3.5 9h3M3.5 13.5c.5-1 2.8-1.2 2.8.4 0 1.2-2.8 2.1-2.8 3.1h3"/>',
    alignLeft: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
    alignCenter: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
    alignRight: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
    alignJustify: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
    clear: '<path d="M6 4h12M12 4l-3 16M4 20l16-16" />',
    grip: '<path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" stroke-width="2.6"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
};

function icon(name, size = 16) {
    return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;
}

/* ----------------------------------------------------------
   createRichEditor(host, { value, onInput, full, minHeight, placeholder })
   Returns { el, get(), set(html) }.
   ---------------------------------------------------------- */
function createRichEditor(host, opts = {}) {
    const full = !!opts.full;
    const wrap = document.createElement("div");
    wrap.className = "rte";
    const btn = (cmd, label, inner) =>
        `<button type="button" class="rte-btn" data-cmd="${cmd}" title="${label}" aria-label="${label}">${inner}</button>`;
    wrap.innerHTML = `
<div class="rte-bar" role="toolbar" aria-label="Text formatting">
  ${full ? `
  <select class="rte-font" aria-label="Font" title="Font">
    <option value="">Font</option>
    <option value="IBM Plex Sans">IBM Plex Sans</option>
    <option value="Poppins">Poppins</option>
    <option value="Source Serif 4">Source Serif</option>
    <option value="Arial">Arial</option>
    <option value="Calibri">Calibri</option>
    <option value="Georgia">Georgia</option>
    <option value="Times New Roman">Times New Roman</option>
  </select>
  <select class="rte-size" aria-label="Text size" title="Text size">
    <option value="">Size</option>
    <option value="1">8</option><option value="2">10</option><option value="3">12</option>
    <option value="4">14</option><option value="5">18</option><option value="6">24</option>
  </select>
  <span class="rte-sep"></span>` : ""}
  ${btn("bold", "Bold (Ctrl+B)", "<b>B</b>")}
  ${btn("italic", "Italic (Ctrl+I)", "<i>I</i>")}
  ${btn("underline", "Underline (Ctrl+U)", "<u>U</u>")}
  ${full ? `
  <label class="rte-btn rte-color" title="Text colour"><span>A</span><input type="color" class="rte-fore" value="#14395e" aria-label="Text colour"></label>
  <label class="rte-btn rte-color rte-hl" title="Highlight"><span>H</span><input type="color" class="rte-back" value="#fff3a3" aria-label="Highlight colour"></label>` : ""}
  <span class="rte-sep"></span>
  ${btn("insertUnorderedList", "Bulleted list", icon("bullets"))}
  ${btn("insertOrderedList", "Numbered list", icon("numbers"))}
  <span class="rte-sep"></span>
  ${btn("justifyLeft", "Align left", icon("alignLeft"))}
  ${btn("justifyCenter", "Centre", icon("alignCenter"))}
  ${btn("justifyRight", "Align right", icon("alignRight"))}
  ${full ? btn("justifyFull", "Justify", icon("alignJustify")) : ""}
  <span class="rte-sep"></span>
  ${btn("removeFormat", "Clear formatting", icon("clear"))}
</div>
<div class="rte-area" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true"></div>`;
    host.innerHTML = "";
    host.appendChild(wrap);
    const area = wrap.querySelector(".rte-area");
    area.style.minHeight = (opts.minHeight || 140) + "px";
    area.dataset.placeholder = opts.placeholder || "Type here…";
    area.innerHTML = sanitizeHTML(opts.value || "");
    if (opts.label) area.setAttribute("aria-label", opts.label);

    const fire = () => { refresh(); opts.onInput && opts.onInput(sanitizeHTML(area.innerHTML)); };
    const exec = (cmd, val = null) => {
        area.focus();
        try { document.execCommand("styleWithCSS", false, cmd === "hiliteColor" || cmd === "foreColor"); } catch (e) { /* not supported */ }
        document.execCommand(cmd, false, val);
        fire();
    };
    const refresh = () => {
        wrap.querySelectorAll("button[data-cmd]").forEach(b => {
            let on = false;
            try { on = document.queryCommandState(b.dataset.cmd); } catch (e) { /* ignore */ }
            b.classList.toggle("on", !!on && document.activeElement === area);
        });
        area.classList.toggle("is-empty", htmlIsEmpty(area.innerHTML));
    };

    wrap.querySelectorAll("button[data-cmd]").forEach(b => {
        b.addEventListener("mousedown", e => e.preventDefault()); // keep the selection
        b.addEventListener("click", () => exec(b.dataset.cmd));
    });
    const font = wrap.querySelector(".rte-font");
    if (font) font.addEventListener("change", () => { if (font.value) exec("fontName", font.value); font.value = ""; });
    const size = wrap.querySelector(".rte-size");
    if (size) size.addEventListener("change", () => { if (size.value) exec("fontSize", size.value); size.value = ""; });
    const fore = wrap.querySelector(".rte-fore");
    if (fore) fore.addEventListener("input", () => exec("foreColor", fore.value));
    const back = wrap.querySelector(".rte-back");
    if (back) back.addEventListener("input", () => exec("hiliteColor", back.value));

    area.addEventListener("input", fire);
    area.addEventListener("keyup", refresh);
    area.addEventListener("mouseup", refresh);
    area.addEventListener("blur", refresh);
    area.addEventListener("paste", e => {
        const html = e.clipboardData.getData("text/html");
        const text = e.clipboardData.getData("text/plain");
        e.preventDefault();
        if (html) document.execCommand("insertHTML", false, sanitizeHTML(html.replace(/<!--[\s\S]*?-->/g, "")));
        else document.execCommand("insertText", false, text);
        fire();
    });
    refresh();

    return {
        el: wrap,
        get: () => sanitizeHTML(area.innerHTML),
        set: (html) => { area.innerHTML = sanitizeHTML(html || ""); refresh(); }
    };
}
