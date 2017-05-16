'use strict';

const gallery_structure_template = (`
<section class="header">
    <div class="extra-header">
        <div class="extra-header-right">
            <span class="author">{{author}}</span> 
            <span class="date-published">{{date_published}}</span>
        </div>
    </div>
    <h1>{{ title }}</h1>
</section>
{{#images.0}}
<section class="images">
    {{#images}}
    <img data-libingester-asset-id="{{ asset_id }}">
    {{/images}}
</section>
{{/images.0}}
<section class="body">
    {{{ body }}}
</section>
`);

exports.gallery_structure_template = gallery_structure_template;