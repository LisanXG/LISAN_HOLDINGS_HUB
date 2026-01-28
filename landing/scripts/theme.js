/**
 * LISAN HOLDINGS - Theme Controller
 * Handles time-based auto-switching and manual toggle with localStorage persistence
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'lisan-theme-preference';
    const STORAGE_MANUAL_KEY = 'lisan-theme-manual';

    // Time boundaries for auto-switching (24hr format)
    const LIGHT_START = 6;  // 6 AM
    const LIGHT_END = 18;   // 6 PM

    /**
     * Get the appropriate theme based on current time
     */
    function getTimeBasedTheme() {
        const hour = new Date().getHours();
        return (hour >= LIGHT_START && hour < LIGHT_END) ? 'light' : 'dark';
    }

    /**
     * Apply theme to document
     */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        
        // Dispatch custom event for WebGL engines to listen to
        window.dispatchEvent(new CustomEvent('themechange', { 
            detail: { theme } 
        }));
    }

    /**
     * Get current theme preference
     * Priority: Manual override > Time-based
     */
    function getCurrentTheme() {
        const isManual = localStorage.getItem(STORAGE_MANUAL_KEY) === 'true';
        
        if (isManual) {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved === 'light' || saved === 'dark') {
                return saved;
            }
        }
        
        return getTimeBasedTheme();
    }

    /**
     * Toggle between light and dark mode (manual override)
     */
    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'light' ? 'dark' : 'light';
        
        // Mark as manual override
        localStorage.setItem(STORAGE_MANUAL_KEY, 'true');
        localStorage.setItem(STORAGE_KEY, next);
        
        applyTheme(next);
    }

    /**
     * Reset to auto mode (time-based)
     */
    function resetToAuto() {
        localStorage.removeItem(STORAGE_MANUAL_KEY);
        localStorage.removeItem(STORAGE_KEY);
        applyTheme(getTimeBasedTheme());
    }

    /**
     * Initialize theme on page load
     */
    function init() {
        // Apply theme immediately to prevent flash
        applyTheme(getCurrentTheme());

        // Set up toggle button listener
        document.addEventListener('DOMContentLoaded', () => {
            const toggleBtn = document.querySelector('.theme-toggle');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', toggleTheme);
                
                // Double-click to reset to auto
                toggleBtn.addEventListener('dblclick', (e) => {
                    e.preventDefault();
                    resetToAuto();
                });
            }
        });

        // Check every minute if we should auto-switch (only if not manual)
        setInterval(() => {
            const isManual = localStorage.getItem(STORAGE_MANUAL_KEY) === 'true';
            if (!isManual) {
                const timeTheme = getTimeBasedTheme();
                const current = document.documentElement.getAttribute('data-theme');
                if (timeTheme !== current) {
                    applyTheme(timeTheme);
                }
            }
        }, 60000); // Check every minute
    }

    // Run immediately
    init();

    // Expose API for external use
    window.LisanTheme = {
        toggle: toggleTheme,
        resetToAuto: resetToAuto,
        getCurrent: () => document.documentElement.getAttribute('data-theme'),
        isManual: () => localStorage.getItem(STORAGE_MANUAL_KEY) === 'true'
    };

})();
