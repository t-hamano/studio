import { Icon } from '@wordpress/components';
import { createInterpolateElement } from '@wordpress/element';
import { sprintf } from '@wordpress/i18n';
import { cloudUpload, cloudDownload } from '@wordpress/icons';
import { useI18n } from '@wordpress/react-i18n';
import { useMemo } from 'react';
import { STUDIO_DOCS_URL_GET_HELP_UNSUPPORTED_SITES } from '../constants';
import { useSyncSites } from '../hooks/sync-sites';
import { useConfirmationDialog } from '../hooks/use-confirmation-dialog';
import { useOffline } from '../hooks/use-offline';
import { useSyncStatesProgressInfo } from '../hooks/use-sync-states-progress-info';
import { cx } from '../lib/cx';
import { getIpcApi } from '../lib/get-ipc-api';
import { ArrowIcon } from './arrow-icon';
import { Badge } from './badge';
import Button from './button';
import { OpenSitesSyncSelector } from './content-tab-sync';
import { CircleRedCrossIcon } from './icons/circle-red-cross';
import offlineIcon from './offline-icon';
import ProgressBar from './progress-bar';
import { SyncPullPushClear } from './sync-pull-push-clear';
import { Tooltip, DynamicTooltip } from './tooltip';
import { WordPressLogoCircle } from './wordpress-logo-circle';
import type { SyncSite } from '../hooks/use-fetch-wpcom-sites/types';

interface ConnectedSiteSection {
	id: number;
	name: string;
	provider: 'wpcom';
	connectedSites: SyncSite[];
}

const SyncConnectedSitesSection = ( {
	section,
	disconnectSite,
	selectedSite,
	openSitesSyncSelector,
}: {
	section: ConnectedSiteSection;
	disconnectSite: ( id: number ) => void;
	selectedSite: SiteDetails;
	openSitesSyncSelector: OpenSitesSyncSelector;
} ) => {
	const { __ } = useI18n();
	const {
		pullSite,
		clearPullState,
		getPullState,
		isAnySitePulling,
		isAnySitePushing,
		pushSite,
		getPushState,
		clearPushState,
		isSiteIdPulling,
		isSiteIdPushing,
		getLastSyncTimeText,
		connectedSites,
	} = useSyncSites();
	const { isKeyPulling, isKeyPushing, isKeyFinished, isKeyFailed } = useSyncStatesProgressInfo();
	const isOffline = useOffline();
	const isAnyConnectedSiteSyncing = connectedSites.some(
		( site ) =>
			isSiteIdPulling( selectedSite.id, site.id ) || isSiteIdPushing( selectedSite.id, site.id )
	);
	const isAnySiteSyncing = isAnySitePulling || isAnySitePushing;
	const showPushStagingConfirmation = useConfirmationDialog( {
		localStorageKey: 'dontShowPushConfirmation',
		message: __( 'Overwrite Staging site' ),
		detail: __(
			'Pushing will replace the existing files and database with a copy from your local site.\n\n The staging site will be backed-up before any changes are applied.'
		),
		confirmButtonLabel: __( 'Push' ),
	} );
	const showPushProductionConfirmation = useConfirmationDialog( {
		localStorageKey: 'dontShowPushConfirmation',
		message: __( 'Overwrite Production site' ),
		detail: __(
			'Pushing will replace the existing files and database with a copy from your local site.\n\n The production site will be backed-up before any changes are applied.'
		),
		confirmButtonLabel: __( 'Push' ),
	} );

	const showPullConfirmation = useConfirmationDialog( {
		localStorageKey: 'dontShowPullConfirmation',
		message: __( 'Overwrite Studio site' ),
		confirmButtonLabel: __( 'Pull' ),
	} );

	const handleDisconnectSite = async () => {
		const dontShowDisconnectWarning = localStorage.getItem( 'dontShowDisconnectWarning' );
		if ( ! dontShowDisconnectWarning ) {
			const CANCEL_BUTTON_INDEX = 1;
			const DISCONNECT_BUTTON_INDEX = 0;

			const disconnectMessage = section.name
				? sprintf( __( 'Disconnect %s' ), section.name )
				: __( 'Disconnect site' );

			const { response, checkboxChecked } = await getIpcApi().showMessageBox( {
				message: disconnectMessage,
				detail: __(
					'Your WordPress.com site will not be affected by disconnecting it from Studio.'
				),
				buttons: [ __( 'Disconnect' ), __( 'Cancel' ) ],
				cancelId: CANCEL_BUTTON_INDEX,
				checkboxLabel: __( "Don't ask again" ),
			} );

			if ( response === DISCONNECT_BUTTON_INDEX ) {
				if ( checkboxChecked ) {
					localStorage.setItem( 'dontShowDisconnectWarning', 'true' );
				}
				disconnectSite( section.id );
				section.connectedSites.forEach( ( connectedSite ) => {
					clearPullState( selectedSite.id, connectedSite.id );
				} );
			}
		} else {
			disconnectSite( section.id );
		}
	};

	const handlePushSite = async ( connectedSite: SyncSite ) => {
		if ( connectedSite.isStaging ) {
			showPushStagingConfirmation( () => {
				pushSite( connectedSite, selectedSite );
			} );
		} else {
			showPushProductionConfirmation( () => {
				pushSite( connectedSite, selectedSite );
			} );
		}
	};

	const mainSite = section.connectedSites.find( ( item ) => ! item.isStaging );
	const hasConnectionErrors = mainSite?.syncSupport !== 'already-connected';
	const isPulling = section.connectedSites.some( ( site ) =>
		isSiteIdPulling( selectedSite.id, site.id )
	);
	const isPushing = section.connectedSites.some( ( site ) =>
		isSiteIdPushing( selectedSite.id, site.id )
	);

	return (
		<div key={ section.id } className="flex flex-col gap-2 mb-6">
			<div className="flex items-center gap-2 py-2.5 border-b border-a8c-gray-0 px-8">
				{ hasConnectionErrors ? <CircleRedCrossIcon /> : <WordPressLogoCircle /> }
				<div className={ cx( 'a8c-label-semibold', hasConnectionErrors && 'error-message' ) }>
					{ section.name }
				</div>
				<div className="!ml-auto">
					<Tooltip
						text={ __(
							'This site is syncing. Please wait for the sync to finish before you can disconnect it.'
						) }
						disabled={ ! ( isPulling || isPushing ) || isOffline }
						placement="top-start"
					>
						<Button
							variant="link"
							className={ cx(
								! isPulling && ! isPushing ? '!text-a8c-gray-70 hover:!text-a8c-red-50' : ''
							) }
							onClick={ handleDisconnectSite }
							disabled={ isPulling || isPushing }
						>
							{ __( 'Disconnect' ) }
						</Button>
					</Tooltip>
				</div>
			</div>

			{ hasConnectionErrors && (
				<div className="flex items-center min-h-14 border-b border-a8c-gray-0 px-8">
					<div className="text-[#3C434A]">
						{ createInterpolateElement(
							__( "Studio couldn't connect to this site. <button>Get help ↗️</button>" ),
							{
								button: (
									<Button
										variant="link"
										onClick={ () =>
											getIpcApi().openURL( STUDIO_DOCS_URL_GET_HELP_UNSUPPORTED_SITES )
										}
									/>
								),
							}
						) }
					</div>
					<Button
						onClick={ () => openSitesSyncSelector( { disconnectSiteId: section.id } ) }
						variant="primary"
						className="ml-auto"
					>
						{ __( 'Reconnect' ) }
					</Button>
				</div>
			) }

			{ ! hasConnectionErrors &&
				section.connectedSites.map( ( connectedSite ) => {
					const sitePullState = getPullState( selectedSite.id, connectedSite.id );
					const isPulling = sitePullState && isKeyPulling( sitePullState.status.key );
					const isPullError = sitePullState && isKeyFailed( sitePullState.status.key );
					const hasPullFinished = sitePullState && isKeyFinished( sitePullState.status.key );

					const pushState = getPushState( selectedSite.id, connectedSite.id );
					const isPushing = pushState && isKeyPushing( pushState.status.key );
					const isPushError = pushState && isKeyFailed( pushState.status.key );
					const hasPushFinished = pushState && isKeyFinished( pushState.status.key );

					return (
						<div
							key={ connectedSite.id }
							className="flex items-center gap-2 min-h-14 border-b border-a8c-gray-0 px-8"
						>
							<div className="flex items-left min-w-20 mr-6 shrink-0">
								{ connectedSite.isStaging ? (
									<Badge>{ __( 'Staging' ) }</Badge>
								) : (
									<Badge className="bg-a8c-green-5 text-a8c-green-80">{ __( 'Production' ) }</Badge>
								) }
							</div>

							<Tooltip text={ connectedSite.url } className="overflow-hidden">
								<Button
									variant="link"
									className="!text-a8c-gray-70 hover:!text-a8c-blueberry max-w-[100%]"
									onClick={ () => {
										getIpcApi().openURL( connectedSite.url );
									} }
								>
									<span className="truncate">{ connectedSite.url }</span> <ArrowIcon />
								</Button>
							</Tooltip>
							<div className="flex gap-2 pl-4 ml-auto shrink-0">
								{ isPulling && (
									<div className="flex flex-col gap-2 min-w-44">
										<div className="a8c-body-small">{ sitePullState.status.message }</div>
										<ProgressBar value={ sitePullState.status.progress } maxValue={ 100 } />
									</div>
								) }
								{ isPullError && (
									<SyncPullPushClear
										onClick={ () => clearPullState( selectedSite.id, connectedSite.id ) }
										isError
									>
										{ __( 'Error pulling changes' ) }
									</SyncPullPushClear>
								) }
								{ isPushError && (
									<SyncPullPushClear
										onClick={ () => clearPushState( selectedSite.id, connectedSite.id ) }
										isError
									>
										{ __( 'Error pushing changes' ) }
									</SyncPullPushClear>
								) }
								{ hasPullFinished && (
									<SyncPullPushClear
										onClick={ () => clearPullState( selectedSite.id, connectedSite.id ) }
									>
										{ __( 'Pull complete' ) }
									</SyncPullPushClear>
								) }
								{ pushState?.status && isPushing && (
									<div className="flex flex-col gap-2 min-w-44">
										<div className="a8c-body-small">{ pushState.status.message }</div>
										<ProgressBar value={ pushState.status.progress } maxValue={ 100 } />
									</div>
								) }

								{ pushState?.status && hasPushFinished && (
									<SyncPullPushClear
										onClick={ () => clearPushState( selectedSite.id, connectedSite.id ) }
									>
										{ pushState.status.message }
									</SyncPullPushClear>
								) }
								{ ! isPulling &&
									! hasPullFinished &&
									! isPullError &&
									! isPushError &&
									! isPushing &&
									! hasPushFinished && (
										<Tooltip
											disabled={ ! isOffline }
											icon={ offlineIcon }
											text={ __( 'Pulling or pushing a site requires an internet connection.' ) }
											placement="top-start"
										>
											<div className="flex gap-2 pl-4 ml-auto shrink-0 h-5">
												{ isAnySiteSyncing ? (
													<Tooltip
														text={
															isAnyConnectedSiteSyncing
																? __(
																		'This Studio site is syncing. Please wait for the sync to finish before you pull it.'
																  )
																: __(
																		'Another Studio site is syncing. Please wait for the sync to finish before you pull this site.'
																  )
														}
														placement="top-start"
													>
														<Button variant="link" disabled={ true }>
															<Icon icon={ cloudDownload } />
															{ __( 'Pull' ) }
														</Button>
													</Tooltip>
												) : (
													<DynamicTooltip
														getTooltipText={ () =>
															getLastSyncTimeText( connectedSite.lastPullTimestamp, 'pull' )
														}
														placement="top-start"
														disabled={ isOffline }
													>
														<Button
															variant="link"
															className={ cx(
																! isOffline &&
																	! isAnySitePulling &&
																	! isAnySitePushing &&
																	'!text-black hover:!text-a8c-blueberry'
															) }
															onClick={ () => {
																const detail = connectedSite.isStaging
																	? __(
																			"Pulling will replace your Studio site's files and database with a copy from your staging site."
																	  )
																	: __(
																			"Pulling will replace your Studio site's files and database with a copy from your production site."
																	  );
																showPullConfirmation(
																	() => pullSite( connectedSite, selectedSite ),
																	{ detail }
																);
															} }
															disabled={ isAnySiteSyncing || isOffline }
														>
															<Icon icon={ cloudDownload } />
															{ __( 'Pull' ) }
														</Button>
													</DynamicTooltip>
												) }
												{ isAnySiteSyncing ? (
													<Tooltip
														text={
															isAnyConnectedSiteSyncing
																? __(
																		'This Studio site is syncing. Please wait for the sync to finish before you push it.'
																  )
																: __(
																		'Another Studio site is syncing. Please wait for the sync to finish before you push this site.'
																  )
														}
														placement="top-start"
													>
														<Button variant="link" disabled={ true }>
															<Icon icon={ cloudUpload } />
															{ __( 'Push' ) }
														</Button>
													</Tooltip>
												) : (
													<DynamicTooltip
														getTooltipText={ () =>
															getLastSyncTimeText( connectedSite.lastPushTimestamp, 'push' )
														}
														placement="top-start"
														disabled={ isOffline }
													>
														<Button
															variant="link"
															className={ cx(
																! isOffline &&
																	! isAnySitePulling &&
																	! isAnySitePushing &&
																	'!text-black hover:!text-a8c-blueberry'
															) }
															onClick={ () => handlePushSite( connectedSite ) }
															disabled={ isAnySiteSyncing || isOffline }
														>
															<Icon icon={ cloudUpload } />
															{ __( 'Push' ) }
														</Button>
													</DynamicTooltip>
												) }
											</div>
										</Tooltip>
									) }
							</div>
						</div>
					);
				} ) }
		</div>
	);
};

export function SyncConnectedSites( {
	connectedSites,
	openSitesSyncSelector,
	disconnectSite,
	selectedSite,
}: {
	connectedSites: SyncSite[];
	openSitesSyncSelector: OpenSitesSyncSelector;
	disconnectSite: ( id: number ) => void;
	selectedSite: SiteDetails;
} ) {
	const siteSections: ConnectedSiteSection[] = useMemo( () => {
		const siteSections: ConnectedSiteSection[] = [];
		const processedSites = new Set< number >();

		connectedSites.forEach( ( connectedSite ) => {
			if ( processedSites.has( connectedSite.id ) ) {
				return; // Skip if we've already processed this site
			}

			const section: ConnectedSiteSection = {
				id: connectedSite.id,
				name: connectedSite.name,
				provider: 'wpcom',
				connectedSites: [ connectedSite ],
			};

			processedSites.add( connectedSite.id );

			if ( connectedSite.stagingSiteIds ) {
				for ( const id of connectedSite.stagingSiteIds ) {
					const stagingSite = connectedSites.find( ( site ) => site.id === id );
					if ( stagingSite ) {
						section.connectedSites.push( stagingSite );
						processedSites.add( stagingSite.id );
					}
				}
			}

			siteSections.push( section );
		} );

		return siteSections;
	}, [ connectedSites ] );

	return (
		<div className="flex flex-col flex-1 pt-8 overflow-y-auto">
			{ siteSections.map( ( section ) => (
				<SyncConnectedSitesSection
					key={ section.id }
					section={ section }
					selectedSite={ selectedSite }
					disconnectSite={ disconnectSite }
					openSitesSyncSelector={ openSitesSyncSelector }
				/>
			) ) }
		</div>
	);
}
