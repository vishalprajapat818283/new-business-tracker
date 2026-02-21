// --- CONFIGURATION ---
const CLIENT_ID = '330273087572-bb5h0ob2ahu56h93sac7hvf07je6uha7.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

let tokenClient;
let accessToken = null;
let fileId = null;

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
    
    fSale = document.getElementById('fSale');
    sDate = document.getElementById('sDate');
    sName = document.getElementById('sName');
    sQty = document.getElementById('sQty');
    sAmt = document.getElementById('sAmt');
    
    // Attach event listeners
    if (fRaw) {
        fRaw.onsubmit = (e) => {
            e.preventDefault();
            const extraCost = parseFloat(riExtraCost.value) || 0;
            user.raw.push({ 
                id: Date.now(), 
                d: riDate.value, 
                n: riName.value, 
                q: parseFloat(riQty.value) || 0, 
                c: parseFloat(riCost.value) || 0,
                ec: extraCost
            });
            fRaw.reset();
            sync();
        };
    }

    if (fSale) {
        fSale.onsubmit = (e) => {
            e.preventDefault();
            user.sale.push({ 
                id: Date.now(), 
                d: sDate.value, 
                n: sName.value, 
                q: parseFloat(sQty.value) || 0, 
                a: parseFloat(sAmt.value) || 0 
            });
            fSale.reset();
            if (sName) sName.selectedIndex = 0;
            sync();
        };
    }

    // Tab switching
    document.querySelectorAll(".tab-btn").forEach(b => {
        b.onclick = () => {
            document.querySelectorAll(".tab-btn, section").forEach(e => e.classList.remove("active"));
            b.classList.add("active");
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
                console.log("Data recovered from Cloud.");
            }
        } else {
            console.log("New user: No existing file found.");
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
        console.log("Cloud file created successfully.");
    } catch (e) {
        console.error("Error creating cloud file:", e);
        alert("Failed to create cloud file. Please try again.");
    }
}

async function sync() {
    render();
    
    if (!accessToken || !fileId || !user.isSetupDone) {
        console.log("Sync skipped: Data not fully loaded or setup incomplete.");
        return;
    }

    try {
        const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: new Blob([JSON.stringify(user)], { type: 'application/json' })
        });
        
        if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
        
        console.log("Cloud Synced Successfully.");
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
                const fK = "FIN_" + p.n.toLowerCase(); 
                if (!inv[fK]) inv[fK] = { c: 'Finished', n: p.n, in: 0, out: 0 }; 
                inv[fK].in += parseFloat(p.q) || 0;
            }
        });
        
        user.sale.forEach(s => { 
            if (s && s.n) {
                const fK = "FIN_" + s.n.toLowerCase(); 
                if (!inv[fK]) inv[fK] = { c: 'Finished', n: s.n, in: 0, out: 0 }; 
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
                return `<option value="${item.n}" ${isOutOfStock ? 'disabled' : ''}>${item.n} (Stock: ${stockLeft})</option>`;
            })
            .join('');

        const htmlContent = `
            <div class="raw-row" id="${rowId}">
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
                    <button type="button" class="btn btn-danger btn-small" onclick="removeRawRow('${rowId}')">Remove</button>
                </div>
            </div>
        `;
        
        rawMaterialsList.insertAdjacentHTML('beforeend', htmlContent);
    } catch (e) {
        console.error("Error adding raw row:", e);
        alert("Failed to add raw material row");
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
    try {
        if (!pDate || !pName || !pQty) {
            alert("Form elements not loaded. Please refresh the page.");
            return;
        }

        if (!pDate.value || !pName.value || !pQty.value) {
            alert("Please fill in Date, Product Name, and Qty Produced");
            return;
        }

        const rawRows = document.querySelectorAll('.raw-row');
        if (rawRows.length === 0) {
            alert("Please add at least one raw material");
            return;
        }

        const rawMaterials = [];
        let isValid = true;

        rawRows.forEach(row => {
            const rawSelect = row.querySelector('.raw-select');
            const rawQty = row.querySelector('.raw-qty');

            if (!rawSelect.value || !rawQty.value) {
                isValid = false;
                return;
            }

            rawMaterials.push({
                n: rawSelect.value,
                q: parseFloat(rawQty.value)
            });
        });

        if (!isValid) {
            alert("Please fill in all raw material fields");
            return;
        }

        const extraCost = parseFloat(pExtraCost.value) || 0;

        user.prod.push({
            id: Date.now(),
            d: pDate.value,
            n: pName.value,
            q: parseFloat(pQty.value),
            rm: rawMaterials,
            ec: extraCost
        });

        // Reset form
        pDate.value = '';
        pName.value = '';
        pQty.value = '';
        pExtraCost.value = '';
        const rawMaterialsList = document.getElementById('rawMaterialsList');
        if (rawMaterialsList) rawMaterialsList.innerHTML = '';

        sync();
    } catch (e) {
        console.error("Error saving production:", e);
        alert("Failed to save production. Please try again.");
    }
}

function del(type, id) {
    try {
        user[type] = user[type].filter(i => i.id !== id);
        sync();
    } catch (e) {
        console.error("Error deleting entry:", e);
        alert("Failed to delete entry");
    }
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
                    <td>${r.d || ''}</td>
                    <td>${r.n || ''}</td>
                    <td>${(parseFloat(r.q) || 0).toFixed(2)}</td>
                    <td>₹${(parseFloat(r.c) || 0).toFixed(2)}</td>
                    <td>₹${(parseFloat(r.ec) || 0).toFixed(2)}</td>
                    <td>₹${totalCost.toFixed(2)}</td>
                    <td><button onclick="del('raw',${r.id})">Del</button></td>
                </tr>`;
            }).join('');
        }

        // 2. Production table with multiple raw materials
        if (tProd) {
            tProd.querySelector("tbody").innerHTML = user.prod.map(p => {
                let rawUsedText = '';
                
                if (p.rm && Array.isArray(p.rm)) {
                    rawUsedText = p.rm.map(rm => `${rm.n} (${(parseFloat(rm.q) || 0).toFixed(2)})`).join(', ');
                } else if (p.rn) {
                    rawUsedText = `${p.rn} (${(parseFloat(p.rq) || 0).toFixed(2)})`;
                }
                
                const extraCost = parseFloat(p.ec) || 0;
                return `<tr>
                    <td>${p.d || ''}</td>
                    <td>${p.n || ''}</td>
                    <td>${(parseFloat(p.q) || 0).toFixed(2)}</td>
                    <td>${rawUsedText}</td>
                    <td>₹${extraCost.toFixed(2)}</td>
                    <td><button onclick="del('prod',${p.id})">Del</button></td>
                </tr>`;
            }).join('');
        }

        // 3. Sales table
        if (tSale) {
            tSale.querySelector("tbody").innerHTML = user.sale.map(s => `
                <tr>
                    <td>${s.d || ''}</td>
                    <td>${s.n || ''}</td>
                    <td>${(parseFloat(s.q) || 0).toFixed(2)}</td>
                    <td>₹${(parseFloat(s.a) || 0).toFixed(2)}</td>
                    <td><button onclick="del('sale',${s.id})">Del</button></td>
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
                    <td><strong>${a.type}</strong></td>
                    <td>${a.d || ''}</td>
                    <td>${a.n || ''}</td>
                    <td>${(parseFloat(a.q) || 0).toFixed(2)}</td>
                    <td>${a.det}</td>
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
                        <td>${i.c}</td>
                        <td>${i.n}</td>
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
            const loginBtn = document.querySelector('button[onclick="initiateLogin()"]');
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
                    ${user.company || 'Company'} <span class="owner-name">| Owner: ${user.owner || 'Owner'}</span>
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
            alert("Please enter both Company and Owner names.");
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
    try {
        const saleSelect = document.getElementById('sName');
        if (!saleSelect) return;

        saleSelect.innerHTML = '<option value="">-- Select Finished Product --</option>';

        Object.values(inventory).forEach(item => {
            if (!item || !item.n) return;

            if (item.c === 'Finished') {
                const stockLeft = (parseFloat(item.in) - parseFloat(item.out)).toFixed(2);

                const option = document.createElement('option');
                option.value = item.n;
                option.textContent = `${item.n} (Stock: ${stockLeft})`;

                if (parseFloat(stockLeft) <= 0) {
                    option.disabled = true;
                    option.textContent += " - OUT OF STOCK";
                }

                saleSelect.appendChild(option);
            }
        });
    } catch (e) {
        console.error("Error updating dropdowns:", e);
    }
}
