(function() {
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
  let currentWeekStart = null;
  let authToken = null;
  let lastPathname = null;

  // OTS state
  let allOTSByDate = {};
  let visibleYear = null;
  let visibleMonth = null; // 0-11
  let otsFetchedRange = { start: null, end: null };
  let isOwnCalendarFetch = false;

  function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return hours + ':' + mins.toString().padStart(2, '0');
    }
    return '0:' + mins.toString().padStart(2, '0');
  }

  function getZoneRange(zone, ftp) {
    if (!ftp) return '';
    const minW = Math.round(zone.minPct * ftp);
    const maxW = zone.maxPct ? Math.round(zone.maxPct * ftp) : null;

    if (zone.minPct === 0) {
      return '< ' + maxW + 'W';
    } else if (!maxW) {
      return '> ' + minW + 'W';
    } else {
      return minW + ' - ' + maxW + 'W';
    }
  }

  function formatWeekLabel(weekStart) {
    const start = new Date(weekStart + 'T00:00:00');
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    const opts = { month: 'short', day: 'numeric' };
    return start.toLocaleDateString('en-US', opts) + ' - ' + end.toLocaleDateString('en-US', opts);
  }

  function getWeekStartForDate(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  }

  function processZoneData(data) {
    const zoneTotals = { '1': 0, '2': 0, '3': 0, 'ss': 0, '4': 0, '5': 0, '6': 0, '7': 0 };

    if (data && Array.isArray(data.activities)) {
      data.activities.forEach(function(activity) {
        if (activity.powerZones && typeof activity.powerZones === 'object') {
          Object.keys(activity.powerZones).forEach(function(zoneKey) {
            var seconds = activity.powerZones[zoneKey];
            if (zoneTotals.hasOwnProperty(zoneKey) && seconds > 0) {
              zoneTotals[zoneKey] += seconds;
            }
          });
        }
      });
    }

    return zoneTotals;
  }

  // --- OTS Overlay ---

  function getOTSIntensityClass(ots) {
    if (ots === null) return '';
    if (ots < 75) return 'ots-badge--easy';
    if (ots < 100) return 'ots-badge--moderate';
    if (ots < 125) return 'ots-badge--hard';
    return 'ots-badge--very-hard';
  }

  function getWeeksForMonth(year, month) {
    var firstDay = new Date(year, month, 1);
    var lastDay = new Date(year, month + 1, 0);

    // Monday of the week containing the first day of the month
    var start = new Date(firstDay);
    var dow = start.getDay();
    start.setDate(start.getDate() + (dow === 0 ? -6 : 1 - dow));

    // Sunday of the week containing the last day of the month
    var end = new Date(lastDay);
    var endDow = end.getDay();
    if (endDow !== 0) {
      end.setDate(end.getDate() + (7 - endDow));
    }

    var weeks = [];
    var current = new Date(start);
    var week = [];
    while (current <= end) {
      week.push(current.toISOString().split('T')[0]);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
      current.setDate(current.getDate() + 1);
    }
    return weeks;
  }

  function storeOTSDays(days) {
    days.forEach(function(day) {
      var totalOTS = (day.workouts || [])
        .filter(function(w) { return w.ots !== null && w.ots !== undefined; })
        .reduce(function(sum, w) { return sum + w.ots; }, 0);
      allOTSByDate[day.date] = totalOTS > 0 ? totalOTS : null;
    });
  }

  async function fetchOTSForRange(startDate, endDate) {
    try {
      if (!authToken) {
        authToken = await getFirebaseToken();
      }
      isOwnCalendarFetch = true;
      var url = 'https://api.fascatapi.com/app/v1/training/calendar?start=' + startDate + '&end=' + endDate;
      console.log('CoachCat Extension - Fetching OTS range:', url);
      var response = await fetch(url, {
        headers: {
          'Authorization': 'Bearer ' + authToken,
          'Accept': 'application/json'
        }
      });
      isOwnCalendarFetch = false;
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var data = await response.json();
      if (!data.days || !Array.isArray(data.days)) return;

      storeOTSDays(data.days);

      if (!otsFetchedRange.start || startDate < otsFetchedRange.start) {
        otsFetchedRange.start = startDate;
      }
      if (!otsFetchedRange.end || endDate > otsFetchedRange.end) {
        otsFetchedRange.end = endDate;
      }
      console.log('CoachCat Extension - OTS cached for', Object.keys(allOTSByDate).length, 'days');
    } catch (err) {
      isOwnCalendarFetch = false;
      console.error('CoachCat Extension - Failed to fetch OTS range:', err);
    }
  }

  function createOTSOverlay() {
    var overlay = document.getElementById('coachcat-ots-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'coachcat-ots-overlay';
      document.body.appendChild(overlay);
    }

    if (!window.location.pathname.includes('/home/training') || visibleYear === null) {
      overlay.classList.add('ots-hidden');
      return;
    }
    overlay.classList.remove('ots-hidden');

    var weeks = getWeeksForMonth(visibleYear, visibleMonth);
    overlay.style.gridTemplateRows = 'repeat(' + weeks.length + ', 1fr)';

    overlay.textContent = '';
    weeks.forEach(function(week) {
      week.forEach(function(dateStr) {
        var cell = document.createElement('div');
        cell.className = 'ots-cell';
        var ots = allOTSByDate[dateStr];
        if (ots !== null && ots !== undefined) {
          var badge = document.createElement('span');
          badge.className = 'ots-badge ' + getOTSIntensityClass(ots);
          badge.textContent = 'OTS ' + ots;
          cell.appendChild(badge);
        }
        overlay.appendChild(cell);
      });
    });
  }

  async function changeVisibleMonth(delta) {
    visibleMonth += delta;
    if (visibleMonth > 11) {
      visibleMonth = 0;
      visibleYear++;
    } else if (visibleMonth < 0) {
      visibleMonth = 11;
      visibleYear--;
    }
    console.log('CoachCat Extension - Visible month:', visibleYear + '-' + (visibleMonth + 1));

    // Render immediately with cached data
    createOTSOverlay();

    // After a delay, check if data is missing and fetch if needed
    setTimeout(async function() {
      var weeks = getWeeksForMonth(visibleYear, visibleMonth);
      var hasMissing = weeks.some(function(week) {
        return week.some(function(date) { return !(date in allOTSByDate); });
      });
      if (hasMissing) {
        var firstDate = weeks[0][0];
        var lastDate = weeks[weeks.length - 1][6];
        await fetchOTSForRange(firstDate, lastDate);
        createOTSOverlay();
      }
    }, 1500);
  }

  function goToToday() {
    var today = new Date();
    visibleYear = today.getFullYear();
    visibleMonth = today.getMonth();
    console.log('CoachCat Extension - Go to today:', visibleYear + '-' + (visibleMonth + 1));
    createOTSOverlay();
  }

  function checkRouteForOTS() {
    var currentPath = window.location.pathname;
    if (currentPath !== lastPathname) {
      lastPathname = currentPath;
      var overlay = document.getElementById('coachcat-ots-overlay');
      if (overlay) {
        if (currentPath.includes('/home/training')) {
          overlay.classList.remove('ots-hidden');
        } else {
          overlay.classList.add('ots-hidden');
        }
      }
    }
  }

  // Intercept fetch to capture the app's calendar API responses
  function setupFetchInterceptor() {
    var originalFetch = window.fetch;
    window.fetch = async function() {
      var response = await originalFetch.apply(this, arguments);
      try {
        if (isOwnCalendarFetch) return response;
        var url = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] && arguments[0].url);
        if (url && url.indexOf('/training/calendar') !== -1 && url.indexOf('fascatapi.com') !== -1) {
          var startMatch = url.match(/start=(\d{4}-\d{2}-\d{2})/);
          var endMatch = url.match(/end=(\d{4}-\d{2}-\d{2})/);
          if (startMatch && endMatch) {
            var daySpan = (new Date(endMatch[1]) - new Date(startMatch[1])) / 86400000;
            if (daySpan > 14) {
              // This is the app's wide-range calendar request - capture OTS data
              var clone = response.clone();
              clone.json().then(function(data) {
                if (data.days && Array.isArray(data.days)) {
                  storeOTSDays(data.days);
                  if (!otsFetchedRange.start || startMatch[1] < otsFetchedRange.start) {
                    otsFetchedRange.start = startMatch[1];
                  }
                  if (!otsFetchedRange.end || endMatch[1] > otsFetchedRange.end) {
                    otsFetchedRange.end = endMatch[1];
                  }
                  console.log('CoachCat Extension - Intercepted', Object.keys(allOTSByDate).length, 'OTS days');
                  createOTSOverlay();
                }
              }).catch(function() {});
            }
          }
        }
      } catch (e) {}
      return response;
    };
    console.log('CoachCat Extension - Fetch interceptor installed');
  }

  // --- Zone Panel ---

  function createZonePanel(zoneTotals, weekLabel) {
    var panel = document.getElementById('coachcat-zone-panel');
    if (panel) panel.remove();

    var totalSeconds = Object.values(zoneTotals).reduce(function(a, b) { return a + b; }, 0);
    var maxSeconds = Math.max.apply(null, Object.values(zoneTotals).concat([1]));

    panel = document.createElement('div');
    panel.id = 'coachcat-zone-panel';
    panel.innerHTML = '<div class="zone-panel-header">'
      + '<h2>Weekly Zone Distribution</h2>'
      + '<span class="zone-total-badge">Total: ' + formatTime(totalSeconds) + '</span>'
      + '<button class="zone-close-btn" id="zone-close-btn">\u00d7</button>'
      + '</div>'
      + '<div class="zone-week-label">' + weekLabel + '</div>'
      + '<div class="zone-list">'
      + ZONE_CONFIG.map(function(zone) {
          var seconds = zoneTotals[zone.id] || 0;
          var percentage = maxSeconds > 0 ? (seconds / maxSeconds) * 100 : 0;
          var rangeText = getZoneRange(zone, userFTP);
          return '<div class="zone-row">'
            + '<div class="zone-badge" style="border-color: ' + zone.color + '">'
            + '<span>' + zone.abbrev + '</span>'
            + '</div>'
            + '<div class="zone-info">'
            + '<div class="zone-name">' + zone.name + '</div>'
            + '<div class="zone-range">' + rangeText + '</div>'
            + '</div>'
            + '<div class="zone-bar-container">'
            + '<div class="zone-bar" style="width: ' + percentage + '%; background-color: ' + zone.color + '"></div>'
            + '</div>'
            + '<div class="zone-time">' + formatTime(seconds) + '</div>'
            + '</div>';
        }).join('')
      + '</div>';

    document.body.appendChild(panel);
    panel.classList.add('hidden');
    document.getElementById('zone-close-btn').onclick = function() { panel.classList.add('hidden'); };

    var toggleBtn = document.getElementById('coachcat-zone-toggle');
    if (toggleBtn) toggleBtn.classList.add('has-data');
  }

  function getFirebaseToken() {
    return new Promise(function(resolve, reject) {
      var request = indexedDB.open('firebaseLocalStorageDb', 1);
      request.onerror = function() { reject('Failed to open IndexedDB'); };
      request.onsuccess = function(event) {
        var db = event.target.result;
        var tx = db.transaction('firebaseLocalStorage', 'readonly');
        var store = tx.objectStore('firebaseLocalStorage');
        var getAllReq = store.getAll();

        getAllReq.onsuccess = function() {
          var results = getAllReq.result;
          for (var i = 0; i < results.length; i++) {
            var item = results[i];
            if (item.value && item.value.stsTokenManager && item.value.stsTokenManager.accessToken) {
              resolve(item.value.stsTokenManager.accessToken);
              return;
            }
          }
          reject('No auth token found');
        };
        getAllReq.onerror = function() { reject('Failed to read from store'); };
      };
    });
  }

  async function fetchThreshold(token) {
    try {
      var response = await fetch('https://api.fascatapi.com/threshold', {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/json'
        }
      });
      var data = await response.json();
      if (data.success && data.result && data.result.ftp) {
        userFTP = data.result.ftp;
        console.log('CoachCat Extension - FTP:', userFTP);
      }
    } catch (err) {
      console.error('CoachCat Extension - Failed to fetch FTP:', err);
    }
  }

  async function fetchForWeek(weekStart) {
    try {
      if (!authToken) {
        authToken = await getFirebaseToken();
        await fetchThreshold(authToken);
      }

      currentWeekStart = weekStart;
      var weekEnd = new Date(weekStart + 'T00:00:00');
      weekEnd.setDate(weekEnd.getDate() + 6);

      var formatDate = function(d) { return d.toISOString().split('T')[0]; };
      var today = new Date();
      var endDate = weekEnd > today ? today : weekEnd;

      var url = 'https://api.fascatapi.com/app/v1/training/report/tiz-weekly?weekStart=' + weekStart + '&today=' + formatDate(endDate);
      console.log('CoachCat Extension - Fetching:', url);

      var response = await fetch(url, {
        headers: {
          'Authorization': 'Bearer ' + authToken,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }

      var data = await response.json();
      var zoneTotals = processZoneData(data);
      var weekLabel = formatWeekLabel(weekStart);
      createZonePanel(zoneTotals, weekLabel);

    } catch (err) {
      console.error('CoachCat Extension - Error:', err);
    }
  }

  async function fetchAndDisplay() {
    var today = new Date();
    var weekStart = getWeekStartForDate(today);
    await fetchForWeek(weekStart);
  }

  // Track last seen week from app's tiz-weekly requests
  var lastAppWeek = null;

  function setupNetworkObserver() {
    if (window.PerformanceObserver) {
      var observer = new PerformanceObserver(function(list) {
        var entries = list.getEntries();
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i];
          if (entry.name.indexOf('tiz-weekly') !== -1 && entry.name.indexOf('fascatapi.com') !== -1) {
            var weekMatch = entry.name.match(/weekStart=(\d{4}-\d{2}-\d{2})/);
            if (weekMatch) {
              var appWeek = weekMatch[1];
              if (appWeek !== lastAppWeek) {
                lastAppWeek = appWeek;
                console.log('CoachCat Extension - App viewing week:', appWeek);
                if (appWeek !== currentWeekStart) {
                  setTimeout(function() { fetchForWeek(appWeek); }, 300);
                }
              }
            }
          }
        }
      });

      try {
        observer.observe({ entryTypes: ['resource'] });
        console.log('CoachCat Extension - Network observer started');
      } catch (e) {
        console.log('CoachCat Extension - Network observer not available');
      }
    }
  }

  window.__coachcatFetchZones = fetchAndDisplay;
  window.__coachcatFetchForWeek = fetchForWeek;

  // Setup interceptors and observers
  setupFetchInterceptor();
  setupNetworkObserver();

  // Click listener for month navigation (< > Today buttons in the nav bar)
  document.addEventListener('click', function(e) {
    // Only handle clicks in the top nav bar area, after the sidebar
    if (e.clientY > 50 || e.clientX < 88 || visibleYear === null) return;

    // < button (approximate position)
    if (e.clientX >= 115 && e.clientX <= 165) {
      changeVisibleMonth(-1);
    }
    // > button (approximate position)
    else if (e.clientX >= 280 && e.clientX <= 330) {
      changeVisibleMonth(1);
    }
    // Today button (approximate position)
    else if (e.clientX >= 335 && e.clientX <= 420) {
      goToToday();
    }
  }, true);

  // Resize handler
  var resizeTimeout;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(createOTSOverlay, 250);
  });

  // Poll for route changes to show/hide OTS overlay
  setInterval(checkRouteForOTS, 2000);

  // Initial load
  setTimeout(async function() {
    await fetchAndDisplay();

    if (window.location.pathname.includes('/home/training')) {
      var today = new Date();
      visibleYear = today.getFullYear();
      visibleMonth = today.getMonth();

      // Fetch OTS for a wide range if the interceptor hasn't already provided data
      if (Object.keys(allOTSByDate).length === 0) {
        var rangeStart = new Date(today.getFullYear(), today.getMonth() - 3, 1);
        var rangeEnd = new Date(today.getFullYear(), today.getMonth() + 4, 0);
        await fetchOTSForRange(
          rangeStart.toISOString().split('T')[0],
          rangeEnd.toISOString().split('T')[0]
        );
      }
      createOTSOverlay();
    }
  }, 2000);
})();
