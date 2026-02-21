// --- CONFIGURATION ---
// 1. Paste your Client ID from Google Cloud Console here
const CLIENT_ID = '330273087572-bb5h0ob2ahu56h93sac7hvf07je6uha7.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

window.onload = () => {
    const savedToken = localStorage.getItem('btcloudtoken');
    const auth = document.getElementById('authSection');
    if (auth) auth.style.display = 'block';

    if (savedToken) {
        accessToken = savedToken;
        loadFromCloud().catch(() => {
            // If cloud load fails, keep login visible instead of blank screen
            localStorage.removeItem('btcloudtoken');
            if (auth) auth.style.display = 'block';
        });
    }
};

let tokenClient;
let accessToken = null;
let fileId = null;

// Global data - being on top
let user = { raw: [], prod: [], sale: [], company: '', owner: '', isSetupDone: false };

// --- 1. INITIALIZATION + LOGIN ---
function initiateLogin() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response) => {
            if (response.error) {
                console.error('Login Error', response.error);
                return;
            }
            accessToken = response.access_token;
            localStorage.setItem('btcloudtoken', accessToken);
            loadFromCloud();
        },
    });
    tokenClient.requestAccessToken();
}

// --- 2. GOOGLE DRIVE API OPERATIONS ---
async function loadFromCloud() {
    showLoading(true);
    try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='trackerdata.json'%20in%20spaces%20appDataFolder&fields=files(id,name)`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const list = await res.json();
        if (list.files && list.files.length > 0) {
            fileId = list.files[0].id;
            const content = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const cloudData = await content.json();

            // Check if cloud data is valid before applying it
            if (cloudData && cloudData.isSetupDone) {
                user = cloudData;
                console.log('Data recovered from Cloud.');
            } else {
                console.log('New user - No existing file found.');
                fileId = null; // Ensure fileId is null so saveSetup knows to create a new one
            }
        }
        // Only start the app AFTER we are sure about the cloud data
        startApp();
    } catch (e) {
        console.error('Cloud Error', e);
        // If 401 expired session, clear and login again
        if (e.status === 401) {
            localStorage.removeItem('btcloudtoken');
            location.reload();
        }
    } finally {
    showLoading(false);  // Force hide after 10s max
    setTimeout(startApp, 10000);  // Emergency dashboard
}

}

async function createCloudFile() {
    const metadata = {
        name: 'trackerdata.json',
        parents: ['appDataFolder']
    };
    const form = new FormData();
    form.append('metadata', new Blob(JSON.stringify(metadata), { type: 'application/json' }));
    form.append('file', new Blob(JSON.stringify(user), { type: 'application/json' }));

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form
    });
    const data = await res.json();
    fileId = data.id;
}

// Global Sync function - pushes current user object to Drive
async function sync() {
    // Skip cloud if not ready - JUST RENDER INSTANTLY
    render();  // This was missing!
    
    if (!accessToken || !fileId || !user.isSetupDone) {
        console.log('Cloud sync skipped - UI updated');
        return;
    }
    
    // Background cloud (non-blocking)
    setTimeout(async () => {
        try {
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${accessToken}` },
                body: new Blob([JSON.stringify(user)], { type: 'application/json' })
            });
            console.log('✅ Cloud saved');
        } catch(e) {
            console.log('Cloud failed - data safe locally');
        }
    }, 200);
}


// --- 3. UI FORM LOGIC ---
function logout() {
    localStorage.removeItem('btcloudtoken');
    location.reload();
}

function showLoading(show) {
    const loader = document.getElementById('loading');
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

// Form Submission Handlers
document.getElementById('fRaw').onsubmit = (e) => {
    e.preventDefault();
    user.raw.push({
        id: Date.now(),
        d: document.getElementById('riDate').value,
        n: document.getElementById('riName').value,
        q: parseFloat(document.getElementById('riQty').value),
        c: parseFloat(document.getElementById('riCost').value),
        ec: parseFloat(document.getElementById('riExtraCost').value) || 0  // New extra cost
    });
    e.target.reset();
    sync();
};

document.getElementById('fProd').onsubmit = (e) => {
    e.preventDefault();
    // Main raw
    const mainRaw = {
        rn: document.getElementById('pRawName').value,
        rq: parseFloat(document.getElementById('pRawQty').value)
    };
    // Additional raws
    const extraRaws = [];
    document.querySelectorAll('.extra-raw-row').forEach(row => {
        const sel = row.querySelector('.extra-raw-select');
        const qty = row.querySelector('.extra-raw-qty');
        if (sel.value && qty.value) {
            extraRaws.push({
                rn: sel.value,
                rq: parseFloat(qty.value)
            });
        }
    });
    user.prod.push({
        id: Date.now(),
        d: document.getElementById('pDate').value,
        n: document.getElementById('pName').value,
        q: parseFloat(document.getElementById('pQty').value),
        mainRaw,  // Main raw object
        extraRaws,  // Array of extra raws
        ec: parseFloat(document.getElementById('pExtraCost').value) || 0  // New extra cost
    });
    e.target.reset();
    // Reset dropdowns and extra rows
    document.getElementById('pRawName').selectedIndex = 0;
    document.querySelectorAll('.extra-raw-row').forEach((row, i) => {
        if (i === 0) row.remove();
    });
    document.getElementById('pExtraCost').value = '';
    sync();
};

document.getElementById('fSale').onsubmit = (e) => {
    e.preventDefault();
    // 1. Add the sale data to our user object
    user.sale.push({
        id: Date.now(),
        d: document.getElementById('sDate').value,
        n: document.getElementById('sName').value,
        q: parseFloat(document.getElementById('sQty').value),
        a: parseFloat(document.getElementById('sAmt').value)
    });
    // 2. Clear the text inputs
    e.target.reset();
    // 3. Reset the dropdown list back to "-- Select Finished Product --"
    document.getElementById('sName').selectedIndex = 0;
    // 4. Save to cloud and refresh UI
    sync();
};

function del(type, id) {
    user[type] = user[type].filter(i => i.id !== id);
    sync();
}

// Tab Switching logic
document.querySelectorAll('.tab-btn').forEach(b => {
    b.onclick = () => {
        document.querySelectorAll('.tab-btn, section').forEach(e => e.classList.remove('active'));
        b.classList.add('active');
        document.getElementById(b.dataset.target).classList.add('active');
    };
});

// Main UI Rendering function
// Inhe render function ke bahar, uske theek upar likhein:
const dCost = document.getElementById('dCost');
const dSales = document.getElementById('dSales');
const dProfit = document.getElementById('dProfit');
const stockTable = document.getElementById('stockTable');

function render() {
    const fRaw = document.getElementById('fRaw');
    const fProd = document.getElementById('fProd');
    const fSale = document.getElementById('fSale');
    const tRaw = document.getElementById('tRaw');
    const tProd = document.getElementById('tProd');
    const tSale = document.getElementById('tSale');

    if (!tRaw || !user) return; // Safety check

    // 1. Raw, Production, aur Sales tables ko update karein
    tRaw.querySelector('tbody').innerHTML = user.raw.map(r =>
        `<tr>
            <td>${r.d}</td>
            <td>${r.n}</td>
            <td>${r.q}</td>
            <td>${r.c}</td>
            <td>${r.ec.toFixed(2)}</td>
            <td><button onclick="del('raw',${r.id})">Del</button></td>
        </tr>`
    ).join('');

    tProd.querySelector('tbody').innerHTML = user.prod.map(p =>
        `<tr>
            <td>${p.d}</td>
            <td>${p.n}</td>
            <td>${p.q}</td>
            <td>${p.mainRaw.rn} (${p.mainRaw.rq})</td>
            <td>${p.extraRaws.map(er => er.rn + ' (' + er.rq + ')').join(', ') || '-'}</td>
            <td>${p.ec.toFixed(2)}</td>
            <td><button onclick="del('prod',${p.id})">Del</button></td>
        </tr>`
    ).join('');

    tSale.querySelector('tbody').innerHTML = user.sale.map(s =>
        `<tr>
            <td>${s.d}</td>
            <td>${s.n}</td>
            <td>${s.q}</td>
            <td>${s.a}</td>
            <td><button onclick="del('sale',${s.id})">Del</button></td>
        </tr>`
    ).join('');

    // 2. DASHBOARD ALL ACTIVITY ENTRIES - Combining all arrays
    const allActivities = [
        ...user.raw.map(r => ({ type: 'Raw', d: r.d, n: r.n, q: r.q, det: `Cost ${r.c} + Extra ${r.ec}` })),
        ...user.prod.map(p => ({ type: 'Prod', d: p.d, n: p.n, q: p.q, det: `Used ${p.mainRaw.rn} ${p.mainRaw.rq} + Extra Cost ${p.ec}` })),
        ...user.sale.map(s => ({ type: 'Sale', d: s.d, n: s.n, q: s.q, det: `Amt ${s.a}` }))
    ];
    // Newest entries top par dikhane ke liye sort karein
    allActivities.sort((a, b) => new Date(b.d) - new Date(a.d));
    const activityTableBody = document.querySelector('#activityTable tbody');
    if (activityTableBody) {
        activityTableBody.innerHTML = allActivities.map(a =>
            `<tr>
                <td><strong>${a.type}</strong></td>
                <td>${a.d}</td>
                <td>${a.n}</td>
                <td>${a.q}</td>
                <td>${a.det}</td>
            </tr>`
        ).join('');
    }

    // 3. INVENTORY LOGIC - Stock Status
    const inv = {};
    user.raw.forEach(r => {
        const k = `RAW_${r.n.toLowerCase()}`;
        if (!inv[k]) inv[k] = { c: 'Raw', n: r.n, in: 0, out: 0 };
        inv[k].in += r.q;
    });
    user.prod.forEach(p => {
        // Main raw out
        const rK = `RAW_${p.mainRaw.rn.toLowerCase()}`;
        if (!inv[rK]) inv[rK] = { c: 'Raw', n: p.mainRaw.rn, in: 0, out: 0 };
        inv[rK].out += p.mainRaw.rq;
        // Extra raws out
        p.extraRaws.forEach(er => {
            const erK = `RAW_${er.rn.toLowerCase()}`;
            if (!inv[erK]) inv[erK] = { c: 'Raw', n: er.rn, in: 0, out: 0 };
            inv[erK].out += er.rq;
        });
        // Finished product in
        const fK = `FIN_${p.n.toLowerCase()}`;
        if (!inv[fK]) inv[fK] = { c: 'Finished', n: p.n, in: 0, out: 0 };
        inv[fK].in += p.q;
    });
    user.sale.forEach(s => {
        const fK = `FIN_${s.n.toLowerCase()}`;
        if (!inv[fK]) inv[fK] = { c: 'Finished', n: s.n, in: 0, out: 0 };
        inv[fK].out += s.q;
    });

    stockTable.querySelector('tbody').innerHTML = Object.values(inv).map(i =>
        `<tr>
            <td>${i.c}</td>
            <td>${i.n}</td>
            <td>${i.in.toFixed(2)}</td>
            <td>${i.out.toFixed(2)}</td>
            <td style="font-weight:bold; color:${(i.in - i.out) <= 0 ? 'red' : 'green'}">${(i.in - i.out).toFixed(2)}</td>
        </tr>`
    ).join('');

    // Add this inside the render function near the end:
    updateDropdowns(inv);

    // 4. TOP CARDS - Profit, Sales, Cost (UPDATED TO INCLUDE EXTRA COSTS)
    const rawCost = user.raw.reduce((a, b) => a + b.c + b.ec, 0);  // Raw costs + extra
    const prodExtraCost = user.prod.reduce((a, b) => a + b.ec, 0);  // Production extra costs
    const totalCost = rawCost + prodExtraCost;
    const saleTotal = user.sale.reduce((a, b) => a + b.a, 0);

    dCost.textContent = `$${totalCost.toFixed(2)}`;
    dSales.textContent = `$${saleTotal.toFixed(2)}`;
    dProfit.textContent = `$${(saleTotal - totalCost).toFixed(2)}`;
    dProfit.className = `card-value ${saleTotal - totalCost >= 0 ? 'profit' : 'loss'}`;
}

// Live Clock ko update karne ka function
function updateClock() {
    const now = new Date();
    const options = {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    };
    const timeStr = now.toLocaleDateString('en-IN', options);
    const timeEl = document.getElementById('liveTime');
    if (timeEl) timeEl.textContent = timeStr;
}
setInterval(updateClock, 1000);

// Har 1 second mein chalega

// Final Start App Logic - Ise purane startApp se replace karein
function startApp() {
    if (!user.isSetupDone) {
        // Agar pehli baar hai, toh setup dikhayein
        document.getElementById('setupSection').style.display = 'block';
        // Login button hide kar dein kyunki login ho chuka hai
        document.querySelector('button[onclick="initiateLogin()"]').style.display = 'none';
    } else {
        // Agar setup ho chuka hai, toh dashboard dikhayein
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('mainHeader').style.display = 'block';
        document.getElementById('mainApp').style.display = 'block';
        // Header mein Company aur Owner ka naam set karein...
        document.getElementById('headerTitle').innerHTML = `${user.company} <span class="owner-name">Owner: ${user.owner}</span>`;
        updateClock();
        render();
    }
}

// Setup data ko cloud par save karne ke liye
async function saveSetup() {
    const comp = document.getElementById('setupCompany').value;
    const own = document.getElementById('setupOwner').value;
    if (!comp || !own) {
        alert('Please enter both Company and Owner names.');
        return;
    }
    
    // INSTANT LOCAL SETUP (no cloud wait)
    user.company = comp;
    user.owner = own;
    user.isSetupDone = true;
    
    showLoading(false);  // Hide spinner immediately
    startApp();  // Show dashboard NOW
    
    // Background cloud setup (optional)
    setTimeout(async () => {
        try {
            if (!fileId) await createCloudFile();
            else await sync();
            console.log('✅ Cloud setup complete');
        } catch(e) {
            console.log('Cloud setup failed - using local storage');
            localStorage.setItem('bt_local', JSON.stringify(user));  // Fallback
        }
    }, 500);
}


function updateDropdowns(inventory) {
    const rawSelect = document.getElementById('pRawName');
    const saleSelect = document.getElementById('sName');
    // Clear existing options except the first one
    rawSelect.innerHTML = '<option value="">-- Select Raw Material --</option>';
    saleSelect.innerHTML = '<option value="">-- Select Finished Product --</option>';

    Object.values(inventory).forEach(item => {
        const stockLeft = (item.in - item.out).toFixed(2);
        const option = document.createElement('option');
        option.value = item.n;
        option.textContent = `${item.n} [Stock: ${stockLeft}]`;
        // If stock is 0 or less, disable it and turn it red
        if (parseFloat(stockLeft) <= 0) {
            option.disabled = true;
            option.style.color = 'red';
            option.textContent += ' - OUT OF STOCK';
        }
        if (item.c === 'Raw') {
            rawSelect.appendChild(option);
        } else {
            saleSelect.appendChild(option);
        }
        // Also populate extra raw selects
        document.querySelectorAll('.extra-raw-select').forEach(sel => {
            if (sel.children.length <= 1) {  // Only if not populated
                const extraOpt = option.cloneNode(true);
                sel.appendChild(extraOpt);
            }
        });
    });
}

// New functions for extra raw rows
let extraRowCounter = 0;
function addExtraRawRow() {
    const container = document.getElementById('additionalRaws');
    const row = document.createElement('div');
    row.className = 'extra-raw-row';
    row.id = `extra-row-${++extraRowCounter}`;
    row.innerHTML = `
        <select class="extra-raw-select">
            <option value="">-- Select Raw --</option>
        </select>
        <input type="number" class="extra-raw-qty" step="0.01" placeholder="Qty">
        <button type="button" class="btn btn-danger" onclick="removeExtraRaw(this)">Remove</button>
    `;
    container.appendChild(row);
    // Repopulate dropdown after adding
    setTimeout(() => updateDropdowns({}), 0);
}

function removeExtraRaw(btn) {
    btn.closest('.extra-raw-row').remove();
}
