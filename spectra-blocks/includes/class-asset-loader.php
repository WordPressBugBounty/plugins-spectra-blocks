<?php
/**
 * Class to manage Spectra Blocks assets.
 *
 * @package Spectra
 */

namespace SpectraBlocks;

use SpectraBlocks\FontManager;
use SpectraBlocks\Traits\Singleton;
use SpectraBlocks\Helpers\Core;

defined( 'ABSPATH' ) || exit;

/**
 * Class to manage Spectra Blocks assets.
 *
 * @since 3.0.0
 */
class AssetLoader {

	use Singleton;

	/**
	 * Initializes the asset loader by setting up necessary components.
	 *
	 * @since 3.0.0
	 *
	 * @return void
	 */
	public function init() {
		$this->init_font_manager();
		// Register third-party handles early so block.json style deps resolve in all contexts (FSE, REST preview, etc.).
		add_action( 'init', array( $this, 'register_block_assets' ) );
		// Enqueue the common style assets on the frontend and editor as this is the only way to ensure that the styles are loaded in the editor and on the frontend.
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_common_style_assets' ) );
		add_action( 'enqueue_block_editor_assets', array( $this, 'enqueue_editor_assets' ) );
		add_action( 'wp_enqueue_scripts', array( $this, 'handle_frontend_assets' ) );
		add_action( 'enqueue_block_assets', array( $this, 'enqueue_extensions_frontend_assets' ) );

		// Load utility functions for GT integration.
		$this->load_gt_utils();
	}

	/**
	 * Initializes the Spectra Font Manager.
	 *
	 * @since 3.0.0
	 *
	 * @return void
	 */
	private function init_font_manager() {
		( FontManager::instance() )->init();
	}

	/**
	 * Load utility functions for Gutenberg Templates integration.
	 *
	 * @since 3.0.0
	 *
	 * @return void
	 */
	private function load_gt_utils() {
		if ( ! function_exists( 'spectra_get_v3_blocks_css_for_preview' ) ) {
			require_once SPECTRA_BLOCKS_DIR . 'includes/utils.php';
		}
	}

	/**
	 * Register all the styles from the '/src/styles' directory.
	 *
	 * @since 3.0.0
	 *
	 * @return void
	 */
	public function enqueue_common_style_assets() {
		$css_path  = SPECTRA_BLOCKS_DIR . 'build/styles/';
		$css_files = glob( $css_path . '**/*.css' ) ?? array();

		foreach ( $css_files as $css_file ) {
			// Get the parent directory name relative to built styles directory. For example, 'components'.
			$relative_path = str_replace( $css_path, '', $css_file );
			$style_type    = dirname( $relative_path );

			// Extract the file name without the extension and prepend with 'spectra-blocks-' and the directory name.
			$handle = 'spectra-blocks-' . trim( $style_type, '/' ) . '-' . basename( $css_file, '.css' );

			// Register the style.
			wp_register_style(
				$handle,
				plugins_url( 'build/styles/' . trim( $style_type, '/' ) . '/' . basename( $css_file ), SPECTRA_BLOCKS_FILE ),
				array(),
				SPECTRA_BLOCKS_VER
			);
		}
	}

	/**
	 * Register all the assets needed only in the editor.
	 *
	 * @since 3.0.0
	 *
	 * @return void
	 */
	public function enqueue_editor_assets() {
		// Register Swiper assets so the editor has access to the global Swiper object.
		$this->register_block_assets();

		// Load the common editor styles.
		$css_file = SPECTRA_BLOCKS_DIR . 'build/styles/editor.css';

		// Create the handle for the common editor styles.
		$handle = 'spectra-blocks-editor';

		// Register the common editor styles.
		wp_register_style(
			$handle,
			plugins_url( 'build/styles/editor.css', SPECTRA_BLOCKS_FILE ),
			array(),
			filemtime( $css_file )
		);

		// Enqueue the common editor styles.
		wp_enqueue_style( $handle );

		// Enqueue the common assets.
		$this->enqueue_common_style_assets();

		// Localize editor data for block JS.
		$this->localize_editor_data();
	}

	/**
	 * Localize spectra_blocks_info data for block editor scripts.
	 *
	 * @since 0.0.9
	 *
	 * @return void
	 */
	private function localize_editor_data() {
		$spectra_pro_status = 'inactive';
		if ( defined( 'SPECTRA_BLOCKS_PRO_VER' ) ) {
			$spectra_pro_status = 'active';
		}

		$icon_chunks = Core::backend_load_font_awesome_icons();
		$all_icons   = array_merge( ...$icon_chunks );

		$localize = array(
			'plugin_url'         => SPECTRA_BLOCKS_URL,
			'is_rtl'             => is_rtl() ? '1' : '',
			'spectra_pro_status' => $spectra_pro_status,
			'current_post_id'    => get_the_ID(),
			'home_url'           => home_url(),
			'ajax_url'           => admin_url( 'admin-ajax.php' ),
			'tablet_breakpoint'  => 1024,
			'mobile_breakpoint'  => 767,
			'wp_version'         => get_bloginfo( 'version' ),
			'uagb_svg_icons'     => $all_icons,
		);

		wp_add_inline_script(
			'wp-blocks',
			'var spectra_blocks_info = ' . wp_json_encode( $localize ) . ';',
			'before'
		);

		// Set wp.UAGBSvgIcons (array of icon name keys) and wp.uagb_icon_category_list
		// required by the icon-picker component.
		// array_merge() re-indexes integer-like keys ('0', '1'...) to PHP integers.
		// array_keys() would return those as integers, becoming JS numbers in wp.UAGBSvgIcons.
		// Number icons (e.g. '0') would then be falsy in JS, breaking icon || 'star' fallback.
		// Cast all keys to strings so icon names like "0" stay truthy in JavaScript.
		$icon_keys  = array_map( 'strval', array_keys( $all_icons ) );
		$categories = array();
		foreach ( $all_icons as $icon_data ) {
			if ( ! empty( $icon_data['custom_categories'] ) && is_array( $icon_data['custom_categories'] ) ) {
				foreach ( $icon_data['custom_categories'] as $cat_slug ) {
					if ( ! isset( $categories[ $cat_slug ] ) ) {
						$categories[ $cat_slug ] = array(
							'slug'  => $cat_slug,
							'title' => ucwords( str_replace( '-', ' ', $cat_slug ) ),
						);
					}
				}
			}
		}

		wp_add_inline_script(
			'wp-blocks',
			'wp.UAGBSvgIcons = ' . wp_json_encode( $icon_keys ) . '; ' .
			'wp.uagb_icon_category_list = ' . wp_json_encode( array_values( $categories ) ) . ';',
			'before'
		);
	}

	/**
	 * Register the Swiper assets.
	 *
	 * @since 3.0.0
	 *
	 * @return void
	 */
	public function register_block_assets() {
		// Register Swiper assets that can be used by blocks.
		wp_register_style(
			'spectra-blocks-swiper-style',
			SPECTRA_BLOCKS_URL . 'assets/css/swiper-bundle.min.css',
			array(),
			'12.1.3'
		);

		wp_register_script(
			'spectra-blocks-swiper-script',
			SPECTRA_BLOCKS_URL . 'assets/js/swiper-bundle.min.js',
			array(),
			'12.1.3',
			true
		);
		// Swiper 12 declares `const Swiper = ...` at the script's top level, which
		// is reachable only by bare-identifier lookup from other classic scripts.
		// ES modules (the slider block's editor + view bundles emitted with
		// --experimental-modules) cannot see that binding, so they read
		// `window.Swiper` and find `undefined` → `new Swiper(...)` throws
		// "is not a constructor" and the block's editor render crashes with the
		// "encountered an error" boundary. Pin Swiper onto `window` so it is
		// reachable from both module and classic contexts.
		wp_add_inline_script(
			'swiper-script',
			'window.Swiper = window.Swiper || (typeof Swiper !== "undefined" ? Swiper : undefined);',
			'after'
		);

		wp_register_script(
			'spectra-blocks-modal-script',
			SPECTRA_BLOCKS_URL . 'assets/js/modal-script.js',
			array(),
			SPECTRA_BLOCKS_VER,
			true
		);
	}

	/**
	 * Enqueue the frontend assets for the slider block.
	 *
	 * @since 3.0.0
	 *
	 * @return void
	 */
	public function enqueue_frontend_assets() {
		// Only enqueue if slider block is present.
		if ( has_block( 'spectra/slider' ) ) {
			wp_enqueue_style( 'spectra-blocks-swiper-style' );
			wp_enqueue_script( 'spectra-blocks-swiper-script' );
			wp_enqueue_script( 'spectra-blocks-modal-script' );
		}
	}

	/**
	 * Enqueue frontend assets for extensions.
	 *
	 * @since 3.0.0
	 *
	 * @return void
	 */
	public function enqueue_extensions_frontend_assets() {
		wp_enqueue_style( 'spectra-blocks-extensions-image-mask' );
		wp_enqueue_style( 'spectra-blocks-extensions-z-index' );
	}

	/**
	 * Handle all frontend asset registration and enqueuing.
	 *
	 * @since 3.0.0
	 *
	 * @return void
	 */
	public function handle_frontend_assets() {
		$this->register_block_assets();
		$this->enqueue_frontend_assets();
	}

	/**
	 * Get v3 blocks CSS for a specific post or all blocks.
	 *
	 * @since 3.0.0
	 *
	 * @param int $post_id Optional. Post ID to generate CSS for. If 0, generates CSS for all blocks.
	 * @return string Generated CSS content.
	 */
	public static function get_v3_css( $post_id = 0 ) {
		// Ensure utils are loaded.
		if ( ! function_exists( 'spectra_get_v3_blocks_css_for_preview' ) ) {
			require_once SPECTRA_BLOCKS_DIR . 'includes/utils.php';
		}

		return spectra_get_v3_blocks_css_for_preview( $post_id );
	}

	/**
	 * Create v3 blocks CSS stylesheet for Gutenberg Templates.
	 *
	 * @since 3.0.0
	 *
	 * @param int $post_id Optional. Post ID to generate CSS for.
	 * @return bool True on success, false on failure.
	 */
	public static function create_v3_stylesheet( $post_id = 0 ) {
		$v3_block_styles = self::get_v3_css( $post_id );

		if ( empty( $v3_block_styles ) || ! is_string( $v3_block_styles ) ) {
			return false;
		}

		$upload_dir = self::get_upload_dir_path();
		if ( empty( $upload_dir ) ) {
			return false;
		}

		$filename      = $post_id > 0 ? "spectra-blocks-{$post_id}.css" : 'spectra-blocks.css';
		$v3_cache_path = $upload_dir . $filename;

		$wp_filesystem = self::get_filesystem();
		if ( ! $wp_filesystem ) {
			return false;
		}

		return false !== $wp_filesystem->put_contents( $v3_cache_path, $v3_block_styles, FS_CHMOD_FILE );
	}

	/**
	 * Get the Spectra Blocks upload directory path.
	 *
	 * @since 0.0.9
	 *
	 * @return string Upload directory path with trailing slash, or empty string on failure.
	 */
	private static function get_upload_dir_path() {
		$wp_upload_dir = wp_upload_dir( null, false );

		if ( empty( $wp_upload_dir['basedir'] ) ) {
			return '';
		}

		$dir = trailingslashit( $wp_upload_dir['basedir'] ) . 'spectra-blocks/';

		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}

		return $dir;
	}

	/**
	 * Get the WP_Filesystem instance.
	 *
	 * @since 0.0.9
	 *
	 * @return \WP_Filesystem_Base|false Filesystem instance or false on failure.
	 */
	private static function get_filesystem() {
		global $wp_filesystem;

		if ( ! $wp_filesystem ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			WP_Filesystem();
		}

		return $wp_filesystem ? $wp_filesystem : false;
	}
}
