// --- CONFIGURATION ---
const CLIENT_ID = '330273087572-bb5h0ob2ahu56h93sac7hvf07je6uha7.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

let tokenClient;
let accessToken = null;
let fileId = null;
let pCategory, pSize;

const sizeMap = {
    Child: ["3","4", "5", "6","7","8","9","10"],
    Male: ["3","4", "5", "6","7","8","9","10"],
    Female: ["3","4", "5", "6","7","8","9","10"]
};
let user = {
    raw: [],
    prod: [],
    sale: [],
    company: "",
    owner: "",
    isSetupDone: false
};

// Global variable to track raw materials for current production
let tempRawMaterials = [];

// DOM Elements - Define all references upfront
let fRaw, fProd, fSale;
let riDate, riName, riQty, riCost, riExtraCost;
let pDate, pName, pQty, pExtraCost;
let sDate, sName, sQty, sAmt;

// --- UTILITY FUNCTIONS ---

// Escape HTML for XSS prevention
function escapeHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Toast notification system
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Search/filter table rows
function filterTable(inputId, tableId) {
    const query = (document.getElementById(inputId) || {}).value || '';
    const lowerQuery = query.toLowerCase();
    const rows = document.querySelectorAll(`#${tableId} tbody tr`);
    rows.forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(lowerQuery) ? '' : 'none';
    });
}

// Export table data as CSV
function exportCSV(type) {
    let headers, rows, filename;
    if (type === 'raw') {
        headers = ['Date','Material','Qty','Cost','Extra Cost','Total'];
        rows = user.raw.map(r => [r.d, r.n, r.q, r.c, r.ec || 0, (parseFloat(r.c)||0)+(parseFloat(r.ec)||0)]);
        filename = 'raw_materials.csv';
    } else if (type === 'prod') {
        headers = ['Date','Product','Category','Size','Qty','Raw Materials','Extra Cost'];
        rows = user.prod.map(p => {
            const rm = p.rm ? p.rm.map(r => `${r.n}(${r.q})`).join(';') : (p.rn || '');
            return [p.d, p.n, p.cat, p.size, p.q, rm, p.ec || 0];
        });
        filename = 'production.csv';
    } else if (type === 'sale') {
        headers = ['Date','Product','Qty','Amount'];
        rows = user.sale.map(s => [s.d, s.n, s.q, s.a]);
        filename = 'sales.csv';
    } else if (type === 'stock') {
        const inv = getInventory();
        headers = ['Category','Item','Total In','Total Out','Remaining'];
        rows = Object.values(inv).map(i => [i.c, i.n, i.in, i.out, (i.in - i.out).toFixed(2)]);
        filename = 'stock.csv';
    } else if (type === 'activity') {
        headers = ['Type','Date','Item','Qty','Details'];
        const acts = [
            ...user.raw.map(r => ({ type: 'Raw', d: r.d, n: r.n, q: r.q, det: `Cost:${(parseFloat(r.c)||0)+(parseFloat(r.ec)||0)}` })),
            ...user.prod.map(p => ({ type: 'Prod', d: p.d, n: p.n, q: p.q, det: p.rm ? p.rm.map(r=>`${r.n}(${r.q})`).join(';') : '' })),
            ...user.sale.map(s => ({ type: 'Sale', d: s.d, n: s.n, q: s.q, det: `Amt:${s.a}` }))
        ];
        rows = acts.map(a => [a.type, a.d, a.n, a.q, a.det]);
        filename = 'activity.csv';
    } else {
        return;
    }
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Initialize DOM references after DOM loads
function initDOMReferences() {
    fRaw = document.getElementById('fRaw');
    riDate = document.getElementById('riDate');
    riName = document.getElementById('riName');
    riQty = document.getElementById('riQty');
    riCost = document.getElementById('riCost');
    riExtraCost = document.getElementById('riExtraCost');

    pDate = document.getElementById('pDate');
    pName = document.getElementById('pName');
    pQty = document.getElementById('pQty');
    pExtraCost = document.getElementById('pExtraCost');
    pCategory = document.getElementById('pCategory');
    pSize = document.getElementById('pSize');

    fSale = document.getElementById('fSale');
    sDate = document.getElementById('sDate');
    sName = document.getElementById('sName');
    sQty = document.getElementById('sQty');
    sAmt = document.getElementById('sAmt');

    // Wire up static buttons via addEventListener (no inline onclick)
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.addEventListener('click', initiateLogin);

    const createAccountBtn = document.getElementById('createAccountBtn');
    if (createAccountBtn) createAccountBtn.addEventListener('click', saveSetup);

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    if (pCategory) pCategory.addEventListener('change', updateSizeOptions);

    const addRawBtn = document.getElementById('addRawBtn');
    if (addRawBtn) addRawBtn.addEventListener('click', addRawRow);

    const addAnotherRawBtn = document.getElementById('addAnotherRawBtn');
    if (addAnotherRawBtn) addAnotherRawBtn.addEventListener('click', addRawRow);

    const saveProdBtn = document.getElementById('saveProdBtn');
    if (saveProdBtn) saveProdBtn.addEventListener('click', saveProd);

    // Search inputs
    const searchRaw = document.getElementById('searchRaw');
    if (searchRaw) searchRaw.addEventListener('input', () => filterTable('searchRaw', 'tRaw'));

    const searchProd = document.getElementById('searchProd');
    if (searchProd) searchProd.addEventListener('input', () => filterTable('searchProd', 'tProd'));

    const searchSale = document.getElementById('searchSale');
    if (searchSale) searchSale.addEventListener('input', () => filterTable('searchSale', 'tSale'));

    const searchStock = document.getElementById('searchStock');
    if (searchStock) searchStock.addEventListener('input', () => filterTable('searchStock', 'stockTable'));

    const searchActivity = document.getElementById('searchActivity');
    if (searchActivity) searchActivity.addEventListener('input', () => filterTable('searchActivity', 'activityTable'));

    // Export buttons
    const exportRawBtn = document.getElementById('exportRawBtn');
    if (exportRawBtn) exportRawBtn.addEventListener('click', () => exportCSV('raw'));

    const exportProdBtn = document.getElementById('exportProdBtn');
    if (exportProdBtn) exportProdBtn.addEventListener('click', () => exportCSV('prod'));

    const exportSaleBtn = document.getElementById('exportSaleBtn');
    if (exportSaleBtn) exportSaleBtn.addEventListener('click', () => exportCSV('sale'));

    const exportStockBtn = document.getElementById('exportStockBtn');
    if (exportStockBtn) exportStockBtn.addEventListener('click', () => exportCSV('stock'));

    const exportActivityBtn = document.getElementById('exportActivityBtn');
    if (exportActivityBtn) exportActivityBtn.addEventListener('click', () => exportCSV('activity'));

    // Event delegation for dynamically created del and remove buttons
    document.addEventListener('click', (e) => {
        if (e.target.matches('.del-btn')) {
            del(e.target.dataset.type, parseInt(e.target.dataset.id));
        }
        if (e.target.matches('.remove-raw-btn')) {
            removeRawRow(e.target.dataset.row);
        }
    });

    // Attach event listeners
    // RAW FORM
    if (fRaw) {
        fRaw.onsubmit = (e) => {
            e.preventDefault();

            user.raw.push({
                id: Date.now(),
                d: riDate.value,
                n: riName.value,
                q: parseFloat(riQty.value) || 0,
                c: parseFloat(riCost.value) || 0,
                ec: parseFloat(riExtraCost.value) || 0
            });

            fRaw.reset();
            showToast('Raw material saved successfully! ✅');
            sync();
        };
    }

    // SALE FORM
    if (fSale) {
        fSale.onsubmit = (e) => {
            e.preventDefault();

            if (!sName.value) {
                showToast('Please select a product', 'error');
                return;
            }

            const selected = JSON.parse(sName.value);

            user.sale.push({
                id: Date.now(),
                d: sDate.value,
                n: selected.name,
                cat: selected.cat,
                size: selected.size,
                q: parseFloat(sQty.value) || 0,
                a: parseFloat(sAmt.value) || 0
            });

            fSale.reset();
            showToast('Sale recorded successfully! ✅');
            sync();
        };
    }

    // Tab switching
    document.querySelectorAll(".tab-btn").forEach(b => {
        b.onclick = () => {
            document.querySelectorAll(".tab-btn").forEach(t => {
                t.classList.remove("active");
                t.setAttribute('aria-selected', 'false');
            });
            document.querySelectorAll("section").forEach(s => s.classList.remove("active"));
            b.classList.add("active");
            b.setAttribute('aria-selected', 'true');
            const targetSection = document.getElementById(b.dataset.target);
            if (targetSection) targetSection.classList.add("active");

            // Initialize raw materials block when switching to production
            if (b.dataset.target === 'prodSection') {
                const rawMaterialsList = document.getElementById('rawMaterialsList');
                if (rawMaterialsList && rawMaterialsList.innerHTML.trim() === '') {
                    addRawRow();
                }
            }
        }
    });
}

window.onload = () => {
    initDOMReferences();
    const savedToken = localStorage.getItem("btcloud_token");
    const auth = document.getElementById("authSection");

    if (auth) auth.style.display = "block";

    if (savedToken) {
        accessToken = savedToken;
        loadFromCloud().catch((err) => {
            console.error("Failed to load from cloud:", err);
            localStorage.removeItem("btcloud_token");
            if (auth) auth.style.display = "block";
        });
    }
};

function updateSizeOptions() {
    if (!pCategory || !pSize) return;

    const category = pCategory.value;
    pSize.innerHTML = '<option value="">-- Select Size --</option>';

    if (sizeMap[category]) {
        sizeMap[category].forEach(size => {
            const option = document.createElement("option");
            option.value = size;
            option.textContent = size;
            pSize.appendChild(option);
        });
    }
}
// --- GOOGLE DRIVE API OPERATIONS ---

function initiateLogin() {
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (response) => {
                if (response.error) {
                    console.error("Login Error:", response.error);
                    alert("Login failed: " + response.error);
                    return;
                }
                accessToken = response.access_token;
                localStorage.setItem('btcloud_token', accessToken);
                loadFromCloud();
            },
        });
        tokenClient.requestAccessToken();
    } catch (e) {
        console.error("Token client error:", e);
        alert("Google login failed. Please try again.");
    }
}

async function loadFromCloud() {
    showLoading(true);
    try {
        const res = await fetch('https://www.googleapis.com/drive/v3/files?q=name="tracker_data.json"&spaces=appDataFolder&fields=files(id, name)', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!res.ok) throw new Error(`API error: ${res.status}`);

        const list = await res.json();

        if (list.files && list.files.length > 0) {
            fileId = list.files[0].id;
            const content = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (!content.ok) throw new Error(`Failed to fetch file: ${content.status}`);

            const cloudData = await content.json();

            if (cloudData && (cloudData.isSetupDone || cloudData.raw)) {
                user = cloudData;
            }
        } else {
            fileId = null;
        }

        startApp();

    } catch (e) {
        console.error("Cloud Error:", e);
        if (e.toString().includes('401')) {
            localStorage.removeItem('btcloud_token');
            location.reload();
        } else {
            alert("Failed to sync with cloud. Check your internet connection.");
        }
    } finally {
        showLoading(false);
    }
}

async function createCloudFile() {
    try {
        const metadata = {
            name: 'tracker_data.json',
            parents: ['appDataFolder']
        };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(user)], { type: 'application/json' }));

        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: form
        });

        if (!res.ok) throw new Error(`Failed to create file: ${res.status}`);

        const data = await res.json();
        fileId = data.id;
    } catch (e) {
        console.error("Error creating cloud file:", e);
        alert("Failed to create cloud file. Please try again.");
    }
}

async function sync() {
    render();

    if (!accessToken || !fileId || !user.isSetupDone) {
        return;
    }

    try {
        const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: new Blob([JSON.stringify(user)], { type: 'application/json' })
        });

        if (!res.ok) throw new Error(`Sync failed: ${res.status}`);

    } catch (e) {
        console.warn("Sync failed:", e);
    }
}

// --- UI FUNCTIONS ---

function logout() {
    localStorage.removeItem('btcloud_token');
    location.reload();
}

function showLoading(show) {
    const loader = document.getElementById('loading');
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

// Get inventory - helper function with defensive checks
function getInventory() {
    const inv = {};

    try {
        user.raw.forEach(r => {
            if (r && r.n) {
                const k = "RAW_" + r.n.toLowerCase();
                if (!inv[k]) inv[k] = { c: 'Raw', n: r.n, in: 0, out: 0 };
                inv[k].in += parseFloat(r.q) || 0;
            }
        });

        user.prod.forEach(p => {
            if (p && p.n) {
                if (p.rm && Array.isArray(p.rm)) { // New format
                    p.rm.forEach(rawMat => {
                        if (rawMat && rawMat.n) {
                            const rK = "RAW_" + rawMat.n.toLowerCase();
                            if (!inv[rK]) inv[rK] = { c: 'Raw', n: rawMat.n, in: 0, out: 0 };
                            inv[rK].out += parseFloat(rawMat.q) || 0;
                        }
                    });
                } else if (p.rn) { // Old format for backward compatibility
                    const rK = "RAW_" + p.rn.toLowerCase();
                    if (!inv[rK]) inv[rK] = { c: 'Raw', n: p.rn, in: 0, out: 0 };
                    inv[rK].out += parseFloat(p.rq) || 0;
                }
                const category = p.cat || "General";
                const size = p.size || "NA";

                const fK = "FIN_" + p.n.toLowerCase() + "_" + category + "_" + size;

                if (!inv[fK]) {
                    inv[fK] = {
                        c: 'Finished',
                        n: p.n,
                        cat: category,
                        size: size,
                        in: 0,
                        out: 0
                    };
                }

                inv[fK].in += parseFloat(p.q) || 0;
            }
        });

        user.sale.forEach(s => {
            if (s && s.n) {
                const category = s.cat || "General";
                const size = s.size || "NA";

                const fK = "FIN_" + s.n.toLowerCase() + "_" + category + "_" + size;

                if (!inv[fK]) {
                    inv[fK] = {
                        c: 'Finished',
                        n: s.n,
                        cat: category,
                        size: size,
                        in: 0,
                        out: 0
                    };
                }

                inv[fK].out += parseFloat(s.q) || 0;
            }
        });
    } catch (e) {
        console.error("Error calculating inventory:", e);
    }

    return inv;
}

// Add new raw material row for production
function addRawRow() {
    try {
        const rawMaterialsList = document.getElementById('rawMaterialsList');
        if (!rawMaterialsList) return;

        const rowId = 'raw-' + Date.now();
        const inv = getInventory();

        const rawOptions = Object.values(inv)
            .filter(item => item.c === 'Raw')
            .map(item => {
                const stockLeft = (parseFloat(item.in) - parseFloat(item.out)).toFixed(2);
                const isOutOfStock = parseFloat(stockLeft) <= 0;
                const safeName = escapeHtml(item.n);
                return `<option value="${safeName}" ${isOutOfStock ? 'disabled' : ''}>${safeName} (Stock: ${stockLeft})</option>`;
            })
            .join('');

        const htmlContent = `
            <div class="raw-row" id="${escapeHtml(rowId)}">
                <div class="raw-row-container">
                    <div class="raw-field">
                        <label>Raw Material</label>
                        <select class="raw-select" required>
                            <option value="">-- Select --</option>
                            ${rawOptions}
                        </select>
                    </div>
                    <div class="raw-field">
                        <label>Qty Used</label>
                        <input type="number" class="raw-qty" step="0.01" min="0" placeholder="0.00" required>
                    </div>
                    <button type="button" class="btn btn-danger btn-small remove-raw-btn" data-row="${escapeHtml(rowId)}" aria-label="Remove raw material row">Remove</button>
                </div>
            </div>
        `;

        rawMaterialsList.insertAdjacentHTML('beforeend', htmlContent);
    } catch (e) {
        console.error("Error adding raw row:", e);
        showToast('Failed to add raw material row', 'error');
    }
}

// Remove raw material row
function removeRawRow(rowId) {
    try {
        const row = document.getElementById(rowId);
        if (row) row.remove();
    } catch (e) {
        console.error("Error removing raw row:", e);
    }
}

// Save production with multiple raw materials
function saveProd() {
    if (!pDate.value || !pName.value || !pQty.value || !pCategory.value || !pSize.value) {
        showToast('Please fill all production details', 'error');
        return;
    }

    const rawRows = document.querySelectorAll('.raw-row');
    if (rawRows.length === 0) {
        showToast('Please add at least one raw material', 'error');
        return;
    }

    const rawMaterials = [];

    rawRows.forEach(row => {
        const rawSelect = row.querySelector('.raw-select');
        const rawQty = row.querySelector('.raw-qty');

        if (rawSelect.value && rawQty.value) {
            rawMaterials.push({
                n: rawSelect.value,
                q: parseFloat(rawQty.value)
            });
        }
    });

    user.prod.push({
        id: Date.now(),
        d: pDate.value,
        n: pName.value,
        cat: pCategory.value,
        size: pSize.value,
        q: parseFloat(pQty.value),
        rm: rawMaterials,
        ec: parseFloat(pExtraCost.value) || 0
    });

    pDate.value = "";
    pName.value = "";
    pQty.value = "";
    pExtraCost.value = "";
    pCategory.value = "";
    pSize.innerHTML = '<option value="">-- Select Size --</option>';
    document.getElementById("rawMaterialsList").innerHTML = "";

    showToast('Production saved successfully! ✅');
    sync();
}

// Main UI Rendering function
function render() {
    try {
        const dCost = document.getElementById('dCost');
        const dSales = document.getElementById('dSales');
        const dProfit = document.getElementById('dProfit');
        const stockTable = document.getElementById('stockTable');
        const tRaw = document.getElementById('tRaw');
        const tProd = document.getElementById('tProd');
        const tSale = document.getElementById('tSale');

        if (!tRaw || !user) return;

        // 1. Raw materials table with extra cost
        if (tRaw) {
            tRaw.querySelector("tbody").innerHTML = user.raw.map(r => {
                const totalCost = (parseFloat(r.c) || 0) + (parseFloat(r.ec) || 0);
                return `<tr>
                    <td>${escapeHtml(r.d)}</td>
                    <td>${escapeHtml(r.n)}</td>
                    <td>${(parseFloat(r.q) || 0).toFixed(2)}</td>
                    <td>₹${(parseFloat(r.c) || 0).toFixed(2)}</td>
                    <td>₹${(parseFloat(r.ec) || 0).toFixed(2)}</td>
                    <td>₹${totalCost.toFixed(2)}</td>
                    <td><button class="del-btn btn btn-danger btn-small" data-type="raw" data-id="${r.id}" aria-label="Delete raw material entry">Del</button></td>
                </tr>`;
            }).join('');
        }

        // 2. Production table with multiple raw materials
        if (tProd) {
            tProd.querySelector("tbody").innerHTML = user.prod.map(p => {
                let rawUsedText = '';

                if (p.rm && Array.isArray(p.rm)) {
                    rawUsedText = p.rm.map(rm => `${escapeHtml(rm.n)} (${(parseFloat(rm.q) || 0).toFixed(2)})`).join(', ');
                } else if (p.rn) {
                    rawUsedText = `${escapeHtml(p.rn)} (${(parseFloat(p.rq) || 0).toFixed(2)})`;
                }

                const extraCost = parseFloat(p.ec) || 0;
                return `<tr>
                    <td>${escapeHtml(p.d)}</td>
                    <td>${escapeHtml(p.n)}</td>
                    <td>${(parseFloat(p.q) || 0).toFixed(2)}</td>
                    <td>${rawUsedText}</td>
                    <td>₹${extraCost.toFixed(2)}</td>
                    <td><button class="del-btn btn btn-danger btn-small" data-type="prod" data-id="${p.id}" aria-label="Delete production entry">Del</button></td>
                </tr>`;
            }).join('');
        }

        // 3. Sales table
        if (tSale) {
            tSale.querySelector("tbody").innerHTML = user.sale.map(s => `
                <tr>
                    <td>${escapeHtml(s.d)}</td>
                    <td>${escapeHtml(s.n)}</td>
                    <td>${(parseFloat(s.q) || 0).toFixed(2)}</td>
                    <td>₹${(parseFloat(s.a) || 0).toFixed(2)}</td>
                    <td><button class="del-btn btn btn-danger btn-small" data-type="sale" data-id="${s.id}" aria-label="Delete sale entry">Del</button></td>
                </tr>`
            ).join('');
        }

        // 4. DASHBOARD: ALL ACTIVITY ENTRIES
        const allActivities = [
            ...user.raw.map(r => {
                const totalCost = (parseFloat(r.c) || 0) + (parseFloat(r.ec) || 0);
                return { type: 'Raw', d: r.d, n: r.n, q: parseFloat(r.q) || 0, det: `Cost: ₹${totalCost.toFixed(2)}` };
            }),
            ...user.prod.map(p => {
                let rawUsedText = '';
                if (p.rm && Array.isArray(p.rm)) {
                    rawUsedText = p.rm.map(rm => `${rm.n} (${(parseFloat(rm.q) || 0).toFixed(2)})`).join(', ');
                } else if (p.rn) {
                    rawUsedText = `${p.rn} (${(parseFloat(p.rq) || 0).toFixed(2)})`;
                }
                return { type: 'Prod', d: p.d, n: p.n, q: parseFloat(p.q) || 0, det: `Used: ${rawUsedText}` };
            }),
            ...user.sale.map(s => ({ type: 'Sale', d: s.d, n: s.n, q: parseFloat(s.q) || 0, det: `Amt: ₹${(parseFloat(s.a) || 0).toFixed(2)}` }))
        ];

        allActivities.sort((a, b) => {
            try {
                return new Date(b.d) - new Date(a.d);
            } catch (e) {
                return 0;
            }
        });

        const activityTableBody = document.querySelector("#activityTable tbody");
        if (activityTableBody) {
            activityTableBody.innerHTML = allActivities.map(a => `
                <tr>
                    <td><strong>${escapeHtml(a.type)}</strong></td>
                    <td>${escapeHtml(a.d)}</td>
                    <td>${escapeHtml(a.n)}</td>
                    <td>${(parseFloat(a.q) || 0).toFixed(2)}</td>
                    <td>${escapeHtml(a.det)}</td>
                </tr>
            `).join('');
        }

        // 5. INVENTORY LOGIC (Stock Status)
        const inv = getInventory();

        if (stockTable) {
            stockTable.querySelector("tbody").innerHTML = Object.values(inv).map(i => {
                const remains = (parseFloat(i.in) - parseFloat(i.out)).toFixed(2);
                const color = parseFloat(remains) < 0 ? '#dc2626' : '#16a34a';
                return `
                    <tr>
                        <td>${escapeHtml(i.c)}</td>
                        <td>${escapeHtml(i.n)}</td>
                        <td>${(parseFloat(i.in) || 0).toFixed(2)}</td>
                        <td>${(parseFloat(i.out) || 0).toFixed(2)}</td>
                        <td style="font-weight:bold; color:${color}">${remains}</td>
                    </tr>`;
            }).join('');
        }

        updateDropdowns(inv);

        // 6. TOP CARDS (Profit, Sales, Cost)
        const cost = user.raw.reduce((a, b) => a + (parseFloat(b.c) || 0) + (parseFloat(b.ec) || 0), 0);
        const prodExtraCost = user.prod.reduce((a, b) => a + (parseFloat(b.ec) || 0), 0);
        const sale = user.sale.reduce((a, b) => a + (parseFloat(b.a) || 0), 0);

        if (dCost) dCost.textContent = "₹" + cost.toFixed(2);
        if (dSales) dSales.textContent = "₹" + sale.toFixed(2);

        const totalProfit = sale - cost - prodExtraCost;
        if (dProfit) {
            dProfit.textContent = "₹" + totalProfit.toFixed(2);
            dProfit.className = 'card-value ' + (totalProfit >= 0 ? 'profit' : 'loss');
        }
    } catch (e) {
        console.error("Error rendering:", e);
    }
}

// Live Clock
function updateClock() {
    try {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
        const timeStr = now.toLocaleDateString('en-IN', options);
        const timeEl = document.getElementById('liveTime');
        if (timeEl) timeEl.textContent = "🕒 " + timeStr;
    } catch (e) {
        console.error("Clock update error:", e);
    }
}
setInterval(updateClock, 1000);

// Start App Logic
function startApp() {
    try {
        if (!user.isSetupDone) {
            const setupSection = document.getElementById('setupSection');
            if (setupSection) setupSection.style.display = 'block';
            const loginBtn = document.getElementById('loginBtn');
            if (loginBtn) loginBtn.style.display = 'none';
        } else {
            const authSection = document.getElementById('authSection');
            const mainHeader = document.getElementById('mainHeader');
            const mainApp = document.getElementById('mainApp');

            if (authSection) authSection.style.display = 'none';
            if (mainHeader) mainHeader.style.display = 'block';
            if (mainApp) mainApp.style.display = 'block';

            const headerTitle = document.getElementById('headerTitle');
            if (headerTitle) {
                headerTitle.innerHTML = `
                    ${escapeHtml(user.company || 'Company')} <span class="owner-name">| Owner: ${escapeHtml(user.owner || 'Owner')}</span>
                `;
            }
            updateClock();
            render();
        }
    } catch (e) {
        console.error("Error starting app:", e);
        alert("Failed to start app. Please refresh the page.");
    }
}

// Setup data to cloud
async function saveSetup() {
    try {
        const setupCompany = document.getElementById('setupCompany');
        const setupOwner = document.getElementById('setupOwner');

        if (!setupCompany || !setupOwner) {
            alert("Setup form not found. Please refresh the page.");
            return;
        }

        const comp = setupCompany.value.trim();
        const own = setupOwner.value.trim();

        if (!comp || !own) {
            showToast('Please enter both Company and Owner names.', 'error');
            return;
        }

        user.company = comp;
        user.owner = own;
        user.isSetupDone = true;

        showLoading(true);

        if (!fileId) {
            await createCloudFile();
        } else {
            await sync();
        }

        showLoading(false);
        startApp();
    } catch (e) {
        console.error("Setup error:", e);
        alert("Failed to save setup. Please try again.");
        showLoading(false);
    }
}
function updateDropdowns(inventory) {
    const saleSelect = document.getElementById('sName');
    if (!saleSelect) return;

    saleSelect.innerHTML = '<option value="">-- Select Finished Product --</option>';

    Object.values(inventory).forEach(item => {
        if (item.c === 'Finished') {

            const stockLeft = (item.in - item.out).toFixed(2);

            const option = document.createElement('option');
            option.value = JSON.stringify({
                name: item.n,
                cat: item.cat,
                size: item.size
            });

            option.textContent =
                `${item.n} | ${item.cat} | Size: ${item.size} (Stock: ${stockLeft})`;

            if (stockLeft <= 0) option.disabled = true;

            saleSelect.appendChild(option);
        }
    });
}

function del(type, id) {
    if (!confirm("Are you sure you want to delete this entry?")) return;

    if (type === 'raw') {
        user.raw = user.raw.filter(item => item.id !== id);
    }

    if (type === 'prod') {
        user.prod = user.prod.filter(item => item.id !== id);
    }

    if (type === 'sale') {
        user.sale = user.sale.filter(item => item.id !== id);
    }

    showToast('Entry deleted', 'warning');
    sync(); // re-render + cloud update
}

