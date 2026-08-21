import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './app/theme'; // applies the persisted/preferred theme before first paint
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
