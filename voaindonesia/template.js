'use strict';

const structure_template = (`
<header>
    <h1>{{ title }}</h1>
    {{{ category }}}
    {{{ authors }}}
    {{{ published }}}
</header>
{{#main_img}}
<section class="main-image">
    <img data-libingester-asset-id="{{ main_img.asset_id }}">
    <p class="caption-image">{{ image_description }}</p>
</section>
{{/main_img}}
<section class="body">
    {{{ body }}}
</section>
`);

exports.structure_template = structure_template;
