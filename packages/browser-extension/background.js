/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/* global chrome, WebSocket, console, setTimeout, window, document */
/* eslint-env browser, webextensions */
// Background script for Gemini Actus Browser Controller
// Connects to the local agent via WebSocket and executes commands.

let socket = null;
let currentDebuggerTarget = null;
const RETRY_INTERVAL = 5000;
const AGENT_URL = 'ws://127.0.0.1:41243'; // Port for the agent's browser control server

function connect() {
  if (socket) return;

  console.log('Attempting to connect to agent at', AGENT_URL);
  socket = new WebSocket(AGENT_URL);

  socket.onopen = () => {
    console.log('Connected to agent');
    // Send a hello message
    socket.send(
      JSON.stringify({ type: 'hello', content: 'Browser Extension Connected' }),
    );
    updateIcon('on');
  };

  socket.onmessage = async (event) => {
    console.log('Received message:', event.data);
    try {
      const message = JSON.parse(event.data);
      handleMessage(message);
    } catch (e) {
      console.error('Error parsing message:', e);
    }
  };

  socket.onclose = () => {
    console.log('Disconnected from agent');
    socket = null;
    updateIcon('off');

    if (currentDebuggerTarget) {
      chrome.debugger
        .detach(currentDebuggerTarget)
        .catch((e) => console.warn('Detach on close failed:', e));
      currentDebuggerTarget = null;
    }

    setTimeout(connect, RETRY_INTERVAL);
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
    if (socket) {
      socket.close();
    }
  };
}

function updateIcon(state) {
  if (state === 'on') {
    chrome.action.setBadgeText({ text: 'OK' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' }); // Green
  } else {
    chrome.action.setBadgeText({ text: '' }); // Clear badge
  }
}

async function handleMessage(message) {
  const { id, command, params } = message;
  let result = null;
  let error = null;

  try {
    switch (command) {
      case 'open_url':
        result = await openUrl(params);
        break;
      case 'click':
        result = await click(params);
        break;
      case 'type':
        result = await type(params);
        break;
      case 'scroll':
        result = await scroll(params);
        break;
      case 'get_html':
        result = await getHtml(params);
        break;
      case 'get_screenshot':
        result = await getScreenshot(params);
        break;
      case 'execute_script':
        result = await executeScript(params);
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (e) {
    error = e.message;
  }

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        id,
        result,
        error,
      }),
    );
  }
}

// --- Action Implementations ---

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (tabs.length === 0) {
    // Fallback to any active tab if window focus is lost (e.g. debugging)
    const allTabs = await chrome.tabs.query({ active: true });
    if (allTabs.length > 0) return allTabs[0];
    throw new Error('No active tab found');
  }
  return tabs[0];
}

async function openUrl({ url }) {
  const tab = await getActiveTab();
  await chrome.tabs.update(tab.id, { url });
  // Wait for load?
  return new Promise((resolve) => {
    const listener = (tabId, changeInfo) => {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve({ success: true });
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sendDebuggerCommand(target, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

async function attachDebugger(tabId) {
  const target = { tabId };

  // Detach all other debugger sessions to ensure only one is active at a time
  try {
    const targets = await chrome.debugger.getTargets();
    for (const t of targets) {
      if (t.attached && t.tabId && t.tabId !== tabId) {
        try {
          await chrome.debugger.detach({ tabId: t.tabId });
        } catch (e) {
          console.warn('Failed to detach other target:', t.tabId, e);
        }
      }
    }
  } catch (e) {
    console.warn('Failed to get debugger targets:', e);
  }

  currentDebuggerTarget = target;

  try {
    await chrome.debugger.attach(target, '1.3');
  } catch (e) {
    const msg = e.message || String(e);
    // Ignore if already attached (error message from Chrome is usually like "Another debugger is already attached...")
    if (!msg.toLowerCase().includes('already attached')) {
      throw e;
    }
  }
  return target;
}

async function click({ x, y, selector }) {
  const tab = await getActiveTab();
  const target = await attachDebugger(tab.id);

  if (selector) {
    // Find element center using DOM
    const {
      root: { nodeId: documentNodeId },
    } = await sendDebuggerCommand(target, 'DOM.getDocument');
    const { nodeId } = await sendDebuggerCommand(target, 'DOM.querySelector', {
      nodeId: documentNodeId,
      selector,
    });
    if (!nodeId) throw new Error(`Element not found: ${selector}`);

    const { model } = await sendDebuggerCommand(target, 'DOM.getBoxModel', {
      nodeId,
    });
    const [x1, y1, , , x3, y3] = model.content;
    x = (x1 + x3) / 2;
    y = (y1 + y3) / 2;
  }

  if (x === undefined || y === undefined)
    throw new Error('Click requires x,y or selector');

  await sendDebuggerCommand(target, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await sendDebuggerCommand(target, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });

  return { success: true };
}

async function type({ text }) {
  const tab = await getActiveTab();
  const target = await attachDebugger(tab.id);

  for (const char of text) {
    await sendDebuggerCommand(target, 'Input.dispatchKeyEvent', {
      type: 'char',
      text: char,
    });
  }
  return { success: true };
}

async function scroll({ delta_x, delta_y }) {
  const tab = await getActiveTab(); // We can use scripting for simple scroll
  // Or Input.dispatchMouseEvent with wheel
  // Let's use scripting for now as it's easier to verify effect?
  // Actually, Input.dispatchMouseEvent wheel is better for "human-like" interaction if needed,
  // but scripting is more reliable for "scroll by amount".

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (dx, dy) => window.scrollBy(dx, dy),
    args: [delta_x || 0, delta_y || 0],
  });

  return { success: true };
}

async function getHtml() {
  const tab = await getActiveTab();
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.documentElement.outerHTML,
  });
  return { html: result[0].result };
}

async function getScreenshot() {
  const tab = await getActiveTab();
  // chrome.tabs.captureVisibleTab is easier but requires <all_urls> or activeTab
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'jpeg',
    quality: 80,
  });
  // Remove "data:image/jpeg;base64," prefix
  const base64 = dataUrl.split(',')[1];
  return { base64 };
}

async function executeScript({ script }) {
  const tab = await getActiveTab();
  const target = await attachDebugger(tab.id);

  const response = await sendDebuggerCommand(target, 'Runtime.evaluate', {
    expression: script,
    returnByValue: true,
    awaitPromise: true,
  });

  if (response.exceptionDetails) {
    throw new Error(
      `Script error: ${response.exceptionDetails.exception?.description || 'Unknown error'}`,
    );
  }

  // The result might be a string, number, or object.
  // We can convert to JSON string or return the value.
  const value = response.result?.value;
  let scriptResult = value;

  if (typeof value !== 'string') {
    scriptResult = JSON.stringify(value);
  }

  return { scriptResult };
}

// Start connection
connect();

// Keep alive alarm (MV3 Service Worker goes to sleep after 30s)
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.log(
        'Alarm woke up service worker, checking socket connection...',
      );
      connect();
    }
  }
});

// Allow manual wake-up/connect by clicking the extension icon
chrome.action.onClicked.addListener(() => {
  console.log('Extension icon clicked, triggering reconnect...');
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    if (socket) {
      socket.close();
      socket = null;
    }
    connect();
  }
});
