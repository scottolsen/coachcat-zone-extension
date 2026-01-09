(function() {
  // Zone percentages based on FTP (these match what CoachCat uses)
  const ZONE_CONFIG = [
    { id: '1', name: 'Active Recovery', color: '#9CA3AF', abbrev: '1', minPct: 0, maxPct: 0.59 },
    { id: '2', name: 'Endurance', color: '#3B82F6', abbrev: '2', minPct: 0.59, maxPct: 0.75 },
    { id: '3', name: 'Tempo', color: '#22C55E', abbrev: '3', minPct: 0.75, maxPct: 0.84 },
    { id: 'ss', name: 'Sweet Spot', color: '#EAB308', abbrev: 'SS', minPct: 0.84, maxPct: 0.97 },
    { id: '4', name: 'Lactate Threshold', color: '#F97316', abbrev: '4', minPct: 0.97, maxPct: 1.04 },
    { id: '5', name: 'VO2 Max', color: '#EF4444', abbrev: '5', minPct: 1.04, maxPct: 1.20 },
    { id: '6', name: 'Anaerobic', color: '#A855F7', abbrev: '6', minPct: 1.20, maxPct: 2.00 },
    { id: '7', name: 'Neuromuscular', color: '#EC4899', abbrev: '7', minPct: 2.00, maxPct: null }
  ];

  let userFTP = null;

  function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}`;
    }
    return `0:${mins.toString().padStart(2, '0')}`;
  }

  function getZoneRange(zone, ftp) {
    if (!ftp) return '';
    const minW = Math.round(zone.minPct * ftp);
    const maxW = zone.maxPct ? Math.round(zone.maxPct * ftp) : null;

    if (zone.minPct === 0) {
      return `< ${maxW}W`;
    } else if (!maxW) {
      return `> ${minW}W`;
    } else {
      return `${minW} - ${maxW}W`;
    }
  }

  function processZoneData(data) {
    const zoneTotals = { '1': 0, '2': 0, '3': 0, 'ss': 0, '4': 0, '5': 0, '6': 0, '7': 0 };

    if (data && Array.isArray(data.activities)) {
      data.activities.forEach(activity => {
        if (activity.powerZones && typeof activity.powerZones === 'object') {
          Object.keys(activity.powerZones).forEach(zoneKey => {
            const seconds = activity.powerZones[zoneKey];
            if (zoneTotals.hasOwnProperty(zoneKey) && seconds > 0) {
              zoneTotals[zoneKey] += seconds;
            }
          });
        }
      });
    }

    return zoneTotals;
  }

  function createZonePanel(zoneTotals) {
    let panel = document.getElementById('coachcat-zone-panel');
    if (panel) panel.remove();

    const totalSeconds = Object.values(zoneTotals).reduce((a, b) => a + b, 0);
    const maxSeconds = Math.max(...Object.values(zoneTotals), 1);

    panel = document.createElement('div');
    panel.id = 'coachcat-zone-panel';
    panel.innerHTML = `
      <div class="zone-panel-header">
        <h2>Weekly Zone Distribution</h2>
        <span class="zone-total-badge">Total: ${formatTime(totalSeconds)}</span>
        <button class="zone-close-btn" id="zone-close-btn">×</button>
      </div>
      <div class="zone-list">
        ${ZONE_CONFIG.map(zone => {
          const seconds = zoneTotals[zone.id] || 0;
          const percentage = maxSeconds > 0 ? (seconds / maxSeconds) * 100 : 0;
          const rangeText = getZoneRange(zone, userFTP);
          return `
            <div class="zone-row">
              <div class="zone-badge" style="border-color: ${zone.color}">
                <span>${zone.abbrev}</span>
              </div>
              <div class="zone-info">
                <div class="zone-name">${zone.name}</div>
                <div class="zone-range">${rangeText}</div>
              </div>
              <div class="zone-bar-container">
                <div class="zone-bar" style="width: ${percentage}%; background-color: ${zone.color}"></div>
              </div>
              <div class="zone-time">${formatTime(seconds)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    document.body.appendChild(panel);
    document.getElementById('zone-close-btn').onclick = () => panel.classList.add('hidden');

    const toggleBtn = document.getElementById('coachcat-zone-toggle');
    if (toggleBtn) toggleBtn.classList.add('has-data');
  }

  function getFirebaseToken() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('firebaseLocalStorageDb', 1);
      request.onerror = () => reject('Failed to open IndexedDB');
      request.onsuccess = (event) => {
        const db = event.target.result;
        const tx = db.transaction('firebaseLocalStorage', 'readonly');
        const store = tx.objectStore('firebaseLocalStorage');
        const getAllReq = store.getAll();

        getAllReq.onsuccess = () => {
          const results = getAllReq.result;
          for (const item of results) {
            if (item.value && item.value.stsTokenManager && item.value.stsTokenManager.accessToken) {
              resolve(item.value.stsTokenManager.accessToken);
              return;
            }
          }
          reject('No auth token found');
        };
        getAllReq.onerror = () => reject('Failed to read from store');
      };
    });
  }

  async function fetchThreshold(token) {
    try {
      const response = await fetch('https://api.fascatapi.com/threshold', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      const data = await response.json();
      if (data.success && data.result && data.result.ftp) {
        userFTP = data.result.ftp;
        console.log('CoachCat Extension - FTP:', userFTP);
      }
    } catch (err) {
      console.error('CoachCat Extension - Failed to fetch FTP:', err);
    }
  }

  async function fetchAndDisplay() {
    try {
      const token = await getFirebaseToken();
      console.log('CoachCat Extension - Got auth token');

      // Fetch FTP first
      await fetchThreshold(token);

      // Then fetch zone data
      const today = new Date();
      const weekStart = new Date(today);
      const day = today.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      weekStart.setDate(today.getDate() + diff);

      const formatDate = (d) => d.toISOString().split('T')[0];
      const url = `https://api.fascatapi.com/app/v1/training/report/tiz-weekly?weekStart=${formatDate(weekStart)}&today=${formatDate(today)}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const zoneTotals = processZoneData(data);
      createZonePanel(zoneTotals);

    } catch (err) {
      console.error('CoachCat Extension - Error:', err);
    }
  }

  window.__coachcatFetchZones = fetchAndDisplay;
  setTimeout(fetchAndDisplay, 2000);
})();
