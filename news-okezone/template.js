'use strict';

const structure_template = (`
<section class="title">
    <h1>{{{ title }}}</h1>
    <div class="date">{{{ date }}}</div>
    <div class="reporter">{{{ reporter }}}</div>
</section>
<section class="main-image">
    <img data-libingester-asset-id="{{ main_image.asset_id }}">
    {{#image_description}}
    <p class="image-description">{{ image_description }}</p>
    {{/image_description}}
</section>
<section class="body">
    {{{ body_html }}}
</section>`);

exports.structure_template = structure_template;
