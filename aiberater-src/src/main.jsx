import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './FinanzCoach.jsx';
import './index.css';

// Eingebettet in finanztracker. Auth + API-Keys kommen via window.AIB_PROPS,
// nicht via eigenen LoginScreen. Falls AIB_PROPS fehlt, mountet trotzdem —
// die App zeigt dann einen Hinweis-Screen.
//
// Mount-Strategie: finanztracker ruft `window.AIB.mount(props)` auf, wenn der
// Aktien-Tab aktiv wird. `window.AIB.unmount()` cleanup. `window.AIB.updateProps()`
// für nachträgliche Token-Refreshes.

let root = null;
let currentProps = {};

function getMountTarget() {
  return document.getElementById('aiberater-root');
}

function readPropsFromWindow() {
  const p = window.AIB_PROPS || {};
  return {
    adminUrl: p.adminUrl || '',
    token: p.token || '',
    username: p.username || '',
    apiKey: p.apiKey || '',
    finnhubKey: p.finnhubKey || '',
  };
}

function render() {
  const target = getMountTarget();
  if (!target) return;
  if (!root) root = ReactDOM.createRoot(target);
  root.render(
    <React.StrictMode>
      <App {...currentProps} />
    </React.StrictMode>
  );
}

window.AIB = {
  mount(props) {
    currentProps = { ...readPropsFromWindow(), embedded: true, ...(props || {}) };
    render();
  },
  updateProps(props) {
    currentProps = { ...currentProps, ...(props || {}) };
    render();
  },
  unmount() {
    if (root) {
      try { root.unmount(); } catch {}
      root = null;
    }
  },
};

// Auto-Mount falls window.AIB_PROPS schon gesetzt ist UND der Container
// existiert (z.B. bei sofortiger Tab-Aktivierung nach Bundle-Load).
if (typeof window !== 'undefined' && getMountTarget() && window.AIB_PROPS) {
  window.AIB.mount();
}
