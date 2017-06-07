'use strict';

const article_template = (`
<header>
    <div class="extra-header">
        <div class="extra-header-right">
            <span class="author">{{author}}</span>
            <span class="dot"> • </span>
            <span class="date-published">{{{published}}}</span>
        </div>
    </div>
    <h1>{{ title }}</h1>
</header>
{{#main_image}}
<section class="main-image">
    <img data-libingester-asset-id="{{ main_image.asset_id }}">
</section>
{{/main_image}}
<section class="body">
    {{{ body }}}
</section>
<section class="footer">
    {{#post_tags}}
    <div class="post-tags">{{{ post_tags }}}</div>
    {{/post_tags}}
</section>
`);

const gallery_template = (`
<header>
    <div class="extra-header">
        <div class="extra-header-right">
            <span class="author">{{author}}</span>
            <span class="dot"> • </span>
            <span class="date-published">{{{published}}}</span>
        </div>
    </div>
    <h1>{{ title }}</h1>
</header>
<section class="body">
    {{{ body }}}
    {{#gallery}}
    <div class="gallery">
        <img class="gallery-item" data-libingester-asset-id="{{id}}">
    </div>
    {{/gallery}}
</section>
<section class="footer">
    {{#post_tags}}
    <div class="post-tags">{{{ post_tags }}}</div>
    {{/post_tags}}
</section>
`);

exports.article_template = article_template;
exports.gallery_template = gallery_template;
