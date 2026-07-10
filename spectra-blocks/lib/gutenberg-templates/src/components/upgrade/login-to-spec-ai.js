import { useCallback, useState, useRef } from '@wordpress/element';
import {
	ArrowSmallRightIcon,
	BoltIcon,
	GlobeAmericasIcon,
	SparklesIcon,
} from '@heroicons/react/24/outline';
import Button from './../reusable/button/button';
import { CheckCircleIcon, SpectraLogo, StLogo } from '../ui/icons';
import { apiFetch } from '@Helpers';
import { useDispatch } from '@wordpress/data';
import { STORE_KEY } from '../../store';
import { clearSessionStorage, getFromSessionStorage } from '../../utils/helpers';
import LoadingSpinner from '../reusable/loading-spinner/loading-spinner';
import { __ } from '@wordpress/i18n';
import { logError } from '../reusable/error-toast/handle-error';
import { getPopupAuthURL } from '../../utils/functions';
import useImportBlock from '../../hooks/use-import-block';
import { update_url } from '../../index.js';
const { images } = ast_block_template_vars;

const benefits = [
	{
		icon: CheckCircleIcon,
		text: __( 'Updated templates design library', 'ast-block-templates' ),
	},
	{
		icon: BoltIcon,
		text: __(
			'Free AI credits to create personalized content',
			'ast-block-templates'
		),
	},
	{
		icon: SparklesIcon,
		text: __(
			'Easily find stunning images for your website',
			'ast-block-templates'
		),
	},
	{
		icon: GlobeAmericasIcon,
		text: __(
			'Localized your website to any language',
			'ast-block-templates'
		),
	},
];

const LoginToSpecAi = () => {
	const { toggleSkipZipAIOnboarding, toggleConnectZipAI, setTokenStep } =
		useDispatch( STORE_KEY );
	const [ isLoading, setIsLoading ] = useState( false );

	const { initiateImportProcess } = useImportBlock( true );

	const saveSkipZipAIOnboarding = useCallback( async () => {
		if ( isLoading ) {
			return;
		}
		setIsLoading( true );

		const formData = new window.FormData();
		formData.append( 'action', 'ast_skip_zip_ai_onboarding' );
		formData.append(
			'security',
			ast_block_template_vars.skip_zip_ai_onboarding_nonce
		);

		try {
			const response = await apiFetch( {
				url: ast_block_template_vars.ajax_url,
				method: 'POST',
				body: formData,
			} );
			if ( response.success ) {
				toggleSkipZipAIOnboarding();
			} else {
				console.group( 'Onboarding Skip Failed!' );
				console.log( response );
				console.groupEnd();
			}
			if ( ! response.success ) {
				throw new Error( response.data );
			}
		} catch ( error ) {
			logError( error );
		} finally {
			setIsLoading( false );
		}
	}, [] );

	const handleGetStarted = async () => {
		await saveSkipZipAIOnboarding();
		openAuthPopup();
	};

	const openAuthPopup = () => {
		// Close any existing popup
		if ( popupRef.current && ! popupRef.current.closed ) {
			popupRef.current.close();
		}

		const width = 600;
		const height = 700;

		const left = Math.round(
			( window.screen.width - width ) / 2
		);
		const top = Math.round(
			( window.screen.height - height ) / 2
		);
		// Open authentication in popup window
		const popupUrl = getPopupAuthURL();
		popupRef.current = window.open(
			popupUrl,
			'zipwp_auth',
			`width=${ width },height=${ height },left=${ left },top=${ top },scrollbars=yes,resizable=yes`
		);

		// Start polling to check authentication status
		startPolling();
	};

	const startPolling = () => {
		// Clear any existing interval
		if ( pollIntervalRef.current ) {
			clearInterval( pollIntervalRef.current );
		}

		// Poll every 2 seconds to check authentication status
		pollIntervalRef.current = setInterval( checkAuthStatus, 3000 );
	};

	const checkAuthStatus = async () => {
		try {
			const response = await fetch( `${ ast_block_template_vars.ajax_url }?action=ast_block_templates_check_auth_status&_ajax_nonce=${ ast_block_template_vars._ajax_nonce }` );
			const data = await response.json();

			if ( data.success && data.data.is_authenticated ) {
				// Authentication successful
				cleanup();
				toggleConnectZipAI();
				const blockToImportKey = 'ast-import';
				const blockToImport = getFromSessionStorage( blockToImportKey );
				if ( ! blockToImport || ! data.data.auth_token ) {
					return clearSessionStorage( blockToImportKey );
				}
				setTokenStep( data.data.auth_token );
				const { blockId, blockType, blockPaletteSlug, pagePaletteSlug } =
					blockToImport;
				initiateImportProcess( {
					blockId,
					colorPalette:
						blockType === 'block' ? blockPaletteSlug : pagePaletteSlug,
					type: blockType,
				} );
				clearSessionStorage( blockToImportKey );
				update_url();
			}
		} catch ( error ) {
			console.error( 'Error checking auth status:', error );
		}

		// Check if popup was closed by user
		if ( popupRef.current && popupRef.current.closed ) {
			cleanup();
		}
	};

	const cleanup = () => {
		// Clear polling interval
		if ( pollIntervalRef.current ) {
			clearInterval( pollIntervalRef.current );
			pollIntervalRef.current = null;
		}

		// Close popup if still open
		if ( popupRef.current && ! popupRef.current.closed ) {
			popupRef.current.close();
		}
	};

	const popupRef = useRef( null );
	const pollIntervalRef = useRef( null );

	const handleClickLater = async () => {
		toggleConnectZipAI();
		clearSessionStorage( 'ast-import' );
		await saveSkipZipAIOnboarding();
	};

	const getLogo = useCallback( () => {
		if (
			'active' === ast_block_template_vars.astra_sites_status ||
			'active' === ast_block_template_vars.astra_sites_pro_status
		) {
			return <StLogo className="w-10 h-10" />;
		}
		return <SpectraLogo className="w-10 h-10" />;
	}, [] );

	return (
		<div
			className="relative h-full w-full"
			style={ {
				backgroundImage: `url('${ images }background.png')`,
			} }
		>
			<div className="spectra-ai absolute inset-0 grid grid-cols-1 grid-rows-1 place-items-center bg-background-tertiary/[0.85] backdrop-blur-[6px] z-[1]">
				<div className="p-10 flex flex-col gap-8 max-w-[560px] border border-solid border-border-primary rounded-lg shadow-small bg-white">
					<div className="space-y-5">
						<div className="space-y-2">
							{ getLogo() }
							<h4 className="text-[2rem] font-semibold leading-[2.625rem]">
								{ __(
									'Access Design Library',
									'ast-block-templates'
								) }
							</h4>
							<p className="text-base font-normal leading-6 text-body-text">
								{ __(
									'Get access to our library of hundreds of pixel-perfect, designer-made templates by creating a free account on ZipWP.',
									'ast-block-templates'
								) }{ ' ' }
								<br />
								<span>
									{ __(
										'Plus, you will get these extra benefits:',
										'ast-block-templates'
									) }
								</span>
							</p>
						</div>
						<ul className="!space-y-4">
							{ benefits.map( ( benefit, index ) => (
								<li
									key={ index }
									className="m-0 flex gap-3 items-center justify-start"
								>
									<benefit.icon className="w-5 h-5 text-accent-spectra stroke-2" />
									<p className="text-zip-app-heading text-base font-medium leading-6 m-0">
										{ benefit.text }
									</p>
								</li>
							) ) }
						</ul>
					</div>
					<div className="flex flex-col md:flex-row flex-nowrap md:flex-wrap justify-start items-center gap-2">
						<Button
							variant="primary"
							hasSuffixIcon
							className="w-full md:w-fit min-w-[10.25rem]"
							onClick={ handleGetStarted }
						>
							{ isLoading ? (
								<LoadingSpinner />
							) : (
								<>
									<span>Get Started</span>
									<ArrowSmallRightIcon className="w-6 h-6" />
								</>
							) }
						</Button>
						<Button
							variant="link"
							className="text-secondary-text w-full md:w-fit min-w-[5rem]"
							onClick={ handleClickLater }
						>
							{ __( 'Cancel', 'ast-block-templates' ) }
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default LoginToSpecAi;
