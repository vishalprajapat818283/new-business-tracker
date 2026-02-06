// --- CONFIGURATION ---
// 1. Paste your Client ID from Google Cloud Console here
const CLIENT_ID = '330273087572-bb5h0ob2ahu56h93sac7hvf07je6uha7.apps.googleusercontent.com'; 
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

let tokenClient;
let accessToken = null;
let fileId = null;

// 1. Top par user object badlein
let user = { 
    raw: [], 
    prod: [], 
    sale: [], 
    company: "", 
    owner: "", 
    isSetupDone: false 
};

// --- 1. INITIALIZATION & LOGIN ---

// This runs as soon as the page loads
window.onload = () => {
    // UI initially hide rakhein
    document.getElementById('mainHeader').style.display = 'none';
    document.getElementById('mainApp').style.display = 'none';
    
    const savedToken = localStorage.getItem('bt_cloud_token');
    if (savedToken) {
        accessToken = savedToken;
        loadFromCloud(); 
    } else {
        document.getElementById('authSection').style.display = 'block';
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
        const res = await fetch('https://www.googleapis.com/drive/v3/files?q=name="tracker_data.json"&spaces=appDataFolder', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const list = await res.json();
        
        if (list.files && list.files.length > 0) {
            fileId = list.files[0].id;
            const content = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            
            const cloudData = await content.json();
            
            // SECURITY CHECK: Sirf tabhi load karein agar cloud data valid ho
            if (cloudData && cloudData.isSetupDone) {
                user = cloudData;
                console.log("Success: Data loaded from Cloud.");
            } else {
                console.log("File exists but setup not finished.");
            }
        } else {
            // Nayi file sirf tab banayein jab Drive par kuch na mile
            console.log("New user detected.");
            await createCloudFile();
        }
        
        startApp(); // Ye hamesha end mein chalna chahiye
        
    } catch (e) {
        console.error("Cloud Error:", e);
        // Agar token purana hai toh logout karke fresh login karwayein
        localStorage.removeItem('bt_cloud_token');
        location.reload(); 
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
    // Agar setup nahi hua, ya data galti se khali hai, toh sync STOP karein
    if (!user.isSetupDone || !accessToken || !fileId) return;

    // Safety: Agar cloud data load nahi hua aur humne sync daba diya, toh wo purana data uda dega.
    // Isliye ye check zaroori hai:
    if (user.company === "" && user.raw.length === 0) {
        console.warn("Safety trigger: Blocking sync of empty data.");
        return;
    }

    render(); 

    try {
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: new Blob([JSON.stringify(user)], { type: 'application/json' })
        });
        console.log("Cloud Updated.");
    } catch (e) {
        console.error("Sync Error:", e);
    }
}

// --- 3. UI & FORM LOGIC ---



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


function render() {
    const dCost = document.getElementById('dCost');
const dSales = document.getElementById('dSales');
const dProfit = document.getElementById('dProfit');
const stockTable = document.getElementById('stockTable');
 const fRaw = document.getElementById('fRaw');
const fProd = document.getElementById('fProd');
const fSale = document.getElementById('fSale');
const tRaw = document.getElementById('tRaw');
const tProd = document.getElementById('tProd');
const tSale = document.getElementById('tSale');
    // 1. Raw, Production, aur Sales tables ko update karein
    tRaw.querySelector("tbody").innerHTML = user.raw.map(r => `<tr><td>${r.d}</td><td>${r.n}</td><td>${r.q}</td><td>₹${r.c}</td><td><button onclick="del('raw',${r.id})">Del</button></td></tr>`).join('');
    tProd.querySelector("tbody").innerHTML = user.prod.map(p => `<tr><td>${p.d}</td><td>${p.n}</td><td>${p.q}</td><td>${p.rn}</td><td>${p.rq}</td><td><button onclick="del('prod',${p.id})">Del</button></td></tr>`).join('');
    tSale.querySelector("tbody").innerHTML = user.sale.map(s => `<tr><td>${s.d}</td><td>${s.n}</td><td>${s.q}</td><td>₹${s.a}</td><td><button onclick="del('sale',${s.id})">Del</button></td></tr>`).join('');

    // 2. DASHBOARD: ALL ACTIVITY ENTRIES (Combining all arrays)
    const allActivities = [
        ...user.raw.map(r => ({ type: 'Raw', d: r.d, n: r.n, q: r.q, det: `Cost: ₹${r.c}` })),
        ...user.prod.map(p => ({ type: 'Prod', d: p.d, n: p.n, q: p.q, det: `Used: ${p.rn} (${p.rq})` })),
        ...user.sale.map(s => ({ type: 'Sale', d: s.d, n: s.n, q: s.q, det: `Amt: ₹${s.a}` }))
    ];

    // Newest entries top par dikhane ke liye sort karein
    allActivities.sort((a, b) => new Date(b.d) - new Date(a.d));

    const activityTableBody = document.querySelector("#activityTable tbody");
    if (activityTableBody) {
        activityTableBody.innerHTML = allActivities.map(a => `
            <tr>
                <td><strong>${a.type}</strong></td>
                <td>${a.d}</td>
                <td>${a.n}</td>
                <td>${a.q}</td>
                <td>${a.det}</td>
            </tr>
        `).join('');
    }

    // 3. INVENTORY LOGIC (Stock Status)
    const inv = {};
    user.raw.forEach(r => { const k = "RAW_"+r.n.toLowerCase(); if(!inv[k]) inv[k]={c:'Raw', n:r.n, in:0, out:0}; inv[k].in += r.q; });
    user.prod.forEach(p => {
        const rK = "RAW_"+p.rn.toLowerCase(); if(!inv[rK]) inv[rK]={c:'Raw', n:p.rn, in:0, out:0}; inv[rK].out += p.rq;
        const fK = "FIN_"+p.n.toLowerCase(); if(!inv[fK]) inv[fK]={c:'Finished', n:p.n, in:0, out:0}; inv[fK].in += p.q;
    });
    user.sale.forEach(s => { const fK = "FIN_"+s.n.toLowerCase(); if(!inv[fK]) inv[fK]={c:'Finished', n:s.n, in:0, out:0}; inv[fK].out += s.q; });

    stockTable.querySelector("tbody").innerHTML = Object.values(inv).map(i => `<tr><td>${i.c}</td><td>${i.n}</td><td>${i.in}</td><td>${i.out}</td><td style="font-weight:bold; color:${(i.in-i.out)<0?'red':'green'}">${(i.in-i.out).toFixed(2)}</td></tr>`).join('');

    // 4. TOP CARDS (Profit, Sales, Cost)
    const cost = user.raw.reduce((a,b)=>a+b.c,0);
    const sale = user.sale.reduce((a,b)=>a+b.a,0);
    dCost.textContent = "₹"+cost; 
    dSales.textContent = "₹"+sale; 
    dProfit.textContent = "₹"+(sale-cost);
    dProfit.className = 'card-value ' + (sale-cost >= 0 ? 'profit' : 'loss');
}


// Live Clock ko update karne ka function
function updateClock() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    const timeStr = now.toLocaleDateString('en-IN', options);
    const timeEl = document.getElementById('liveTime');
    if(timeEl) timeEl.textContent = "🕒 " + timeStr;
}
setInterval(updateClock, 1000); // Har 1 second mein chalega

// Final Start App Logic (Ise purane startApp se replace karein)
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
        
        // Header mein Company aur Owner ka naam set karein
        document.getElementById('headerTitle').innerHTML = `
            ${user.company} <span class="owner-name">| Owner: ${user.owner}</span>
        `;
        updateClock();
        render();
    }
}

// Setup data ko cloud par save karne ke liye
async function saveSetup() {
    const comp = document.getElementById('setupCompany').value;
    const own = document.getElementById('setupOwner').value;

    if (!comp || !own) {
        alert("Please enter both Company and Owner names.");
        return;
    }

    user.company = comp;
    user.owner = own;
    user.isSetupDone = true;

    showLoading(true);
    await sync(); // Ye aapke cloud sync function ko call karega
    showLoading(false);
    startApp(); // Setup ke baad app start karein
}
