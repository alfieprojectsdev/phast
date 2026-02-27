// Row Click Toggle Content Script
// Runs in ISOLATED world

(() => {
    'use strict';
    const TABLE_SELECTOR = 'table.items';

    const attachToTable = (table) => {
        if (!table || table.__rowClickInit) return;
        table.__rowClickInit = true;
        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        // Delegated click handler for rows
        tbody.addEventListener('click', (e) => {
            // Ignore clicks on direct interactive elements
            if (e.target.matches('a, button, input, select, textarea, label') || e.target.closest('a, button, input, select, textarea, label')) return;

            const tr = e.target.closest('tr');
            if (!tr) return;

            const cb = tr.querySelector('input[type="checkbox"]');
            if (cb) {
                cb.click(); // Use click() to trigger native change events
            }
        }, false);
    };

    const init = (root) => {
        try {
            const tables = (root || document).querySelectorAll(TABLE_SELECTOR);
            if (tables) tables.forEach(attachToTable);
        } catch (e) { /* ignore errors on unexpected pages */ }
    };

    // initial
    init(document);

    // observe DOM for added tables
    const docObserver = new MutationObserver((muts) => {
        muts.forEach((mut) => {
            mut.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;
                if (node.matches && node.matches(TABLE_SELECTOR)) attachToTable(node);
                else if (node.querySelectorAll && node.querySelectorAll(TABLE_SELECTOR).length) init(node);
            });
        });
    });
    docObserver.observe(document.documentElement || document, { childList: true, subtree: true });

    console.log('PHAST Row Click Enhancer Active');
})();
