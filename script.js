// ================= CONFIG =================
const CLIENT_ID = '330273087572-bb5h0ob2ahu56h93sac7hvf07je6uha7.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

let tokenClient;
let accessToken = null;
let fileId = null;

let user = {
    raw: [],
    prod: [],
    sale: [],
    company: '',
    owner: '',
    isSetupDone: false
};

// =============== UTIL =================
function escapeHTML(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showLoading(state) {
    document.getElementById('loading').style.display = state ? 'flex' : 'none';
}

function logout() {
    localStorage.removeItem('btcloudtoken');
    accessToken = null;
    location.reload();
}

// =============== INIT =================
window.onload = () => {
    const savedToken = localStorage.getItem('btcloudtoken');
    if (savedToken) {
        accessToken = savedToken;
        loadFromCloud().catch(() => logout());
    } else {
        document.getElementById('authSection').style.display = 'block';
    }

    setInterval(updateClock, 1000);

    document.querySelector('#mainHeader button').onclick = logout;
};

// =============== DRIVE =================
async function loadFromCloud() {
    showLoading(true);
    try {
        const res = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=name='trackerdata.json'%20in%20spaces%20appDataFolder&fields=files(id,name)`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (res.status === 401) return logout();

        const list = await res.json();

        if (list.files?.length) {
            fileId = list.files[0].id;
            const content = await fetch(
                `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            user = await content.json();
        }

        startApp();
    } catch (e) {
        console.error("Cloud load error", e);
    } finally {
        showLoading(false);
    }
}

async function sync() {
    if (!accessToken || !fileId || !user.isSetupDone) return;

    try {
        await fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
            {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${accessToken}` },
                body: new Blob([JSON.stringify(user)], { type: 'application/json' })
            }
        );
    } catch (e) {
        console.log("Sync failed");
    }
}

// =============== INVENTORY ENGINE =================
function calculateInventory() {
    const inv = {};

    user.raw.forEach(r => {
        if (!inv[r.n]) inv[r.n] = { type: 'Raw', in: 0, out: 0, cost: 0 };
        inv[r.n].in += r.q;
        inv[r.n].cost += r.c + r.ec;
    });

    user.prod.forEach(p => {
        if (inv[p.mainRaw.rn]) inv[p.mainRaw.rn].out += p.mainRaw.rq;
        p.extraRaws.forEach(er => {
            if (inv[er.rn]) inv[er.rn].out += er.rq;
        });

        if (!inv[p.n]) inv[p.n] = { type: 'Finished', in: 0, out: 0 };
        inv[p.n].in += p.q;
    });

    user.sale.forEach(s => {
        if (inv[s.n]) inv[s.n].out += s.q;
    });

    return inv;
}

function hasEnoughStock(item, qty) {
    const inv = calculateInventory();
    if (!inv[item]) return false;
    return (inv[item].in - inv[item].out) >= qty;
}

// =============== FORMS =================
document.getElementById('fRaw').onsubmit = e => {
    e.preventDefault();

    user.raw.push({
        id: Date.now(),
        d: riDate.value,
        n: riName.value.trim(),
        q: parseFloat(riQty.value),
        c: parseFloat(riCost.value),
        ec: parseFloat(riExtraCost.value) || 0
    });

    e.target.reset();
    render();
    sync();
};

document.getElementById('fProd').onsubmit = e => {
    e.preventDefault();

    const mainRawName = pRawName.value;
    const mainQty = parseFloat(pRawQty.value);

    if (!hasEnoughStock(mainRawName, mainQty)) {
        alert("Not enough raw material in stock!");
        return;
    }

    const extraRaws = [];
    document.querySelectorAll('.extra-raw-row').forEach(row => {
        const sel = row.querySelector('.extra-raw-select');
        const qty = row.querySelector('.extra-raw-qty');
        if (sel.value && qty.value) {
            if (!hasEnoughStock(sel.value, parseFloat(qty.value))) {
                alert("Not enough stock for extra raw!");
                return;
            }
            extraRaws.push({ rn: sel.value, rq: parseFloat(qty.value) });
        }
    });

    user.prod.push({
        id: Date.now(),
        d: pDate.value,
        n: pName.value.trim(),
        q: parseFloat(pQty.value),
        mainRaw: { rn: mainRawName, rq: mainQty },
        extraRaws,
        ec: parseFloat(pExtraCost.value) || 0
    });

    e.target.reset();
    document.getElementById('additionalRaws').innerHTML = '';
    render();
    sync();
};

document.getElementById('fSale').onsubmit = e => {
    e.preventDefault();

    const product = sName.value;
    const qty = parseFloat(sQty.value);

    if (!hasEnoughStock(product, qty)) {
        alert("Not enough finished goods in stock!");
        return;
    }

    user.sale.push({
        id: Date.now(),
        d: sDate.value,
        n: product,
        q: qty,
        a: parseFloat(sAmt.value)
    });

    e.target.reset();
    render();
    sync();
};

// =============== RENDER =================
function render() {
    const inv = calculateInventory();

    // Raw table
    tRaw.querySelector('tbody').innerHTML = user.raw.map(r => `
        <tr>
            <td>${escapeHTML(r.d)}</td>
            <td>${escapeHTML(r.n)}</td>
            <td>${r.q}</td>
            <td>${r.c}</td>
            <td>${r.ec}</td>
            <td><button onclick="del('raw',${r.id})">Del</button></td>
        </tr>
    `).join('');

    // Production
    tProd.querySelector('tbody').innerHTML = user.prod.map(p => `
        <tr>
            <td>${escapeHTML(p.d)}</td>
            <td>${escapeHTML(p.n)}</td>
            <td>${p.q}</td>
            <td>${escapeHTML(p.mainRaw.rn)}</td>
            <td>${p.extraRaws.length}</td>
            <td>${p.ec}</td>
            <td><button onclick="del('prod',${p.id})">Del</button></td>
        </tr>
    `).join('');

    // Sales
    tSale.querySelector('tbody').innerHTML = user.sale.map(s => `
        <tr>
            <td>${escapeHTML(s.d)}</td>
            <td>${escapeHTML(s.n)}</td>
            <td>${s.q}</td>
            <td>${s.a}</td>
            <td><button onclick="del('sale',${s.id})">Del</button></td>
        </tr>
    `).join('');

    // Stock table
    stockTable.querySelector('tbody').innerHTML =
        Object.entries(inv).map(([name, data]) => `
        <tr>
            <td>${data.type}</td>
            <td>${escapeHTML(name)}</td>
            <td>${data.in}</td>
            <td>${data.out}</td>
            <td>${(data.in - data.out).toFixed(2)}</td>
        </tr>
    `).join('');

    // Activity Table
    const activities = [
        ...user.raw.map(r => ({ type: 'Raw', ...r })),
        ...user.prod.map(p => ({ type: 'Production', ...p })),
        ...user.sale.map(s => ({ type: 'Sale', ...s }))
    ].sort((a, b) => new Date(b.d) - new Date(a.d));

    activityTable.querySelector('tbody').innerHTML =
        activities.map(a => `
        <tr>
            <td>${a.type}</td>
            <td>${escapeHTML(a.d)}</td>
            <td>${escapeHTML(a.n)}</td>
            <td>${a.q}</td>
            <td>-</td>
        </tr>
    `).join('');

    // Profit
    const totalSales = user.sale.reduce((a, b) => a + b.a, 0);
    const totalCost = user.raw.reduce((a, b) => a + b.c + b.ec, 0)
        + user.prod.reduce((a, b) => a + b.ec, 0);

    dSales.textContent = `$${totalSales.toFixed(2)}`;
    dCost.textContent = `$${totalCost.toFixed(2)}`;
    dProfit.textContent = `$${(totalSales - totalCost).toFixed(2)}`;
}

function del(type, id) {
    user[type] = user[type].filter(i => i.id !== id);
    render();
    sync();
}

// =============== AUTH =================
function initiateLogin() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: res => {
            accessToken = res.access_token;
            localStorage.setItem('btcloudtoken', accessToken);
            loadFromCloud();
        }
    });
    tokenClient.requestAccessToken();
}

// =============== SETUP =================
function startApp() {
    authSection.style.display = 'none';
    mainHeader.style.display = 'block';
    mainApp.style.display = 'block';
    headerTitle.innerHTML = `${escapeHTML(user.company)} <span class="owner-name">Owner: ${escapeHTML(user.owner)}</span>`;
    render();
}

function updateClock() {
    const el = document.getElementById('liveTime');
    if (el) el.textContent = new Date().toLocaleString('en-IN');
}
