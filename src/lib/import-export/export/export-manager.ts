import fsPromises from 'fs/promises';
import path from 'node:path';
import { ImportExportEventData, handleEvents } from '../types';
import { ExportValidatorEvents, ExporterEvents } from './events';
import { DefaultExporter, SqlExporter } from './exporters';
import { ExportOptions, ExporterOption } from './types';
import { WordPressExportValidator } from './validators/wordpress-validator';

export async function exportBackup(
	exportOptions: ExportOptions,
	onEvent: ( data: ImportExportEventData ) => void,
	options: ExporterOption[] = defaultExporterOptions
): Promise< void > {
	const directoryContents = await fsPromises.readdir( exportOptions.sitePath, {
		recursive: true,
		withFileTypes: true,
	} );
	const allFiles = directoryContents.reduce< string[] >( ( files: string[], directoryContent ) => {
		if ( directoryContent.isFile() ) {
			files.push( path.join( directoryContent.path, directoryContent.name ) );
		}
		return files;
	}, [] );

	for ( const { validator, exporter } of options ) {
		if ( validator.canHandle( allFiles ) ) {
			handleEvents( validator, onEvent, ExportValidatorEvents );
			const backupContents = validator.filterFiles( allFiles, exportOptions );
			const ExporterClass = exporter;
			const exporterInstance = new ExporterClass( backupContents );
			handleEvents( exporterInstance, onEvent, ExporterEvents );
			await exporterInstance.export( exportOptions );
			break;
		}
	}
}

export const defaultExporterOptions: ExporterOption[] = [
	{ validator: new WordPressExportValidator(), exporter: DefaultExporter },
	{ validator: new WordPressExportValidator(), exporter: SqlExporter },
];