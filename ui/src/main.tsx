import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { loadBrowserDisplayPrefs, readInitialNativeDisplayPrefs } from './utils/displayPrefs';
import { applyDocumentTheme, detectBrowserSystemDark, resolveThemeId } from './utils/themes';

const nativeBootstrap = readInitialNativeDisplayPrefs();
const initialPrefs = nativeBootstrap ? nativeBootstrap.prefs : loadBrowserDisplayPrefs();
const initialSystemDark = nativeBootstrap ? nativeBootstrap.systemDark : detectBrowserSystemDark();
applyDocumentTheme(resolveThemeId(initialPrefs.theme, initialSystemDark), false);

createRoot(document.getElementById('root')!).render(<App />);
