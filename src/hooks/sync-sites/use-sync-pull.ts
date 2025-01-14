import * as Sentry from '@sentry/electron/renderer';
import { sprintf } from '@wordpress/i18n';
import { useI18n } from '@wordpress/react-i18n';
import { useCallback, useEffect, useMemo } from 'react';
import { getIpcApi } from '../../lib/get-ipc-api';
import { useAuth } from '../use-auth';
import { useImportExport } from '../use-import-export';
import { useSiteDetails } from '../use-site-details';
import { useSyncStatesProgressInfo, PullStateProgressInfo } from '../use-sync-states-progress-info';
import {
	ClearState,
	generateStateId,
	GetState,
	UpdateState,
	usePullPushStates,
} from './use-pull-push-states';
import type { SyncSite } from '../use-fetch-wpcom-sites/types';

export type SyncBackupState = {
	remoteSiteId: number;
	backupId: string | null;
	status: PullStateProgressInfo;
	downloadUrl: string | null;
	selectedSite: SiteDetails;
	isStaging: boolean;
};

export type PullStates = Record< string, SyncBackupState >;
type OnPullSuccess = ( siteId: number, localSiteId: string ) => void;
type PullSite = ( connectedSite: SyncSite, selectedSite: SiteDetails ) => void;
type IsSiteIdPulling = ( selectedSiteId: string, remoteSiteId?: number ) => boolean;

type UseSyncPullProps = {
	pullStates: PullStates;
	setPullStates: React.Dispatch< React.SetStateAction< PullStates > >;
	onPullSuccess?: OnPullSuccess;
};

export type UseSyncPull = {
	pullStates: PullStates;
	getPullState: GetState< SyncBackupState >;
	pullSite: PullSite;
	isAnySitePulling: boolean;
	isSiteIdPulling: IsSiteIdPulling;
	clearPullState: ClearState;
};

export function useSyncPull( {
	pullStates,
	setPullStates,
	onPullSuccess,
}: UseSyncPullProps ): UseSyncPull {
	const { __ } = useI18n();
	const { client } = useAuth();
	const { importFile, clearImportState } = useImportExport();
	const { pullStatesProgressInfo, isKeyPulling, isKeyFinished, isKeyFailed } =
		useSyncStatesProgressInfo();
	const {
		updateState,
		getState: getPullState,
		clearState,
	} = usePullPushStates< SyncBackupState >( pullStates, setPullStates );

	const updatePullState = useCallback< UpdateState< SyncBackupState > >(
		( selectedSiteId, remoteSiteId, state ) => {
			updateState( selectedSiteId, remoteSiteId, state );
			const statusKey = state.status?.key;

			if ( isKeyFailed( statusKey ) || isKeyFinished( statusKey ) ) {
				getIpcApi().clearSyncOperation( generateStateId( selectedSiteId, remoteSiteId ) );
			} else {
				getIpcApi().addSyncOperation( generateStateId( selectedSiteId, remoteSiteId ) );
			}
		},
		[ isKeyFailed, isKeyFinished, updateState ]
	);

	const clearPullState = useCallback< ClearState >(
		( selectedSiteId, remoteSiteId ) => {
			clearState( selectedSiteId, remoteSiteId );
			getIpcApi().clearSyncOperation( generateStateId( selectedSiteId, remoteSiteId ) );
		},
		[ clearState ]
	);

	const { startServer } = useSiteDetails();

	const pullSite = useCallback< PullSite >(
		async ( connectedSite, selectedSite ) => {
			if ( ! client ) {
				return;
			}
			const remoteSiteId = connectedSite.id;
			updatePullState( selectedSite.id, remoteSiteId, {
				backupId: null,
				status: pullStatesProgressInfo[ 'in-progress' ],
				downloadUrl: null,
				remoteSiteId,
				selectedSite,
				isStaging: connectedSite.isStaging,
			} );

			try {
				const response = await client.req.post< { success: boolean; backup_id: string } >( {
					path: `/sites/${ remoteSiteId }/studio-app/sync/backup`,
					apiNamespace: 'wpcom/v2',
				} );

				if ( response.success ) {
					updatePullState( selectedSite.id, remoteSiteId, {
						backupId: response.backup_id,
					} );
				} else {
					console.error( response );
					throw new Error( 'Pull request failed' );
				}
			} catch ( error ) {
				Sentry.captureException( error );
				updatePullState( selectedSite.id, remoteSiteId, {
					status: pullStatesProgressInfo.failed,
				} );
				getIpcApi().showErrorMessageBox( {
					title: sprintf( __( 'Error pulling from %s' ), connectedSite.name ),
					message: __( 'Studio was unable to connect to WordPress.com. Please try again.' ),
				} );
			}
		},
		[ __, client, pullStatesProgressInfo, updatePullState ]
	);

	const onBackupCompleted = useCallback(
		async ( remoteSiteId: number, backupState: SyncBackupState & { downloadUrl: string } ) => {
			const { downloadUrl, selectedSite, isStaging } = backupState;
			updatePullState( selectedSite.id, remoteSiteId, {
				status: pullStatesProgressInfo.downloading,
				downloadUrl,
			} );

			const filePath = await getIpcApi().downloadSyncBackup( remoteSiteId, downloadUrl );

			updatePullState( selectedSite.id, remoteSiteId, {
				status: pullStatesProgressInfo.importing,
			} );

			await importFile(
				{
					path: filePath,
					type: 'application/tar+gzip',
				},
				selectedSite,
				{ showImportNotification: false }
			);

			await getIpcApi().removeSyncBackup( remoteSiteId );

			await startServer( selectedSite.id );

			clearImportState( selectedSite.id );

			getIpcApi().showNotification( {
				title: selectedSite.name,
				body: isStaging
					? __( 'Studio site updated from Staging' )
					: __( 'Studio site updated from Production' ),
			} );

			updatePullState( selectedSite.id, remoteSiteId, {
				status: pullStatesProgressInfo.finished,
			} );
			onPullSuccess?.( remoteSiteId, selectedSite.id );
		},
		[
			__,
			clearImportState,
			importFile,
			onPullSuccess,
			pullStatesProgressInfo.downloading,
			pullStatesProgressInfo.finished,
			pullStatesProgressInfo.importing,
			startServer,
			updatePullState,
		]
	);

	const fetchAndUpdateBackup = useCallback(
		async ( remoteSiteId: number, selectedSiteId: string ) => {
			if ( ! client ) {
				return;
			}
			const backupId = getPullState( selectedSiteId, remoteSiteId )?.backupId;
			if ( ! backupId ) {
				console.error( 'No backup ID found' );
				return;
			}
			const response = await client.req.get< {
				status: 'in-progress' | 'finished' | 'failed';
				download_url: string;
			} >( `/sites/${ remoteSiteId }/studio-app/sync/backup`, {
				apiNamespace: 'wpcom/v2',
				backup_id: backupId,
			} );

			const hasBackupCompleted = response.status === 'finished';
			const frontendStatus = hasBackupCompleted
				? pullStatesProgressInfo.downloading.key
				: response.status;
			const statusWithProgress =
				pullStatesProgressInfo[ frontendStatus ] || pullStatesProgressInfo.failed;
			const downloadUrl = hasBackupCompleted ? response.download_url : null;

			if ( hasBackupCompleted && downloadUrl ) {
				// Replacing the 'in-progress' status will stop the active listening for the backup completion
				const backupState = getPullState( selectedSiteId, remoteSiteId );
				if ( backupState ) {
					onBackupCompleted( remoteSiteId, {
						...backupState,
						downloadUrl,
					} );
				}
			} else {
				updatePullState( selectedSiteId, remoteSiteId, {
					status: statusWithProgress,
					downloadUrl,
				} );
			}
		},
		[ client, getPullState, onBackupCompleted, pullStatesProgressInfo, updatePullState ]
	);

	useEffect( () => {
		const intervals: Record< string, NodeJS.Timeout > = {};

		Object.entries( pullStates ).forEach( ( [ key, state ] ) => {
			if ( state.backupId && state.status.key === 'in-progress' ) {
				intervals[ key ] = setTimeout( () => {
					fetchAndUpdateBackup( state.remoteSiteId, state.selectedSite.id );
				}, 2000 );
			}
		} );

		return () => {
			Object.values( intervals ).forEach( clearTimeout );
		};
	}, [ pullStates, fetchAndUpdateBackup ] );

	const isAnySitePulling = useMemo< boolean >( () => {
		return Object.values( pullStates ).some( ( state ) => isKeyPulling( state.status.key ) );
	}, [ pullStates, isKeyPulling ] );

	const isSiteIdPulling = useCallback< IsSiteIdPulling >(
		( selectedSiteId, remoteSiteId ) => {
			return Object.values( pullStates ).some( ( state ) => {
				if ( state.selectedSite.id !== selectedSiteId ) {
					return false;
				}
				if ( remoteSiteId !== undefined ) {
					return isKeyPulling( state.status.key ) && state.remoteSiteId === remoteSiteId;
				}
				return isKeyPulling( state.status.key );
			} );
		},
		[ pullStates, isKeyPulling ]
	);

	return { pullStates, getPullState, pullSite, isAnySitePulling, isSiteIdPulling, clearPullState };
}
