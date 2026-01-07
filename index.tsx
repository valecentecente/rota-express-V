
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Checkpoint de Segurança: 2024-05-25 00:15 - Estabilidade Garantida V12.1 - Correção Busca Vercel (Grounding ToolConfig)