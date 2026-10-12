# EVAM Documents (v2.3)

Invoices, proforma invoices, quotations, purchase orders, credit notes, delivery notes, letterhead letters and board resolutions, with a live A4 preview. Old documents can be imported from PDFs, scans and photos.

## Run it
Open `index.html` in Chrome, Edge or Safari. It works straight from a folder and from any web host. It no longer needs a local server.

## Where data is kept
Documents, contacts, products and settings are saved in the browser you use (localStorage).
- Use **Settings → Backup → Export backup** regularly.
- To move to another computer or browser, import that file there.
- The old invoice counter is picked up automatically the first time you open v2.

## Files
| File | What it does |
|---|---|
| `index.html` | App shell |
| `css/app.css` | Interface styles |
| `css/doc.css` | The printed A4 document (preview and print) |
| `js/defaults.js` | Starting company details, bank accounts, currencies, document types, numbering, terms |
| `js/util.js` | Formatting, amount in words, dates, sanitising |
| `js/store.js` | Saving, numbering, calculations |
| `js/editor.js` | Rich text editor and icons |
| `js/render.js` | Builds the document HTML |
| `js/importer.js` | Reads imported PDFs and images and turns them into documents |
| `js/app.js` | Screens and interactions |
| `forms/document.html` | Redirect so old links to the letter generator still work |

Company details, bank accounts, numbering formats and default terms are edited in **Settings**. You do not need to change code for them. `js/defaults.js` only sets the values a new browser starts with.

## Board resolutions
Choose **Board resolution** in the document menu. Pick a template (bank account, authorised signatory, acquisition, change of address, annual accounts, power of attorney), then replace the words in [square brackets]; unfinished brackets are highlighted on the page. "Resolved that" and "Further resolved that" are added automatically. Directors come from **Settings → Company**. Check the final wording with your corporate service provider before filing.

## Importing old documents
Open **Import** and drop PDFs, JPGs or PNGs (many at once). Each file is read and saved to Documents with the status **Imported**.
- PDFs with selectable text are read directly. Scans and photos are read with text recognition (Tesseract), which needs an internet connection the first time to download the reader.
- Files are read on this computer and never uploaded.
- Totals always match the original. Anything uncertain is listed on the document under *things to check*; use **View original** to compare.
- Original files are kept in this browser's file storage. Backups contain the extracted documents, not the original files.

## Printing
Use Chrome or Edge for printing; they repeat the table header and footer on every page.
**Print / PDF** opens the browser print dialog with the document only. Choose *Save as PDF* to get a file; the file name is filled in, e.g. `Invoice INV-26-10-004 - Customer`. For exact colours, keep *Background graphics* ticked.

## Keyboard
- `Ctrl/⌘ + S` save
- `Ctrl/⌘ + P` print
- `Ctrl/⌘ + Enter` add a line

## Amounts on the Documents page
- **Outstanding** counts every invoice that is not paid or cancelled, including drafts and imported invoices (drafts are noted as "not yet sent").
- Issued credit notes whose reference is the invoice number reduce that invoice's balance.
- Setting the status to **Paid** (or *Mark as paid*) fills in the amount actually due, after credit notes; typing an amount received sets the status to **Part paid** or **Paid**.
- **Received this month** is counted by the date the payment was recorded.

## Line items
A line counts once it has an item name, a description or a rate. A line with only a description prints the description in the item column. Blank spare lines are removed when you save or print. Hiding the Discount column on a document that has line discounts asks first and removes them, so the printed rows always add up.
