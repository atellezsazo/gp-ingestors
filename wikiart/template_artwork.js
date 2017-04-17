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
</section>`);

exports.structure_template = structure_template;
