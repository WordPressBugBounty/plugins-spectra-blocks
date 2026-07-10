import { compose } from '@wordpress/compose';
import {
	useSelect,
	withSelect,
	withDispatch,
	useDispatch,
} from '@wordpress/data';
import {
	useState,
	memo,
	isValidElement,
	cloneElement,
} from '@wordpress/element';
import Button from '../button/button';
import LoadingSpinner from '../loading-spinner/loading-spinner';
import { install_plugin, activate_plugin } from '../../../utils/plugins';
import { PHP } from '../../../utils/serialize';
import { block_api_request } from '../../../utils/rest-api';
import { savePostIfSpectraInactive } from '../../../utils/functions';
import { PlusIcon } from '@heroicons/react/24/outline';
import {
	callAll,
	classNames,
	getSpectraStatus,
	manipulateAttributeBlockId,
	setToSessionStorage,
	findInsertTarget,
} from '../../../utils/helpers';
import { toast } from 'react-toastify';
import toaster from '../toaster';
import { STORE_KEY } from '../../../store/index';
import { __, sprintf } from '@wordpress/i18n';
import licensePopup from '../license/license-popup';
import useLicense from '../../../hooks/use-license';

const { post } = wp.ajax;
const { parse } = wp.blocks;
const { bypassAuth } = ast_block_template_vars;

const ImportBlockButton = ( {
	onImportFail,
	setImportItemInfo,
	requiredPlugins,
	importItemInfo,
	title,
	btnClass,
	insertBlocks,
	getSelectedBlockClientId,
	canInsertBlockType,
	getBlockRootClientId,
	onSetTogglePopup,
	item,
	onClick,
	onBlockImport,
	activeBlockPaletteSlug,
	activePagePaletteSlug,
	currentScreen,
	disableAI,
	importing = false,
	adaptiveMode,
	showIcon = true,
	children,
	isLocked,
} ) => {
	let [ blockInfo ] = useState( importItemInfo );
	let AllRequiredPlugins = requiredPlugins ? requiredPlugins : [];
	const buttonClass = btnClass ? btnClass : '';
	const buttonTitle = title ? title : __( 'Import', 'ast-block-templates' );
	const { licenseStatus } = useLicense();

	const { index } = wp.data
		.select( 'core/block-editor' )
		.getBlockInsertionPoint();
	const {
		importInProgress,
		syncLibNotice,
		stepData: { token },
	} = useSelect( ( select ) => {
		const { getImportInProgress, getNotice, getAIStepData } =
			select( STORE_KEY );
		return {
			importInProgress: getImportInProgress(),
			syncLibNotice: getNotice(),
			stepData: getAIStepData(),
		};
	}, [] );

	const { setImportInProgress, toggleConnectZipAI, setNotice } =
		useDispatch( STORE_KEY );
	const disableImport = syncLibNotice?.type === 'info',
		spectraPluginStatus = getSpectraStatus();

	const importNotice = ( noticeTitle, noticeMessage, noticeType ) => {
		toast(
			toaster( {
				title: noticeTitle,
				message: noticeMessage,
			} ),
			toaster.getOptions( { type: noticeType } )
		);
	};

	const install_forms = async ( { slug, init, name } ) => {
		try {
			setNotice( {
				type: 'import-info',
				// translators: 1. Plugin name.
				message: sprintf( __( 'Installing %s plugin…', 'ast-block-templates' ), name ),
			} );
			await install_plugin( { slug, init, name } );
			await activate_forms( { slug, init, name } );
		} catch ( error ) {
			setImportInProgress( false );
			importNotice(
				__( 'Import failed!', 'ast-block-templates' ),
				// translators: 1. Plugin name.
				sprintf( __( '%s installation failed!', 'ast-block-templates' ), name ),
				'error'
			);
		}
	};

	const activate_forms = async ( { slug, init, name } ) => {
		try {
			setNotice( {
				type: 'import-info',
				// translators: 1. Plugin name.
				message: sprintf( __( 'Activating %s plugin…', 'ast-block-templates' ), name ),
			} );
			await activate_plugin( { slug, init, name } );
			await start_import_process( { pageRefresh: true } );
		} catch ( error ) {
			setImportInProgress( false );
			importNotice(
				__( 'Import failed!', 'ast-block-templates' ),
				// translators: 1. Plugin name.
				sprintf( __( '%s activation failed!', 'ast-block-templates' ), name ),
				'error'
			);
		}
	};

	const import_forms = ( formType, args = {} ) => {
		post( {
			action: `ast_block_templates_import_${ formType }`,
			id: blockInfo?.id,
			_ajax_nonce: ast_block_template_vars._ajax_nonce,
		} )
			.done( () => {
				// Import block.
				import_block( args );
			} )
			.fail( ( error ) => {
				setImportInProgress( false );
				importNotice(
					__( 'Import failed!', 'ast-block-templates' ),
					sprintf(
						// translators: 1. Form Name, 2. Error message.
						__( '%1$s Error: %2$s!', 'ast-block-templates' ),
						formType === 'wpforms' ? 'WPForms' : 'SureForms',
						error?.message?.error || error?.message || error
					),
					'error'
				);
			} );
	};

	const import_block = ( { pageRefresh = false } ) => {
		const content = blockInfo.original_content;
		const blockType =
			'all-blocks-grid' === currentScreen ? 'block' : 'page';
		const category =
			'block' === blockType
				? blockInfo[ 'blocks-category' ][ 0 ]
				: blockInfo[ 'pages-category' ][ 0 ];
		const id = blockInfo?.id;

		post( {
			action: 'ast_block_templates_import_block',
			content,
			category,
			id,
			_ajax_nonce: ast_block_template_vars._ajax_nonce,
			style:
				'all-blocks-grid' === currentScreen
					? activeBlockPaletteSlug
					: activePagePaletteSlug,
			disableAI,
			block_type: blockType,
			adaptive_mode: adaptiveMode,
		} )
			.done( ( contentResponse ) => {
				setImportInProgress( false );

				// Manipulate attribute block id.
				const manipulatedBlocks = manipulateAttributeBlockId(
					parse( contentResponse )
				);

				// Importing into the selected block.
				const selectedBlockClientId = getSelectedBlockClientId() ?? '';
				const insertTarget = findInsertTarget( manipulatedBlocks, selectedBlockClientId, canInsertBlockType, getBlockRootClientId );

				if ( insertTarget === false ) {
					return;
				}

				insertBlocks( manipulatedBlocks, index, insertTarget, false );

				scrollBlockToView( manipulatedBlocks[ 0 ].clientId );

				onSetTogglePopup();
				document
					.getElementById( 'ast-block-templates-modal-wrap' )
					.classList.remove( 'open' );
				document.body.classList.remove(
					'ast-block-templates-modal-open'
				);

				if (
					pageRefresh ||
					spectraPluginStatus.inactive ||
					spectraPluginStatus.notInstalled
				) {
					savePostIfSpectraInactive();
				}

				// On block import callback.
				if ( 'function' === typeof onBlockImport ) {
					onBlockImport( contentResponse, index );
				}
			} )
			.fail( () => {
				setImportInProgress( false );
				onImportFail();
				importNotice(
					'Import failed!',
					'Failed to import the block. Please try again later or contact support for assistance.',
					'error-import'
				);
			} );
	};

	const scrollBlockToView = ( clientId ) => {
		if ( ! clientId ) {
			return;
		}

		setTimeout( () => {
			const currentDocument = getCurrentDocument();
			const getFirstImpotedBlock = 'block-' + clientId;
			const selectedBlockElementToScroll =
				currentDocument.getElementById( getFirstImpotedBlock );

			if ( selectedBlockElementToScroll ) {
				selectedBlockElementToScroll.scrollIntoView( {
					behavior: 'smooth',
					block: 'center',
					inline: 'center',
				} );
			}
		}, 2500 );
	};

	const getCurrentDocument = () => {
		const tabletPreview =
			document.getElementsByClassName( 'is-tablet-preview' );
		const mobilePreview =
			document.getElementsByClassName( 'is-mobile-preview' );
		if ( 0 !== tabletPreview.length || 0 !== mobilePreview.length ) {
			const preview = tabletPreview[ 0 ] || mobilePreview[ 0 ];

			let iframe = false;

			if ( preview ) {
				iframe = preview.getElementsByTagName( 'iframe' )[ 0 ];
			}

			const iframeDocument =
				iframe?.contentWindow.document || iframe?.contentDocument;
			if ( iframeDocument ) {
				return iframeDocument;
			}
		}

		return document;
	};

	const start_import_process = ( args = {} ) => {
		// Import WP Forms.
		// 1. import wp forms or sure forms if exist
		// 2. import block

		const wpformsUrl =
			blockInfo?.[ 'post-meta' ]?.[ 'astra-site-wpforms-path' ] || '';
		const sureformsUrl =
			blockInfo?.[ 'post-meta' ]?.[ 'astra-site-sureforms-path' ] || '';

		const unserializedBlockPlugins = blockInfo?.[ 'post-meta' ]?.[
			'astra-blocks-required-plugins'
		];
		const blockPlugins = unserializedBlockPlugins ? PHP.parse( unserializedBlockPlugins ) : [];

		if ( wpformsUrl && blockPlugins?.find( ( plugin ) => plugin?.slug === 'wpforms-lite' ) ) {
			import_forms( 'wpforms', args );
		} else if ( sureformsUrl && blockPlugins?.find( ( plugin ) => plugin?.slug === 'sureforms' ) ) {
			import_forms( 'sureforms', args );
		} else {
			import_block( args );
		}
	};

	const addBlockToQueueForImport = () => {
		// Set the pattern/page id to session storage for import process.
		setToSessionStorage( 'ast-import', {
			blockId: item.ID,
			blockType: item.type,
			blockPaletteSlug: activeBlockPaletteSlug,
			pagePaletteSlug: activePagePaletteSlug,
			accessType: item?.[ 'astra-sites-type' ] || 'free',
		} );
	};

	const handleBlockImport = async ( event ) => {
		if ( importInProgress || disableImport ) {
			return;
		}

		if ( 'function' === typeof onClick ) {
			const result = onClick( event );
			// If onClick returns false, stop the import process
			if ( result === false ) {
				return;
			}
		}

		setImportInProgress( true );

		block_api_request( item.ID, 'astra-blocks' )
			.then( ( data ) => {
				setImportItemInfo( data );

				/**
				 * @todo Set state and use callback function.
				 * Avoid `blockInfo = data` and try to use `setBlockInfo(data)`
				 */
				// setBlockInfo(data);
				blockInfo = data;

				AllRequiredPlugins = data?.[ 'post-meta' ]?.[
					'astra-blocks-required-plugins'
				]
					? PHP.parse(
							data[ 'post-meta' ][
								'astra-blocks-required-plugins'
							]
					  )
					: [];

				if ( AllRequiredPlugins.length ) {
					const formPlugins = [
						{
							slug: 'wpforms-lite',
							init: 'wpforms-lite/wpforms.php',
							name: 'WPForms Lite',
							status: ast_block_template_vars.wpforms_status,
						},
						{
							slug: 'sureforms',
							init: 'sureforms/sureforms.php',
							name: 'SureForms',
							status: ast_block_template_vars.sureforms_status,
						},
					];

					formPlugins.forEach( ( plugin ) => {
						if ( AllRequiredPlugins?.find( ( p ) => p?.slug === plugin.slug ) ) {
							if ( plugin.status === 'not-installed' ) {
								install_forms( plugin );
							} else if ( plugin.status === 'inactive' ) {
								activate_forms( plugin );
							} else {
								start_import_process();
							}
						}
					} );
				} else {
					start_import_process();
				}
			} )
			.catch( ( err ) => {
				importNotice( 'Import failed!', err, 'error-import' );
				setImportInProgress( false );
				onImportFail();
			} );
	};

	const handleOpenAIAuth = async () => {
		if ( isLocked && licenseStatus !== 'active' ) {
			licensePopup.show();
			return;
		}

		toggleConnectZipAI();
		addBlockToQueueForImport();
	};

	const renderButton = () => {
		if ( children && typeof children === 'function' ) {
			return children( {
				onClick:
					token || bypassAuth ? handleBlockImport : handleOpenAIAuth,
				importInProgress,
				disableImport,
			} );
		}

		if (
			children &&
			typeof children === 'object' &&
			isValidElement( children )
		) {
			return cloneElement( children, {
				...( children?.props ?? {} ),
				importInProgress,
				disableImport,
				onClick: callAll(
					children?.props?.onClick,
					token || bypassAuth ? handleBlockImport : handleOpenAIAuth
				),
			} );
		}

		return (
			<Button
				className={ classNames(
					'min-w-fit h-7 hover:shadow-small sp-text-sm px-3',
					buttonClass,
					( ( importInProgress && ! importing ) || disableImport ) &&
						'opacity-50 cursor-not-allowed'
				) }
				type="button"
				variant="primary"
				onClick={
					token || bypassAuth ? handleBlockImport : handleOpenAIAuth
				}
				isSmall
				hasPrefixIcon={ ! importing && showIcon }
			>
				{ importing ? (
					<LoadingSpinner className="size-4 !shrink-0" />
				) : (
					<>
						<PlusIcon className="size-4 !shrink-0 inline sm:hidden" />
						<span className="truncate hidden sm:inline">
							{ buttonTitle }
						</span>
					</>
				) }
			</Button>
		);
	};

	return renderButton();
};

export default compose(
	withSelect( ( select ) => {
		const {
			getImportItemInfo,
			getCurrentScreen,
			getSitePreview,
			getActiveBlockPaletteSlug,
			getActivePagePaletteSlug,
			getDisableAi,
			getAdaptiveMode,
		} = select( 'ast-block-templates' );
		return {
			importItemInfo: getImportItemInfo(),
			sitePreview: getSitePreview(),
			currentScreen: getCurrentScreen(),
			activeBlockPaletteSlug: getActiveBlockPaletteSlug(),
			activePagePaletteSlug: getActivePagePaletteSlug(),
			disableAI: getDisableAi(),
			adaptiveMode: getAdaptiveMode(),
		};
	} ),
	withDispatch( ( dispatch ) => {
		const { setImportItemInfo, setTogglePopup, setOnboardingAiPopup } =
			dispatch( 'ast-block-templates' );
		const { insertBlocks } = wp.data.dispatch( 'core/block-editor' );
		const { getSelectedBlockClientId, canInsertBlockType, getBlockRootClientId } = wp.data.select( 'core/block-editor' );
		return {
			setImportItemInfo,
			onSetTogglePopup: setTogglePopup,
			insertBlocks,
			getSelectedBlockClientId,
			canInsertBlockType,
			getBlockRootClientId,
			setOnboardingAiPopup,
		};
	} )
)( memo( ImportBlockButton ) );
