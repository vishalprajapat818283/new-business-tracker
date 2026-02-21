// ================= CONFIG =================
const CLIENT_ID = '330273087572-bb5h0ob2ahu56h93sac7hvf07je6uha7.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

let tokenClient;
let accessToken = null;
let fileId = null;

let user = { raw: [], prod: [], sale: [], company: '', owner: '', isSetupDone: false };

// ================= INIT =================
window.onload = () => {
    const savedToken = localStorage.getItem('btcloudtoken');

    if (savedToken) {
        accessToken = savedToken;
        loadFromCloud().catch(() => {
            localStorage.removeItem('btcloudtoken');
            document.getElementById('authSection').style.display = 'block';
        });
    } else {
        document.getElementById('authSection').style.display = 'block';
    }

    setInterval(updateClock, 1000);
};

// ================= UTIL =================
function showLoading(state) {
    document.getElementById('loading').style.display = state ? 'flex' : 'none';
}

function updateClock() {
    const el = document.getElementById('liveTime');
    if (el) el.textContent = new Date().toLocaleString('en-IN');
}

function logout() {
    localStorage.removeItem('btcloudtoken');
    accessToken = null;
    location.reload();
}

// ================= DRIVE =================
async function loadFromCloud() {
    showLoading(true);
    try {
        const res = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=name='trackerdata.json'%20in%20spaces%20appDataFolder&fields=files(id,name)`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        const list = await res.json();

        if (list.files && list.files.length > 0) {
            fileId = list.files[0].id;

            const content = await fetch(
                `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            const cloudData = await content.json();
            if (cloudData) user = cloudData;
        }

        startApp();
    } catch (e) {
        console.error("Cloud error:", e);
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

// ================= AUTH =================
function initiateLogin() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (res) => {
            accessToken = res.access_token;
            localStorage.setItem('btcloudtoken', accessToken);
            loadFromCloud();
        }
    });
    tokenClient.requestAccessToken();
}

// ================= SETUP =================
async function saveSetup() {
    const company = document.getElementById('setupCompany').value.trim();
    const owner = document.getElementById('setupOwner').value.trim();

    if (!company || !owner) {
        alert("Please fill company and owner name.");
        return;
    }

    user.company = company;
    user.owner = owner;
    user.isSetupDone = true;

    await createCloudFile();
    startApp();
}

async function createCloudFile() {
    const metadata = { name: 'trackerdata.json', parents: ['appDataFolder'] };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(user)], { type: 'application/json' }));

    const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: form
        }
    );

    const data = await res.json();
    fileId = data.id;
}

// ================= APP START =================
function startApp() {
    document.getElementById('authSection').style.display = 'none';

    if (!user.isSetupDone) {
        document.getElementById('setupSection').style.display = 'block';
    } else {
        document.getElementById('mainHeader').style.display = 'block';
        document.getElementById('mainApp').style.display = 'block';
        document.getElementById('headerTitle').innerHTML =
            `${user.company} <span class="owner-name">Owner: ${user.owner}</span>`;
        render();
    }
}

// ================= FORMS =================
document.getElementById('fRaw').onsubmit = (e) => {
    e.preventDefault();

    user.raw.push({
        id: Date.now(),
        d: riDate.value,
        n: riName.value,
        q: parseFloat(riQty.value),
        c: parseFloat(riCost.value),
        ec: parseFloat(riExtraCost.value) || 0
    });

    e.target.reset();
    render();
    sync();
};

document.getElementById('fProd').onsubmit = (e) => {
    e.preventDefault();

    user.prod.push({
        id: Date.now(),
        d: pDate.value,
        n: pName.value,
        q: parseFloat(pQty.value),
        mainRaw: {
            rn: pRawName.value,
            rq: parseFloat(pRawQty.value)
        },
        extraRaws: [],
        ec: parseFloat(pExtraCost.value) || 0
    });

    e.target.reset();
    render();
    sync();
};

document.getElementById('fSale').onsubmit = (e) => {
    e.preventDefault();

    user.sale.push({
        id: Date.now(),
        d: sDate.value,
        n: sName.value,
        q: parseFloat(sQty.value),
        a: parseFloat(sAmt.value)
    });

    e.target.reset();
    render();
    sync();
};

// ================= RENDER =================
function render() {
    const tRaw = document.querySelector('#tRaw tbody');
    const tProd = document.querySelector('#tProd tbody');
    const tSale = document.querySelector('#tSale tbody');

    tRaw.innerHTML = user.raw.map(r =>
        `<tr>
            <td>${r.d}</td>
            <td>${r.n}</td>
            <td>${r.q}</td>
            <td>${r.c}</td>
            <td>${r.ec}</td>
            <td><button onclick="del('raw',${r.id})">Del</button></td>
        </tr>`
    ).join('');

    tProd.innerHTML = user.prod.map(p =>
        `<tr>
            <td>${p.d}</td>
            <td>${p.n}</td>
            <td>${p.q}</td>
            <td>${p.mainRaw?.rn || ''}</td>
            <td>${p.ec}</td>
            <td><button onclick="del('prod',${p.id})">Del</button></td>
        </tr>`
    ).join('');

    tSale.innerHTML = user.sale.map(s =>
        `<tr>
            <td>${s.d}</td>
            <td>${s.n}</td>
            <td>${s.q}</td>
            <td>${s.a}</td>
            <td><button onclick="del('sale',${s.id})">Del</button></td>
        </tr>`
    ).join('');

    const totalSales = user.sale.reduce((a, b) => a + b.a, 0);
    const totalCost =
        user.raw.reduce((a, b) => a + b.c + b.ec, 0) +
        user.prod.reduce((a, b) => a + b.ec, 0);

    document.getElementById('dSales').textContent = `$${totalSales.toFixed(2)}`;
    document.getElementById('dCost').textContent = `$${totalCost.toFixed(2)}`;
    document.getElementById('dProfit').textContent =
        `$${(totalSales - totalCost).toFixed(2)}`;
}

function del(type, id) {
    user[type] = user[type].filter(i => i.id !== id);
    render();
    sync();
}

// ================= TABS =================
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tab-btn, section')
            .forEach(el => el.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(btn.dataset.target)
            .classList.add('active');
    };
});
