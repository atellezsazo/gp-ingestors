'use strict';

const structure_template = (`
<header>
    <div class="extra-header">
        <div class="context">{{{category}}}</div>
        <div class="extra-header-right">
            <span class="date-published">{{{published}}}</span>
        </div>
    </div>
    <h1>{{ title }}</h1>
</header>
<section class="main-image">
    <img data-libingester-asset-id="{{ main_image.asset_id }}">
</section>
<section class="body">
    {{{ body }}}
</section>
`);

const template_gallery = (`
<header>
    <div class="extra-header">
        <div class="extra-header-right">
            <span class="date-published">{{{published}}}</span>
        </div>
    </div>
    <h1>{{ title }}</h1>
</header>
<section class="body">
    <div class="gallery">
    {{#gallery}}
        <img class="gallery-item" data-libingester-asset-id="{{image.asset_id}}">
    {{/gallery}}
    </div>
</section>
`);

exports.structure_template = structure_template;
exports.template_gallery = template_gallery;
