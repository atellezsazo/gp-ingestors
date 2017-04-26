'use strict';

const structure_template = (`
<style>
    {{ style }}
</style>
<section class="title">
    <h1>{{ title }}</h1>
</section>
<section class="main-image">
    <img data-libingester-asset-id="{{asset_id}}">
    <p> {{ image_description }} </p>
</section>
<section class="info">
    {{{ info }}}
</section>
{{#description}}
<section class="description">
    {{{ description }}}
</section>
{{/description}}`);

exports.structure_template = structure_template;
