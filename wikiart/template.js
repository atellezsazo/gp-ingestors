'use strict';

const structure_template = (`
<section class="title">
    <h1>{{ title }}</h1>
</section>
<section class="main-image">
    <img data-libingester-asset-id="{{asset_id}}">
</section>
<section class="body">
    {{{ body }}}
</section>
<section class="artist-image">
	<h2>Artworks</h2>
	{{#image_gallery}}
	<div>
	<p>{{title}} - {{year}}</p>
	<img data-libingester-asset-id="{{asset_id}}">
	</div>
	{{/image_gallery}}
</section>`);

exports.structure_template = structure_template;
