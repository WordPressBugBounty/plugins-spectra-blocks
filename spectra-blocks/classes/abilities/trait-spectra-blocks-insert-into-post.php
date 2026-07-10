<?php
/**
 * Insert Into Post trait.
 *
 * Shared logic for inserting block markup into a post (replace, append, prepend).
 *
 * @package Spectra_Blocks
 * @since 0.0.9
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Trait Spectra_Blocks_Insert_Into_Post_Trait.
 *
 * @since 0.0.9
 */
trait Spectra_Blocks_Insert_Into_Post_Trait {

	/**
	 * Insert block markup into a post.
	 *
	 * @since 0.0.9
	 * @param int    $post_id Post ID.
	 * @param string $markup  Block markup.
	 * @param string $mode    Insert mode: 'replace', 'append', or 'prepend'.
	 * @return true|WP_Error
	 */
	protected function insert_into_post( $post_id, $markup, $mode ) {
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'post_not_found', __( 'Post not found.', 'spectra-blocks' ) );
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return new WP_Error( 'insufficient_permissions', __( 'Cannot edit this post.', 'spectra-blocks' ) );
		}

		$existing = $post->post_content;
		switch ( $mode ) {
			case 'replace':
				$content = $markup;
				break;
			case 'prepend':
				$content = $markup . "\n" . $existing;
				break;
			default:
				$content = $existing . "\n" . $markup;
				break;
		}

		$result = wp_update_post(
			array(
				'ID'           => $post_id,
				'post_content' => wp_slash( $content ),
			),
			true
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return true;
	}
}
