'use strict';

const structure_template = (`
<section class="title">
    <h1>{{ title }}</h1>
    {{{ by_line }}}
</section>

<section class="body">
{{#pages}}
    <div class="main-image">
        <img data-libingester-asset-id="{{ img.asset_id }}">
        {{#img_credit}}
        <div class="image-credit">{{{ img_credit }}}</div>
        {{/img_credit}}
    </div>
    {{#subtitle}}
        <h2 class="sub-title">{{{ subtitle }}}</div>
    {{/subtitle}}
    {{{ body }}}
{{/pages}}
</section>`);

exports.structure_template = structure_template;