'use strict';

const structure_template = (`
<section class="title">
    <h1>{{ title }}</h1>
    <h2>{{ additional_name }}</h2>
</section>
<section class="main-image">
    <img data-libingester-asset-id="{{ asset_id }}">
    {{{ image_description }}}
</section>
<section class="info-artist">
    {{{ info }}}
</section>
{{#description}}
<section class="description">
    {{{ description }}}
</section>
{{/description}}
{{#workarts.0}}
<section class="workarts">
    <h1>ARTWORKS</h1>
    <ul>
        {{#workarts}}
        <li>
            <span class="title">{{{ title }}}</span>
            <span class="year">{{ year }}</span>
            <img data-libingester-asset-id="{{ asset.asset_id }}">
        </li>
        {{/workarts}}
    <ul>
</section>
{{/workarts.0}}
`);


exports.structure_template = structure_template;