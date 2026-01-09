function injectScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function() { this.remove(); };
  (document.head || document.documentElement).appendChild(script);
}

function createToggleButton() {
  let toggleBtn = document.getElementById('coachcat-zone-toggle');
  if (!toggleBtn) {
    toggleBtn = document.createElement('button');
    toggleBtn.id = 'coachcat-zone-toggle';
    toggleBtn.innerHTML = '📊';
    toggleBtn.title = 'Toggle Zone Distribution';
    toggleBtn.onclick = () => {
      const panel = document.getElementById('coachcat-zone-panel');
      if (panel) {
        panel.classList.toggle('hidden');
      } else if (window.__coachcatFetchZones) {
        window.__coachcatFetchZones();
      }
    };
    document.body.appendChild(toggleBtn);
  }
}

console.log('CoachCat Zone Extension - Content script loaded');
createToggleButton();
injectScript();
