import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import { MAIN_MIN_HEIGHT, MAIN_MIN_WIDTH } from './constants';
import { portFinder } from './lib/port-finder';
import { loadUserData, saveUserData } from './storage/user-data';

// This allows TypeScript to pick up the magic constants that's auto-generated by Forge's Webpack
// plugin that tells the Electron app where to look for the Webpack-bundled app code (depending on
// whether you're running in development or production).
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

function setupDevTools( mainWindow: BrowserWindow, devToolsOpen?: boolean ) {
	if ( devToolsOpen || ( process.env.NODE_ENV === 'development' && devToolsOpen === undefined ) ) {
		mainWindow?.webContents.openDevTools();
	}
}

function initializePortFinder( sites: SiteDetails[] ) {
	sites.forEach( ( site ) => {
		if ( site.port ) {
			portFinder.addUnavailablePort( site.port );
		}
	} );
}

export function createMainWindow(): BrowserWindow {
	const mainWindow = new BrowserWindow( {
		height: 800,
		width: 1200,
		backgroundColor: 'rgba(30, 30, 30, 1)',
		minHeight: MAIN_MIN_HEIGHT,
		minWidth: MAIN_MIN_WIDTH,
		webPreferences: {
			preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
		},
		...getOSWindowOptions(),
	} );

	mainWindow.loadURL( MAIN_WINDOW_WEBPACK_ENTRY );

	// Open the DevTools if the user had it open last time they used the app.
	// During development the dev tools default to open.
	loadUserData().then( ( { devToolsOpen, sites } ) => {
		setupDevTools( mainWindow, devToolsOpen );
		initializePortFinder( sites );
	} );

	mainWindow.webContents.on( 'devtools-opened', async () => {
		const data = await loadUserData();
		data.devToolsOpen = true;
		await saveUserData( data );
	} );

	mainWindow.webContents.on( 'devtools-closed', async () => {
		const data = await loadUserData();
		data.devToolsOpen = false;
		await saveUserData( data );
	} );

	return mainWindow;
}

function getOSWindowOptions(): Partial< BrowserWindowConstructorOptions > {
	switch ( process.platform ) {
		case 'darwin':
			return {
				frame: false,
				titleBarStyle: 'hidden',
				trafficLightPosition: { x: 20, y: 20 },
			};
		default:
			return {};
	}
}
