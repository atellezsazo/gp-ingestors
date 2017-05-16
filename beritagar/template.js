'use strict';

const structure_template = (`
<header>
    <div class="extra-header">
        <div class="context">{{{category}}}</div>
        <div class="extra-header-right">
            <span class="author">{{{author}}}</span>
            <span class="dot"> • </span>
            <span class="date-published">{{{published}}}</span>
        </div>
    </div>
    <h1>{{ title }}</h1>
</header>
<section class="body">
    {{{ article_subtitle }}}
    {{#bg_img}}
        <figure class="bg-img">
        <img data-libingester-asset-id="{{ bg_img.asset_id }}">
        </figure>
    {{/bg_img}}
    {{{ body }}}
</section>
`);

exports.structure_template = structure_template;
