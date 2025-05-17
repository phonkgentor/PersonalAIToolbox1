document.addEventListener('DOMContentLoaded', function() {
    // Initialize tabs based on URL hash
    const hash = window.location.hash;
    if (hash) {
        const tabId = `${hash.substring(1)}-tab`;
        const tab = document.querySelector(`[data-bs-target="#${tabId}"]`);
        if (tab) {
            const bsTab = new bootstrap.Tab(tab);
            bsTab.show();
        }
    }

    // Update URL hash when tab changes
    const tabs = document.querySelectorAll('[data-bs-toggle="tab"]');
    tabs.forEach(tab => {
        tab.addEventListener('shown.bs.tab', function(event) {
            const targetId = event.target.getAttribute('data-bs-target');
            if (targetId) {
                const hash = targetId.split('-tab')[0];
                history.replaceState(null, null, hash);
            }
        });
    });

    // Global helper functions
    window.formatTimestamp = function(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        const parts = [];
        if (hrs > 0) {
            parts.push(String(hrs).padStart(2, '0'));
        }
        parts.push(String(mins).padStart(2, '0'));
        parts.push(String(secs).padStart(2, '0'));
        
        return parts.join(':');
    };

    window.showError = function(element, message) {
        element.textContent = message;
        element.classList.remove('d-none');
    };

    window.hideError = function(element) {
        element.classList.add('d-none');
    };

    window.generateUUID = function() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };
});
