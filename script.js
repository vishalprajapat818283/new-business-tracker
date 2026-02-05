// --- CONFIGURATION ---
// 1. Paste your Client ID from Google Cloud Console here
const CLIENT_ID = '330273087572-bb5h0ob2ahu56h93sac7hvf07je6uha7.apps.googleusercontent.com'; 
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

let tokenClient;
let accessToken = null;
let fileId = null;
let user = { raw: [], prod: [], sale: [], company: "Business Tracker" };

// --- 1. INITIALIZATION & LOGIN ---

// This runs as soon as the page loads
window.onload = () => {
    const savedToken = localStorage.getItem('bt_cloud_token');
    if (savedToken) {
        accessToken = savedToken;
        loadFromCloud(); // Try to auto-login
    }
};

function initiateLogin() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response) => {
            if (response.error) {
                console.error("Login Error:", response.error);
                return;
            }
            accessToken = response.access_token;
            localStorage.setItem('bt_cloud_token', accessToken); 
            loadFromCloud();
        },
    });
    tokenClient.requestAccessToken();
}

// --- 2. GOOGLE DRIVE API OPERATIONS ---

async function loadFromCloud() {
    showLoading(true);
    try {
        // Search for the data file in the hidden 'appDataFolder'
        const res = await fetch('https://www.googleapis.com/drive/v3/files?q=name="tracker_data.json"&spaces=appDataFolder', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const list = await res.json();
        
        if (list.files && list.files.length > 0) {
            fileId = list.files[0].id;
            // Download file content
            const content = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            user = await content.json();
            console.log("Data loaded from Cloud.");
        } else {
            // First time user: Create the file in the cloud
            console.log("No file found. Creating new cloud database...");
            await createCloudFile();
        }
        startApp();
    } catch (e) {
        console.error("Cloud Error:", e);
        // If token expired, clear it and show login
        localStorage.removeItem('bt_cloud_token');
        document.getElementById('authSection').style.display = 'block';
    } finally {
        showLoading(false);
    }
}

async function createCloudFile() {
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
    const data = await res.json();
    fileId = data.id;
}

// Global Sync function - pushes current 'user' object to Drive
async function sync() {
    render(); // Update visual UI immediately
    if (!accessToken || !fileId) return;

    try {
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: new Blob([JSON.stringify(user)], { type: 'application/json' })
        });
        console.log("Cloud Synced Successfully.");
    } catch (e) {
        console.warn("Sync failed. Will retry on next entry.");
    }
}

// --- 3. UI & FORM LOGIC ---

function startApp() {
    document.getElementById('authSection').style.display='none';
    document.getElementById('mainHeader').style.display='block';
    document.getElementById('mainApp').style.display='block';
    render();
}

function logout() {
    localStorage.removeItem('bt_cloud_token');
    location.reload();
}

function showLoading(show) {
    const loader = document.getElementById('loading');
    if(loader) loader.style.display = show ? 'flex' : 'none';
}

// Form Submission Handlers
fRaw.onsubmit = (e) => { 
    e.preventDefault(); 
    user.raw.push({id:Date.now(), d:riDate.value, n:riName.value, q:+riQty.value, c:+riCost.value}); 
    e.target.reset(); 
    sync(); 
};

fProd.onsubmit = (e) => { 
    e.preventDefault(); 
    user.prod.push({id:Date.now(), d:pDate.value, n:pName.value, q:+pQty.value, rn:pRawName.value, rq:+pRawQty.value}); 
    e.target.reset(); 
    sync(); 
};

fSale.onsubmit = (e) => { 
    e.preventDefault(); 
    user.sale.push({id:Date.now(), d:sDate.value, n:sName.value, q:+sQty.value, a:+sAmt.value}); 
    e.target.reset(); 
    sync(); 
};

function del(type, id) { 
    user[type] = user[type].filter(i => i.id !== id); 
    sync(); 
}

// Tab Switching logic
document.querySelectorAll(".tab-btn").forEach(b => {
    b.onclick = () => {
        document.querySelectorAll(".tab-btn, section").forEach(e => e.classList.remove("active"));
        b.classList.add("active"); 
        document.getElementById(b.dataset.target).classList.add("active");
    }
});

// Main UI Rendering function
function render() {
    tRaw.querySelector("tbody").innerHTML = user.raw.map(r => `<tr><td>${r.d}</td><td>${r.n}</td><td>${r.q}</td><td>₹${r.c}</td><td><button onclick="del('raw',${r.id})">Del</button></td></tr>`).join('');
    tProd.querySelector("tbody").innerHTML = user.prod.map(p => `<tr><td>${p.d}</td><td>${p.n}</td><td>${p.q}</td><td>${p.rn}</td><td>${p.rq}</td><td><button onclick="del('prod',${p.id})">Del</button></td></tr>`).join('');
    tSale.querySelector("tbody").innerHTML = user.sale.map(s => `<tr><td>${s.d}</td><td>${s.n}</td><td>${s.q}</td><td>₹${s.a}</td><td><button onclick="del('sale',${s.id})">Del</button></td></tr>`).join('');

    const inv = {};
    user.raw.forEach(r => { const k = "RAW_"+r.n.toLowerCase(); if(!inv[k]) inv[k]={c:'Raw', n:r.n, in:0, out:0}; inv[k].in += r.q; });
    user.prod.forEach(p => {
        const rK = "RAW_"+p.rn.toLowerCase(); if(!inv[rK]) inv[rK]={c:'Raw', n:p.rn, in:0, out:0}; inv[rK].out += p.rq;
        const fK = "FIN_"+p.n.toLowerCase(); if(!inv[fK]) inv[fK]={c:'Finished', n:p.n, in:0, out:0}; inv[fK].in += p.q;
    });
    user.sale.forEach(s => { const fK = "FIN_"+s.n.toLowerCase(); if(!inv[fK]) inv[fK]={c:'Finished', n:s.n, in:0, out:0}; inv[fK].out += s.q; });

    stockTable.querySelector("tbody").innerHTML = Object.values(inv).map(i => `<tr><td>${i.c}</td><td>${i.n}</td><td>${i.in}</td><td>${i.out}</td><td style="font-weight:bold; color:${(i.in-i.out)<0?'red':'green'}">${(i.in-i.out).toFixed(2)}</td></tr>`).join('');

    const cost = user.raw.reduce((a,b)=>a+b.c,0);
    const sale = user.sale.reduce((a,b)=>a+b.a,0);
    dCost.textContent = "₹"+cost; dSales.textContent = "₹"+sale; dProfit.textContent = "₹"+(sale-cost);
    dProfit.className = 'card-value ' + (sale-cost >= 0 ? 'profit' : 'loss');
}