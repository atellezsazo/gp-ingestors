'use strict';

const structure_template = (`
<section class="title">
    <h1>{{ title }}</h1>
    <div class="article-entry">{{{ article_entry }}}</div>
</section>
<section class="main-image">
    <img data-libingester-asset-id="{{ main_image.asset_id }}">
    {{#image_credit}}
    <div class="image-credit">{{{ image_credit }}}</div>
    {{/image_credit}}
</section>
<section class="body">
    {{{ body }}}
</section>`);

exports.structure_template = structure_template;