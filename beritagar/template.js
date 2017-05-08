'use strict';

const structure_template = (`
<header>
    <h1>{{ title }}</h1>
    {{{ article_header }}}
    {{{ article_tags }}}
    {{{ author }}}
    {{{ published }}}
</header>
<section class="body">
    {{{ article_subtitle }}}
    {{{ media_subtitle }}}
    {{#bg_img}}
    <figure class="bg-img">
    <img data-libingester-asset-id="{{ bg_img.asset_id }}">
    </figure>
    {{/bg_img}}
    {{#bg_img_video}}
    <figure class="bg-img-video">
    <img class="bg-img-video" data-libingester-asset-id="{{ bg_img_video.asset_id }}">
    </figure>
    {{/bg_img_video}}
    {{{ body }}}
</section>
`);

exports.structure_template = structure_template;
