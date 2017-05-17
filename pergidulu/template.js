'use strict';

const structure_template = (`
<header>
    <div class="extra-header">
        <div class="context">{{{category}}}</div>
        <div class="extra-header-right">{{author}} &#x2022; <span class="date-published">{{date}}</span></div>
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

exports.structure_template = structure_template;