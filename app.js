// =========================================================================
// PROTECH HVAC ENTERPRISE SUITE - CORE ENGINE & CALCULATION PARAMETERS
// =========================================================================

// Global System Tracking Parameters
let currentReportType = "";
let userHasInfiniteBypass = false;

// 1. REFRIGERANT SPECIFICATION MATRIX DATABASE (Antoine Constants & Eco Profiles)
const REFRIGERANTS = {
    "R-22": { class: "HCFC (Legacy/Phased Out)", gwp: "1,810", oil: "Mineral (MO) / Alkylbenzene (AB)", a: 11.7523, b: 3505.7, c: 388.9 },
    "R-12": { class: "CFC (Legacy/Phased Out)", gwp: "10,900", oil: "Mineral (MO)", a: 11.4589, b: 3122.3, c: 379.2 },
    "R-134a": { class: "HFC (Current Standard)", gwp: "1,430", oil: "Polyolester (POE)", a: 11.8342, b: 3674.1, c: 398.6 },
    "R-410A": { class: "HFC High Pressure (Phase-Down)", gwp: "2,088", oil: "Polyolester (POE)", a: 11.9542, b: 3520.4, c: 395.2 },
    "R-404A": { class: "HFC Commercial Refrigeration", gwp: "3,922", oil: "Polyolester (POE)", a: 12.1023, b: 3410.8, c: 385.4 },
    "R-407C": { class: "HFC R-22 Retrofit Drop-in", gwp: "1,774", oil: "Polyolester (POE)", a: 11.8841, b: 3512.9, c: 390.1 },
    "R-502": { class: "CFC Blend (Legacy/Phased Out)", gwp: "4,657", oil: "Mineral (MO)", a: 11.6214, b: 3180.2, c: 382.1 },
    "R-32": { class: "A2L Mildly Flammable (Next-Gen)", gwp: "675", oil: "Polyolester (POE)", a: 11.9845, b: 3402.1, c: 403.4 },
    "R-454B": { class: "A2L Next-Gen Eco Standard", gwp: "466", oil: "Polyolester (POE)", a: 11.9123, b: 3422.8, c: 398.2 },
    "R-290": { class: "A3 Propane Natural Gas", gwp: "3", oil: "Synthetic Polyolester / MO", a: 11.2341, b: 2890.4, c: 384.2 },
    "R-717": { class: "B2L Pure Ammonia Industrial", gwp: "0", oil: "Mineral / Synthetic Alphaolefin", a: 12.1245, b: 3712.5, c: 412.3 }
};

// 2. GLOBAL TAB ROUTER SYSTEM
function switchTab(tabId) {
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    
    const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(btn => btn.getAttribute('onclick').includes(tabId));
    if (activeBtn) activeBtn.classList.add('active');

    if (tabId === 'pt') updatePtChart();
}

// 3. INSULATION VIEW CONTROLLER (Handles your dynamic multi-tiered radio selections)
function toggleInsulationDetails() {
    const isInsulated = document.getElementById('isInsulated').value;
    const detailsContainer = document.getElementById('insulationDetailsContainer');
    
    if (isInsulated === 'yes') {
        detailsContainer.style.display = 'block';
    } else {
        detailsContainer.style.display = 'none';
        // Reset radio buttons if hidden
        document.querySelectorAll('input[name="insulationTier"]').forEach(el => el.checked = false);
    }
}

// 4. TAB 1: PSYCHROMECTRICS (Magnus-Tetens Approximations)
function calculatePsychometrics() {
    let dbF = parseFloat(document.getElementById('dbTemp').value);
    let rh = parseFloat(document.getElementById('rhPct').value);

    if (isNaN(dbF) || isNaN(rh) || rh < 1 || rh > 100) return;

    let dbC = (dbF - 32) * 5 / 9;
    const a = 17.27, b = 237.7;
    let Es = 0.61078 * Math.exp((a * dbC) / (b + dbC));
    let E = (rh / 100) * Es;

    let alpha = ((a * dbC) / (b + dbC)) + Math.log(rh / 100);
    let dpC = (b * alpha) / (a - alpha);
    let dpF = (dpC * 9 / 5) + 32;

    const P_atm = 101.325; 
    let W = 0.62194 * (E / (P_atm - E));
    let grainsPerLb = W * 7000;
    let vaporPressureInHg = E * 0.295333;

    document.getElementById('resDewPoint').innerText = dpF.toFixed(1) + " °F";
    document.getElementById('resGrains').innerText = grainsPerLb.toFixed(1) + " GPP";
    document.getElementById('resVapor').innerText = vaporPressureInHg.toFixed(3) + " inHg";
}

// 5. TAB 2: ADVANCED LOAD CALCULATIONS WITH INSULATION SCALING MATRIX
function calculateTonnage() {
    let sqFt = parseFloat(document.getElementById('spaceSqFt').value);
    let type = document.getElementById('buildingType').value;
    let isInsulated = document.getElementById('isInsulated').value;

    if (isNaN(sqFt) || sqFt <= 0) return;

    // Baseline calculation based on occupancy/facility type profile
    let baseSqFtPerTon = 400; 
    if (type === 'industrial') baseSqFtPerTon = 250; 
    if (type === 'server') baseSqFtPerTon = 100;
    if (type === 'residential') baseSqFtPerTon = 500;

    let calculatedTons = sqFt / baseSqFtPerTon;

    // Thermodynamic penalty multiplier matrix based on real-world insulation selections
    let multiplier = 1.0; 

    if (isInsulated === 'no') {
        multiplier = 1.45; // 45% structural capacity penalty for completely uninsulated shells
    } else if (isInsulated === 'yes') {
        const selectedTier = document.querySelector('input[name="insulationTier"]:checked');
        if (selectedTier) {
            switch(selectedTier.value) {
                case 'walls_ceilings':
                    multiplier = 0.90; // High-efficiency discount
                    break;
                case 'walls_only':
                    multiplier = 1.15; // Moderate overhead thermal roof penalty
                    break;
                case 'attic_only':
                    multiplier = 1.25; // Radial solar structural wall transfer penalty
                    break;
                case 'none':
                    multiplier = 1.45; // Fallback equivalent to absolute zero insulation
                    break;
            }
        } else {
            // Default to uninsulated baseline multiplier safety margins if yes is selected but bubble is empty
            multiplier = 1.20;
        }
    }

    let adjustedTons = calculatedTons * multiplier;
    let requiredCfm = adjustedTons * 400;

    document.getElementById('resTons').innerText = adjustedTons.toFixed(2) + " Tons";
    document.getElementById('resCfm').innerText = Math.round(requiredCfm).toLocaleString() + " CFM";
}

// 6. TAB 3: FLUID FRICTION DUCTULATOR (ASHRAE Equal Friction Mechanical Method)
function calculateDuct() {
    let cfm = parseFloat(document.getElementById('ductCfm').value);
    let friction = parseFloat(document.getElementById('friction').value);

    if (isNaN(cfm) || isNaN(friction) || cfm <= 0 || friction <= 0) return;

    let dRound = 2.42 * Math.pow(cfm, 0.44) * Math.pow(friction, -0.22) * 0.1;
    let fixedHeight = 10;
    let wRect = Math.pow(dRound, 5) / (32 * Math.pow(fixedHeight, 3));
    wRect = Math.pow(wRect, 0.125) * 2;

    let areaSqFt = (Math.PI * Math.pow(dRound / 12, 2)) / 4;
    let velocityFpm = cfm / areaSqFt;

    document.getElementById('resRoundDuct').innerText = dRound.toFixed(1) + " in. Diameter";
    document.getElementById('resRectDuct').innerText = Math.ceil(wRect) + " in. Wide x " + fixedHeight + " in. High";
    document.getElementById('resVelocity').innerText = Math.round(velocityFpm).toLocaleString() + " FPM";
}

// 7. TAB 4: PRESSURE TEMPERATURE CHART CONVERTER (Antoine Saturated Vapor Array Logic)
function initializeRefrigerantDropdown() {
    const selector = document.getElementById('refrigerantSelect');
    if (!selector) return;
    selector.innerHTML = "";
    Object.keys(REFRIGERANTS).forEach(refName => {
        let opt = document.createElement('option');
        opt.value = refName;
        opt.innerText = refName;
        selector.appendChild(opt);
    });
}

function updatePtChart() {
    const refKey = document.getElementById('refrigerantSelect').value;
    const ref = REFRIGERANTS[refKey];
    if (!ref) return;

    document.getElementById('refClass').innerText = ref.class;
    document.getElementById('refGwp').innerText = ref.gwp;
    document.getElementById('refOil').innerText = ref.oil;

    const tbody = document.getElementById('ptTableBody');
    tbody.innerHTML = "";

    const targetTemps = [-40, -20, 0, 20, 40, 60, 80, 100, 120, 140];

    targetTemps.forEach(tempF => {
        let tempK = (tempF - 32) * 5 / 9 + 273.15;
        let lnP = ref.a - (ref.b / (ref.c + tempK));
        let pBar = Math.exp(lnP); 
        let pPsi = pBar * 14.5038;
        let pPsig = pPsi - 14.696;

        if (pPsig < 0) {
            let inHgVaccum = Math.abs(pPsig) * 2.03602;
            pPsig = inHgVaccum.toFixed(1) + " inHg Vac";
        } else {
            pPsig = pPsig.toFixed(1) + " PSIG";
        }

        let glideOffset = (refKey.includes("407") || refKey.includes("404") || refKey.includes("410")) ? 2.8 : 0;
        let dewPsigVal = (parseFloat(pPsig) > 0) ? (parseFloat(pPsig) + glideOffset).toFixed(1) + " PSIG" : pPsig;

        let row = document.createElement('tr');
        row.innerHTML = `<td><b>${tempF}°F</b></td><td>${pPsig}</td><td>${dewPsigVal}</td>`;
        tbody.appendChild(row);
    });
}

// 8. CORE DATA LOCK ACCESS CONTROL SECURITY GATEWAY
function triggerGate(reportName) {
    currentReportType = reportName;
    
    if (userHasInfiniteBypass) {
        executeDocumentDownload();
        return;
    }
    
    document.getElementById('gateMessage').innerText = `Enter your corporate credentials to process and download the [${reportName}].`;
    document.getElementById('lockModal').style.display = "flex";
}

function closeGate() {
    document.getElementById('lockModal').style.display = "none";
}

function toggleGateView(toBypass) {
    document.getElementById('standardGateView').style.display = toBypass ? "none" : "block";
    document.getElementById('bypassGateView').style.display = toBypass ? "block" : "none";
}

function submitGate() {
    const email = document.getElementById('userEmail').value.trim();
    if (!email || !email.includes('@') || email.length < 5) {
        alert("Authentication Denied: A valid corporate operational email profile is required.");
        return;
    }
    

