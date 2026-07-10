<?php
/**
 * View for rendering the block.
 *
 * @since 3.0.0
 * @package Spectra\Blocks\SliderChild
 */

use SpectraBlocks\Helpers\HtmlSanitizer;
use SpectraBlocks\Helpers\Renderer;

?>

<div <?php echo wp_kses_data( $wrapper_attributes ); ?>>
	<?php
		// Render the background video element if needed.
		Renderer::background_video( $background );
	?>
	<div class="slide-content">
		<?php HtmlSanitizer::render( $content ); ?>
	</div>
</div>
