'use strict';

const gallery_structure_template = (`
<section class="title">
    <h1>{{ title }}</h1>
    <div class="date">{{{ date }}}</div>
    <div class="references">{{{ references }}}</div>
</section>
{{#images.0}}
<section class="images">
    {{#images}}
    <img data-libingester-asset-id="{{ asset_id }}">
    {{/images}}
</section>
{{/images.0}}
<section class="body">
    {{{ body_html }}}
</section>`);

exports.gallery_structure_template = gallery_structure_template;