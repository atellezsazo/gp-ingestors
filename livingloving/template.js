'use strict';

const structure_template = (`
<style>
    {{{style}}}
</style>
<header>
    <div class="extra-header">
        <div class="context">{{{category}}}</div>
        <div class="extra-header-right">{{author}} &#x2022; <span class="date-published">{{date_published}}</span></div>
    </div>
    <h1>{{ title }}</h1>
</header>
<section class="main-image">
    <img data-libingester-asset-id="{{ main_image.asset_id }}">
    {{#image_credit}}
    <div class="image-credit">{{ image_credit }}</div>
    {{/image_credit}}
</section>
<main class="main">
    {{{ body }}}
    {{#post_tags}}
    <div class="post-tags">{{{ post_tags }}}</div>
    {{/post_tags}}
    <div class="sources">
        <div class="app-logo"><p>{{app_name}}</p></div>
        <div class="source"><p class="page-link"><a href="http://www.livingloving.net/">Original Article at www.livingloving.net</a></p></div>
    </div>
</main>
`);

exports.structure_template = structure_template;
