import { app } from 'electron';
import { parse } from 'shell-quote';
import { executeWPCli } from '../../vendor/wp-now/src/execute-wp-cli';

type CommandAction = 'wp';
interface Command {
	action: CommandAction;
	args: string[];
	executed: boolean;
}

const STANDALONE_COMMANDS: [ CommandAction ] = [ 'wp' ];
const systemLog = console.log;
const systemError = console.error;
let cliCommand: Command;

export const isCLI = () => app.commandLine.hasSwitch( 'cli' );

export const getCLIDataForMainInstance = () => {
	if ( ! isCLI() ) {
		return {};
	}

	return { cliCommand: app.commandLine.getSwitchValue( 'cli' ) };
};

export const listenCLICommands = () => {
	app.on( 'second-instance', async ( event, commandLine, workingDirectory, additionalData ) => {
		const data = additionalData as { cliCommand: string };
		setCommand( data.cliCommand );
		await executeCLICommand();
	} );
};

export const processCLICommand = async ( {
	mainInstance,
	appBoot,
}: {
	mainInstance: boolean;
	appBoot?: () => Promise< void >;
} ) => {
	setCommand( app.commandLine.getSwitchValue( 'cli' ) );

	if ( STANDALONE_COMMANDS.includes( cliCommand.action ) ) {
		await executeCLICommand();
		app.quit();
	} else if ( mainInstance && appBoot ) {
		await appBoot();
	} else {
		app.quit();
	}
};

export const executeCLICommand = async () => {
	if ( ! cliCommand || cliCommand.executed ) {
		return false;
	}
	cliCommand.executed = true;

	await commands[ cliCommand.action ]?.();
	return true;
};

const commands = {
	wp: async () => {
		disableConsole();
		const { args } = cliCommand;
		const projectPath =
			args.find( ( arg ) => arg.startsWith( '--path=' ) )?.split( '=' )[ 1 ] || process.cwd();
		const argsSansPath = args.filter( ( arg ) => ! arg.startsWith( '--path=' ) );

		try {
			const result = await executeWPCli( projectPath, argsSansPath );
			if ( result.stderr ) {
				systemLog( result.stderr );
			}
			systemLog( result.stdout );
		} catch ( error ) {
			systemError( error );
		}
	},
};

const setCommand = ( command: string ) => {
	const [ action, ...args ] = parse( command );

	// The parsing of arguments can include shell operators like `>` or `||` that the app don't support.
	const isValidCommand = args.every(
		( arg: unknown ) => typeof arg === 'string' || arg instanceof String
	);
	if ( ! isValidCommand ) {
		throw Error( `Can't execute command: ${ command }` );
	}

	cliCommand = { action: action as CommandAction, args: args as string[], executed: false };
};

const disableConsole = () => {
	console.log = () => {
		// NOOP
	};
	console.error = () => {
		// NOOP
	};
	console.warn = () => {
		// NOOP
	};
	console.info = () => {
		// NOOP
	};
	console.debug = () => {
		// NOOP
	};
};
