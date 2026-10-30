/**
 * Side panel rescan rules (src/lib/panel-tab.js).
 * Run: node --test tests/panel-tab.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { panelAction } from '../src/lib/panel-tab.js';

const WIN = 1;
const OTHER_WIN = 2;

describe('panelAction', () => {
    test('switching to another tab rescans', () => {
        assert.equal(panelAction(10, { type: 'activated', tabId: 11, windowId: WIN }, WIN), 'rescan');
    });

    test('re-activating the tab already shown does nothing', () => {
        assert.equal(panelAction(10, { type: 'activated', tabId: 10, windowId: WIN }, WIN), 'ignore');
    });

    test('the first activation after the panel opens rescans', () => {
        assert.equal(panelAction(null, { type: 'activated', tabId: 10, windowId: WIN }, WIN), 'rescan');
    });

    test('the active page starting to load clears the panel', () => {
        const event = { type: 'updated', tabId: 10, windowId: WIN, active: true, status: 'loading' };
        assert.equal(panelAction(10, event, WIN), 'clear');
    });

    test('the active page finishing loading rescans', () => {
        const event = { type: 'updated', tabId: 10, windowId: WIN, active: true, status: 'complete' };
        assert.equal(panelAction(10, event, WIN), 'rescan');
    });

    test('a background tab loading is ignored', () => {
        const event = { type: 'updated', tabId: 12, windowId: WIN, active: false, status: 'complete' };
        assert.equal(panelAction(10, event, WIN), 'ignore');
    });

    test('updates without a status (title, favicon) are ignored', () => {
        const event = { type: 'updated', tabId: 10, windowId: WIN, active: true };
        assert.equal(panelAction(10, event, WIN), 'ignore');
    });

    test("another window's tabs are ignored", () => {
        assert.equal(panelAction(10, { type: 'activated', tabId: 20, windowId: OTHER_WIN }, WIN), 'ignore');
        const event = { type: 'updated', tabId: 20, windowId: OTHER_WIN, active: true, status: 'complete' };
        assert.equal(panelAction(10, event, WIN), 'ignore');
    });

    test('nothing happens before the panel knows its window', () => {
        assert.equal(panelAction(null, { type: 'activated', tabId: 10, windowId: WIN }, null), 'ignore');
    });
});
