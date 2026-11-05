import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PaperstreamEditor } from './Editor';

createRoot(document.getElementById('root')!).render(
  <StrictMode><PaperstreamEditor /></StrictMode>,
);
