import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Admin } from './pages/Admin.tsx';
import { Game } from './pages/Game.tsx';
import './styles.css';

const isAdmin = window.location.pathname.replace(/\/$/, '') === '/admin';

createRoot(document.getElementById('root')!).render(<StrictMode>{isAdmin ? <Admin /> : <Game />}</StrictMode>);
